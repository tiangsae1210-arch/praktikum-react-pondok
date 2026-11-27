require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool, neonConfig, types } = require("@neondatabase/serverless");
const fs = require("fs");
const path = require("path");

neonConfig.webSocketConstructor = require("ws");
types.setTypeParser(types.builtins.DATE, (value) => value);
types.setTypeParser(types.builtins.INT8, Number);
types.setTypeParser(types.builtins.NUMERIC, Number);

const app = express();
const port = Number(process.env.PORT || 4000);
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL Neon wajib diisi. Salin connection string PostgreSQL dari Neon ke file .env.");
}
function configuredFee(name, fallback) {
  const configured = process.env[name];
  const amount = configured === undefined || !configured.trim() ? fallback : Number(configured);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${name} harus berupa nominal nol atau lebih.`);
  }
  return amount;
}
const monthlyFeeItems = [
  { column: "syahriah", label: "Syahriyah", env: "SYAHRIAH_MONTHLY_FEE", amount: configuredFee("SYAHRIAH_MONTHLY_FEE", 382300) },
  { column: "diniyah", label: "Diniyah", env: "DINIYAH_MONTHLY_FEE", amount: configuredFee("DINIYAH_MONTHLY_FEE", 20000) },
  { column: "listrik_air_bersih", label: "Listrik & air bersih", env: "UTILITIES_MONTHLY_FEE", amount: configuredFee("UTILITIES_MONTHLY_FEE", 5000) },
  { column: "kebersihan_perlengkapan", label: "Kebersihan & perlengkapan", env: "CLEANING_MONTHLY_FEE", amount: configuredFee("CLEANING_MONTHLY_FEE", 2000) },
  { column: "haflah_syahriah", label: "Haflah (Syahriah)", env: "SYAHRIAH_HAFLAH_MONTHLY_FEE", amount: configuredFee("SYAHRIAH_HAFLAH_MONTHLY_FEE", 3000) },
  { column: "maklumat", label: "Maklumat", env: "MAKLUMAT_MONTHLY_FEE", amount: configuredFee("MAKLUMAT_MONTHLY_FEE", 50000) },
  { column: "modul_lks", label: "Modul LKS", env: "MODUL_LKS_MONTHLY_FEE", amount: configuredFee("MODUL_LKS_MONTHLY_FEE", 25000) },
  { column: "kegiatan_kesiswaan", label: "Kegiatan kesiswaan", env: "STUDENT_ACTIVITIES_MONTHLY_FEE", amount: configuredFee("STUDENT_ACTIVITIES_MONTHLY_FEE", 8500) },
  { column: "haflah_madrasah", label: "Haflah (Madrasah)", env: "MADRASAH_HAFLAH_MONTHLY_FEE", amount: configuredFee("MADRASAH_HAFLAH_MONTHLY_FEE", 4200) },
];
const monthlyFee = monthlyFeeItems.reduce((total, item) => total + item.amount, 0);
if (monthlyFee <= 0) throw new Error("Total tagihan bulanan harus lebih dari nol.");
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET wajib diisi dengan minimal 32 karakter. Salin .env.example menjadi .env dan isi konfigurasi sebelum menjalankan server.");
}

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

let pool;
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const fail = (status, message) => Object.assign(new Error(message), { status });
const today = () => new Date().toISOString().slice(0, 10);
const periodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function createDatabaseClient(client) {
  return {
    async execute(statement, values = []) {
      let parameter = 0;
      const placeholders = statement.replace(/\?/g, () => `$${++parameter}`);
      try {
        const result = await client.query(placeholders, values);
        if (result.command === "SELECT") return [result.rows, result.fields];
        const metadata = { affectedRows: result.rowCount };
        if (result.command === "INSERT") metadata.insertId = Number(result.rows[0]?.id || 0);
        return [metadata, result.fields];
      } catch (error) {
        if (error.code === "23505") error.code = "ER_DUP_ENTRY";
        throw error;
      }
    },
    query: (...args) => client.query(...args),
    beginTransaction: () => client.query("BEGIN"),
    commit: () => client.query("COMMIT"),
    rollback: () => client.query("ROLLBACK"),
    release: () => client.release(),
  };
}

function createDatabasePool(connectionString) {
  const postgresPool = new Pool({ connectionString, max: 10 });
  return {
    ...createDatabaseClient(postgresPool),
    getConnection: async () => createDatabaseClient(await postgresPool.connect()),
    close: () => postgresPool.end(),
  };
}

function billingPeriodsFrom(joinDate) {
  const year = Number(joinDate.slice(0, 4));
  const month = Number(joinDate.slice(5, 7)) - 1;
  return Array.from({ length: 12 }, (_, offset) => {
    const periodMonth = month + offset;
    return `${year + Math.floor(periodMonth / 12)}-${String((periodMonth % 12) + 1).padStart(2, "0")}`;
  });
}

function tokenCookie(res, token) {
  res.cookie("santri_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  });
}

const authenticated = asyncRoute(async (req, res, next) => {
  const token = req.cookies.santri_session;
  if (!token) throw fail(401, "Sesi berakhir. Silakan login kembali.");
  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    res.clearCookie("santri_session", { httpOnly: true, sameSite: "strict", path: "/" });
    throw fail(401, "Sesi berakhir. Silakan login kembali.");
  }
  const [admins] = await pool.execute(
    "SELECT id, name, username, email FROM admins WHERE id = ?",
    [claims.sub],
  );
  if (!admins.length) throw fail(401, "Akun admin tidak ditemukan.");
  req.admin = admins[0];
  next();
});

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || !username.trim() || typeof password !== "string" || !password) {
    throw fail(400, "Username/email dan password wajib diisi.");
  }
  const [rows] = await pool.execute(
    "SELECT id, password FROM admins WHERE username = ? OR email = ? LIMIT 1",
    [username.trim(), username.trim()],
  );
  const valid = rows.length && await bcrypt.compare(password, rows[0].password);
  if (!valid) throw fail(401, "Username atau password salah");
  const token = jwt.sign({ sub: rows[0].id }, process.env.JWT_SECRET, { expiresIn: "8h" });
  tokenCookie(res, token);
  res.json({ ok: true });
}));

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("santri_session", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", authenticated, (req, res) => res.json(req.admin));

app.put("/api/auth/account", authenticated, asyncRoute(async (req, res) => {
  const { name, username, email, currentPassword, newPassword, confirmPassword } = req.body || {};
  if (!name?.trim() || !username?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) {
    throw fail(400, "Nama, username, dan email valid wajib diisi.");
  }
  const [rows] = await pool.execute("SELECT password FROM admins WHERE id = ?", [req.admin.id]);
  const fields = [name.trim(), username.trim(), email.trim()];
  if (newPassword || currentPassword || confirmPassword) {
    if (!currentPassword || !(await bcrypt.compare(currentPassword, rows[0].password))) throw fail(400, "Password lama tidak benar.");
    if (typeof newPassword !== "string" || newPassword.length < 8) throw fail(400, "Password baru minimal 8 karakter.");
    if (newPassword !== confirmPassword) throw fail(400, "Konfirmasi password tidak sama.");
    fields.push(await bcrypt.hash(newPassword, 12));
  }
  try {
    await pool.execute(
      `UPDATE admins SET name = ?, username = ?, email = ?${fields.length === 4 ? ", password = ?" : ""} WHERE id = ?`,
      [...fields, req.admin.id],
    );
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw fail(409, "Username atau email sudah digunakan.");
    throw error;
  }
  const [updated] = await pool.execute("SELECT id, name, username, email FROM admins WHERE id = ?", [req.admin.id]);
  res.json(updated[0]);
}));

app.get("/api/santri", authenticated, asyncRoute(async (req, res) => {
  const search = String(req.query.search || "").slice(0, 100);
  const status = String(req.query.status || "");
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  const filters = [];
  const values = [];
  if (search) { filters.push("(nama LIKE ? OR nis LIKE ?)"); values.push(`%${search}%`, `%${search}%`); }
  if (["Aktif", "Tidak Aktif"].includes(status)) { filters.push("status = ?"); values.push(status); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM santri ${where}`, values);
  const [rows] = await pool.execute(
    `SELECT * FROM santri ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, (page - 1) * limit],
  );
  res.json({ rows, total, page, pages: Math.ceil(total / limit) });
}));

app.post("/api/santri", authenticated, asyncRoute(async (req, res) => {
  const student = validateStudent(req.body);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      "INSERT INTO santri (nis,nama,jenis_kelamin,kelas,asrama,no_hp_wali,alamat,tanggal_masuk,status) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id",
      studentValues(student),
    );
    if (student.status === "Aktif") {
      const feeColumns = monthlyFeeItems.map(({ column }) => column);
      const insertTagihan = `INSERT INTO tagihan (santri_id,periode,nominal,${feeColumns.join(",")}) VALUES (?,?,?,${feeColumns.map(() => "?").join(",")})`;
      const feeAmounts = monthlyFeeItems.map(({ amount }) => amount);
      for (const periode of billingPeriodsFrom(student.tanggal_masuk)) {
        await connection.execute(insertTagihan, [result.insertId, periode, monthlyFee, ...feeAmounts]);
      }
    }
    await connection.commit();
    const [rows] = await pool.execute("SELECT * FROM santri WHERE id = ?", [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") throw fail(409, "NIS sudah digunakan.");
    throw error;
  } finally { connection.release(); }
}));

app.put("/api/santri/:id", authenticated, asyncRoute(async (req, res) => {
  const student = validateStudent(req.body);
  try {
    const [result] = await pool.execute(
      "UPDATE santri SET nis=?,nama=?,jenis_kelamin=?,kelas=?,asrama=?,no_hp_wali=?,alamat=?,tanggal_masuk=?,status=? WHERE id=?",
      [...studentValues(student), req.params.id],
    );
    if (!result.affectedRows) throw fail(404, "Data santri tidak ditemukan.");
    const [rows] = await pool.execute("SELECT * FROM santri WHERE id = ?", [req.params.id]);
    res.json(rows[0]);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw fail(409, "NIS sudah digunakan.");
    throw error;
  }
}));

app.delete("/api/santri/:id", authenticated, asyncRoute(async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [students] = await connection.execute("SELECT id FROM santri WHERE id = ? FOR UPDATE", [req.params.id]);
    if (!students.length) throw fail(404, "Data santri tidak ditemukan.");
    await connection.execute(
      "DELETE FROM pembayaran p USING tagihan t WHERE t.id = p.tagihan_id AND t.santri_id = ?",
      [req.params.id],
    );
    await connection.execute("DELETE FROM tagihan WHERE santri_id = ?", [req.params.id]);
    await connection.execute("DELETE FROM santri WHERE id = ?", [req.params.id]);
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}));

app.get("/api/tagihan", authenticated, asyncRoute(async (req, res) => {
  const filters = [];
  const values = [];
  if (req.query.search) { filters.push("(s.nama LIKE ? OR s.nis LIKE ?)"); values.push(`%${String(req.query.search).slice(0, 100)}%`, `%${String(req.query.search).slice(0, 100)}%`); }
  if (req.query.periode && periodPattern.test(req.query.periode)) { filters.push("t.periode = ?"); values.push(req.query.periode); }
  if (["Belum Dibayar", "Belum Lunas", "Lunas"].includes(req.query.status)) { filters.push("t.status = ?"); values.push(req.query.status); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const [rows] = await pool.execute(
    `SELECT t.*, s.nama, s.nis, (SELECT MAX(p.tanggal_pembayaran) FROM pembayaran p WHERE p.tagihan_id=t.id) AS tanggal_bayar FROM tagihan t JOIN santri s ON s.id=t.santri_id ${where} ORDER BY t.periode DESC, s.nama`,
    values,
  );
  res.json(rows);
}));

app.post("/api/tagihan/generate", authenticated, asyncRoute(async (req, res) => {
  const { periode, nominal, santriId } = req.body || {};
  const amount = Number(nominal);
  if (!periodPattern.test(periode || "") || !Number.isFinite(amount) || amount <= 0) throw fail(400, "Periode dan nominal tagihan harus valid.");
  const students = santriId
    ? await pool.execute("SELECT id FROM santri WHERE id=? AND status='Aktif'", [santriId])
    : await pool.execute("SELECT id FROM santri WHERE status='Aktif'");
  if (!students[0].length) throw fail(400, "Tidak ada santri aktif yang sesuai.");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const student of students[0]) {
      await connection.execute(
        "INSERT INTO tagihan (santri_id,periode,nominal) VALUES (?,?,?)",
        [student.id, periode, amount],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") throw fail(409, "Sebagian atau seluruh santri sudah memiliki tagihan untuk periode ini. Tidak ada perubahan yang disimpan.");
    throw error;
  } finally { connection.release(); }
  res.status(201).json({ created: students[0].length });
}));

app.put("/api/tagihan/:id", authenticated, asyncRoute(async (req, res) => {
  const { nominal, periode } = req.body || {};
  const amount = Number(nominal);
  if (!periodPattern.test(periode || "") || !Number.isFinite(amount) || amount <= 0) throw fail(400, "Periode dan nominal tagihan harus valid.");
  const [rows] = await pool.execute(
    `SELECT total_dibayar,${monthlyFeeItems.map(({ column }) => column).join(",")} FROM tagihan WHERE id=?`,
    [req.params.id],
  );
  if (!rows.length) throw fail(404, "Tagihan tidak ditemukan.");
  const feeAmounts = monthlyFeeItems.map(({ column }) => rows[0][column]).filter((value) => value !== null);
  if (feeAmounts.length && amount !== feeAmounts.reduce((total, value) => total + Number(value), 0)) {
    throw fail(400, "Nominal tagihan terperinci harus sama dengan jumlah seluruh komponen biaya.");
  }
  if (amount < Number(rows[0].total_dibayar)) throw fail(400, "Nominal tidak boleh kurang dari total pembayaran.");
  try {
    await pool.execute("UPDATE tagihan SET nominal=?, periode=? WHERE id=?", [amount, periode, req.params.id]);
    await refreshBillStatus(req.params.id);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw fail(409, "Tagihan untuk periode tersebut sudah tersedia.");
    throw error;
  }
  const [updated] = await pool.execute("SELECT t.*,s.nama,s.nis FROM tagihan t JOIN santri s ON s.id=t.santri_id WHERE t.id=?", [req.params.id]);
  res.json(updated[0]);
}));

app.delete("/api/tagihan/:id", authenticated, asyncRoute(async (req, res) => {
  const [result] = await pool.execute("DELETE FROM tagihan WHERE id=? AND total_dibayar=0", [req.params.id]);
  if (!result.affectedRows) throw fail(409, "Tagihan sudah dibayar atau tidak ditemukan, sehingga tidak dapat dihapus.");
  res.json({ ok: true });
}));

app.get("/api/pembayaran", authenticated, asyncRoute(async (req, res) => {
  const filters = [];
  const values = [];
  if (req.query.month) {
    if (!periodPattern.test(req.query.month)) throw fail(400, "Filter bulan pembayaran tidak valid.");
    const [year, month] = req.query.month.split("-").map(Number);
    const start = `${req.query.month}-01`;
    const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    filters.push("p.tanggal_pembayaran >= ? AND p.tanggal_pembayaran < ?");
    values.push(start, nextMonth);
  }
  if (req.query.from) { filters.push("p.tanggal_pembayaran >= ?"); values.push(req.query.from); }
  if (req.query.to) { filters.push("p.tanggal_pembayaran <= ?"); values.push(req.query.to); }
  if (req.query.search) { filters.push("(s.nama LIKE ? OR s.nis LIKE ? OR p.kode_transaksi LIKE ?)"); const q = `%${String(req.query.search).slice(0, 100)}%`; values.push(q, q, q); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const [rows] = await pool.execute(
    `SELECT p.*, t.periode, t.nominal, ${monthlyFeeItems.map(({ column }) => `t.${column}`).join(", ")}, t.status AS status_tagihan, s.nama, s.nis FROM pembayaran p JOIN tagihan t ON t.id=p.tagihan_id JOIN santri s ON s.id=t.santri_id ${where} ORDER BY p.tanggal_pembayaran DESC,p.id DESC`,
    values,
  );
  res.json(rows);
}));

app.post("/api/pembayaran", authenticated, asyncRoute(async (req, res) => {
  const { tagihanId, jumlahBayar, tanggalPembayaran, metodePembayaran, keterangan = "" } = req.body || {};
  const amount = Number(jumlahBayar);
  if (!tagihanId || !Number.isFinite(amount) || amount <= 0) throw fail(400, "Pilih tagihan dan masukkan pembayaran lebih dari nol.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalPembayaran || "") || !["Tunai", "Transfer"].includes(metodePembayaran)) throw fail(400, "Tanggal dan metode pembayaran tidak valid.");
  const connection = await pool.getConnection();
  let code;
  try {
    await connection.beginTransaction();
    const [bills] = await connection.execute("SELECT * FROM tagihan WHERE id=? FOR UPDATE", [tagihanId]);
    if (!bills.length) throw fail(404, "Tagihan tidak ditemukan.");
    const bill = bills[0];
    const remainder = Number(bill.nominal) - Number(bill.total_dibayar);
    if (remainder <= 0) throw fail(400, "Tagihan sudah lunas.");
    if (amount > remainder) throw fail(400, "Pembayaran tidak boleh melebihi sisa tagihan.");
    code = `TRX-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
    await connection.execute(
      "INSERT INTO pembayaran (kode_transaksi,tagihan_id,tanggal_pembayaran,jumlah_bayar,metode_pembayaran,keterangan) VALUES (?,?,?,?,?,?)",
      [code, tagihanId, tanggalPembayaran, amount, metodePembayaran, String(keterangan).slice(0, 500)],
    );
    const total = Number(bill.total_dibayar) + amount;
    await connection.execute(
      "UPDATE tagihan SET total_dibayar=?, status=? WHERE id=?",
      [total, total >= Number(bill.nominal) ? "Lunas" : "Belum Lunas", tagihanId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  const [rows] = await pool.execute(
    `SELECT p.*,t.periode,t.nominal,${monthlyFeeItems.map(({ column }) => `t.${column}`).join(", ")},t.status AS status_tagihan,s.nama,s.nis FROM pembayaran p JOIN tagihan t ON t.id=p.tagihan_id JOIN santri s ON s.id=t.santri_id WHERE p.kode_transaksi=?`,
    [code],
  );
  res.status(201).json(rows[0]);
}));

app.get("/api/dashboard", authenticated, asyncRoute(async (_req, res) => {
  const month = today().slice(0, 7);
  const [[studentStats]] = await pool.execute("SELECT COUNT(*) AS active FROM santri WHERE status='Aktif'");
  const [[billStats]] = await pool.execute("SELECT COALESCE(SUM(nominal),0) AS billed FROM tagihan WHERE periode=?", [month]);
  const [[paymentStats]] = await pool.execute("SELECT COALESCE(SUM(jumlah_bayar),0) AS collected FROM pembayaran WHERE TO_CHAR(tanggal_pembayaran, 'YYYY-MM')=?", [month]);
  const [[arrearsStats]] = await pool.execute(
    "SELECT COALESCE(SUM(nominal-total_dibayar),0) AS arrears FROM tagihan WHERE status!='Lunas' AND periode<=?",
    [month],
  );
  const [recent] = await pool.execute(
    "SELECT p.kode_transaksi,p.tanggal_pembayaran,p.jumlah_bayar,p.metode_pembayaran,t.periode,s.nama,s.nis FROM pembayaran p JOIN tagihan t ON t.id=p.tagihan_id JOIN santri s ON s.id=t.santri_id ORDER BY p.tanggal_pembayaran DESC,p.id DESC LIMIT 6",
  );
  const [arrears] = await pool.execute(
    "SELECT s.nama,s.nis,t.periode,t.nominal-t.total_dibayar AS sisa FROM tagihan t JOIN santri s ON s.id=t.santri_id WHERE t.status!='Lunas' AND t.periode<=? ORDER BY t.periode,s.nama LIMIT 6",
    [month],
  );
  const [months] = await pool.execute(
    "SELECT m.month, COALESCE(b.amount,0) AS tagihan, COALESCE(p.amount,0) AS pembayaran FROM (SELECT TO_CHAR(CURRENT_DATE - n * INTERVAL '1 month', 'YYYY-MM') AS month FROM GENERATE_SERIES(0, 5) AS periods(n)) m LEFT JOIN (SELECT periode,SUM(nominal) amount FROM tagihan GROUP BY periode) b ON b.periode=m.month LEFT JOIN (SELECT TO_CHAR(tanggal_pembayaran, 'YYYY-MM') AS month,SUM(jumlah_bayar) amount FROM pembayaran GROUP BY month) p ON p.month=m.month ORDER BY m.month",
  );
  const [statuses] = await pool.execute("SELECT status,COUNT(*) AS jumlah FROM tagihan GROUP BY status");
  res.json({ activeStudents: studentStats.active, billed: billStats.billed, collected: paymentStats.collected, arrears: arrearsStats.arrears, recent, arrearsList: arrears, months, statuses });
}));

app.get("/api/reports", authenticated, asyncRoute(async (req, res) => {
  const filters = [];
  const values = [];
  if (req.query.from) { filters.push("p.tanggal_pembayaran >= ?"); values.push(req.query.from); }
  if (req.query.to) { filters.push("p.tanggal_pembayaran <= ?"); values.push(req.query.to); }
  if (req.query.month && periodPattern.test(req.query.month)) { filters.push("TO_CHAR(p.tanggal_pembayaran, 'YYYY-MM') = ?"); values.push(req.query.month); }
  if (req.query.year && /^\d{4}$/.test(req.query.year)) { filters.push("EXTRACT(YEAR FROM p.tanggal_pembayaran) = ?"); values.push(req.query.year); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const [payments] = await pool.execute(
    `SELECT p.kode_transaksi,p.tanggal_pembayaran,p.jumlah_bayar,p.metode_pembayaran,p.keterangan,t.periode,t.nominal,${monthlyFeeItems.map(({ column }) => `t.${column}`).join(", ")},s.nama,s.nis FROM pembayaran p JOIN tagihan t ON t.id=p.tagihan_id JOIN santri s ON s.id=t.santri_id ${where} ORDER BY p.tanggal_pembayaran DESC`,
    values,
  );
  const [bills] = await pool.execute(
    `SELECT t.periode,t.nominal,${monthlyFeeItems.map(({ column }) => `t.${column}`).join(", ")},t.total_dibayar,t.status,s.nama,s.nis FROM tagihan t JOIN santri s ON s.id=t.santri_id ORDER BY t.periode DESC,s.nama`,
  );
  const currentPeriod = today().slice(0, 7);
  res.json({
    payments,
    bills,
    totalPayments: payments.reduce((sum, row) => sum + Number(row.jumlah_bayar), 0),
    totalBills: bills.reduce((sum, row) => sum + Number(row.nominal), 0),
    totalArrears: bills.reduce((sum, row) => row.periode <= currentPeriod
      ? sum + Number(row.nominal) - Number(row.total_dibayar)
      : sum, 0),
  });
}));

app.use("/api", (_req, _res, next) => next(fail(404, "Endpoint tidak ditemukan.")));

if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(__dirname, "../dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((error, _req, res, _next) => {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ message: status >= 500 ? "Terjadi kesalahan pada server." : error.message });
});

function validateStudent(input = {}) {
  const fields = ["nis", "nama", "jenis_kelamin", "kelas", "no_hp_wali", "alamat", "tanggal_masuk", "status"];
  for (const field of fields) if (typeof input[field] !== "string" || !input[field].trim()) throw fail(400, `${field.replaceAll("_", " ")} wajib diisi.`);
  if (!["Laki-laki", "Perempuan"].includes(input.jenis_kelamin)) throw fail(400, "Jenis kelamin tidak valid.");
  if (!["Aktif", "Tidak Aktif"].includes(input.status)) throw fail(400, "Status santri tidak valid.");
  if (!/^\+?[0-9][0-9\s()-]{7,19}$/.test(input.no_hp_wali.trim())) throw fail(400, "Nomor HP wali tidak valid.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.tanggal_masuk)) throw fail(400, "Tanggal masuk tidak valid.");
  return {
    nis: input.nis.trim(), nama: input.nama.trim(), jenis_kelamin: input.jenis_kelamin,
    kelas: input.kelas.trim(), asrama: String(input.asrama || "").trim(),
    no_hp_wali: input.no_hp_wali.trim(), alamat: input.alamat.trim(),
    tanggal_masuk: input.tanggal_masuk, status: input.status,
  };
}
const studentValues = (s) => [s.nis, s.nama, s.jenis_kelamin, s.kelas, s.asrama, s.no_hp_wali, s.alamat, s.tanggal_masuk, s.status];

async function refreshBillStatus(id) {
  await pool.execute("UPDATE tagihan SET status=CASE WHEN total_dibayar=0 THEN 'Belum Dibayar' WHEN total_dibayar>=nominal THEN 'Lunas' ELSE 'Belum Lunas' END WHERE id=?", [id]);
}

async function start() {
  pool = createDatabasePool(process.env.DATABASE_URL);
  await pool.query("SELECT 1");
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  for (const statement of schema.split(";").map((part) => part.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
  for (const { column } of monthlyFeeItems) {
    await pool.query(`ALTER TABLE tagihan ADD COLUMN IF NOT EXISTS ${column} NUMERIC(12,2) DEFAULT NULL`);
  }
  const { ADMIN_NAME, ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_NAME && ADMIN_USERNAME && ADMIN_EMAIL && ADMIN_PASSWORD) {
    if (ADMIN_PASSWORD.length < 8) throw new Error("ADMIN_PASSWORD minimal 8 karakter.");
    const [existing] = await pool.execute("SELECT id FROM admins WHERE username=? OR email=? LIMIT 1", [ADMIN_USERNAME, ADMIN_EMAIL]);
    if (!existing.length) {
      await pool.execute("INSERT INTO admins (name,username,email,password) VALUES (?,?,?,?)", [ADMIN_NAME, ADMIN_USERNAME, ADMIN_EMAIL, await bcrypt.hash(ADMIN_PASSWORD, 12)]);
      console.log("Admin awal berhasil dibuat dari environment.");
    }
  }
  app.listen(port, () => console.log(`SANTRI-CATAT API berjalan pada port ${port}`));
}

start().catch((error) => { console.error("Gagal memulai server SANTRI-CATAT:", error); process.exit(1); });

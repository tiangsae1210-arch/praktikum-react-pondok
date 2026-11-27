import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight,
  CalendarDays, Camera, Check, ChevronDown, CircleDollarSign, ClipboardList, CreditCard,
  FileBarChart2, FileSpreadsheet, Home, LogOut, Menu, Pencil, Plus, Printer,
  Search, Settings, ShieldCheck, Trash2, TrendingDown, TrendingUp, Users, X,
  Eye, EyeOff, Wallet,
} from "lucide-react";
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, currentMonth, date, monthYear, money } from "./api";

const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

const feeLines = [
  { key: "syahriah", label: "Syahriyah" },
  { key: "diniyah", label: "Diniyah" },
  { key: "listrik_air_bersih", label: "Listrik & air bersih" },
  { key: "kebersihan_perlengkapan", label: "Kebersihan & perlengkapan" },
  { key: "haflah_syahriah", label: "Haflah (Syahriyah)" },
  { key: "maklumat", label: "Maklumat" },
  { key: "modul_lks", label: "Modul LKS" },
  { key: "kegiatan_kesiswaan", label: "Kegiatan kesiswaan" },
  { key: "haflah_madrasah", label: "Haflah (Madrasah)" },
];

function FeeBreakdown({ bill }) {
  const lines = feeLines.filter((line) => bill[line.key] != null);
  if (!lines.length) return null;
  return <span className="table-sub fee-breakdown">{lines.map((line) => <span key={line.key}>{line.label}: {money(bill[line.key])}</span>)}</span>;
}

function Toast({ message, onClose }) {
  if (!message) return null;
  return <div className={`toast ${message.type || "success"}`} role="status"><span>{message.text}</span><button aria-label="Tutup notifikasi" onClick={onClose}><X size={16} /></button></div>;
}

function Spinner({ text = "Memuat data..." }) {
  return <div className="loading"><span className="spinner" />{text}</div>;
}

function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Tutup"><X size={19} /></button></header>
      {children}
    </section>
  </div>;
}

function PageTitle({ eyebrow, title, description, action }) {
  return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

function Empty({ children = "Belum ada data untuk ditampilkan." }) {
  return <div className="empty"><div className="empty-icon"><ClipboardList size={23} /></div><p>{children}</p></div>;
}

function DataTable({ columns, rows, empty, renderRow }) {
  return <div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
    <tbody>{rows.length ? rows.map(renderRow) : <tr><td colSpan={columns.length}><Empty>{empty}</Empty></td></tr>}</tbody></table></div>;
}

function Field({ label, children, required }) {
  return <label className="field"><span>{label}{required && <b className="required"> *</b>}</span>{children}</label>;
}

function TextInput({ label, required, ...props }) {
  return <Field label={label} required={required}><input {...props} required={required} /></Field>;
}

function SelectInput({ label, required, children, ...props }) {
  return <Field label={label} required={required}><select {...props} required={required}>{children}</select></Field>;
}

function App() {
  const [admin, setAdmin] = useState(null);
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [checking, setChecking] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api("/auth/me").then(setAdmin).catch(() => setAdmin(null)).finally(() => setChecking(false));
  }, []);

  const notify = (text, type = "success") => {
    setToast({ text, type });
    window.setTimeout(() => setToast(null), 4200);
  };
  useEffect(() => {
    if (!admin?.id) {
      setProfilePhoto(null);
      return;
    }
    try {
      setProfilePhoto(window.localStorage.getItem(profilePhotoKey(admin.id)));
    } catch (error) {
      setProfilePhoto(null);
      notify("Foto profil tidak dapat dimuat dari penyimpanan browser.", "error");
    }
  }, [admin?.id]);

  const authValue = useMemo(() => ({ admin, setAdmin, profilePhoto, setProfilePhoto, notify }), [admin, profilePhoto]);

  if (checking) return <Spinner />;
  return <AuthContext.Provider value={authValue}>
    <Toast message={toast} onClose={() => setToast(null)} />
    <Routes>
      <Route path="/login" element={admin ? <Navigate to="/" replace /> : <Login />} />
      <Route element={admin ? <AdminLayout /> : <Navigate to="/login" replace />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/santri" element={<Students />} />
        <Route path="/tagihan" element={<Bills />} />
        <Route path="/pembayaran" element={<Payments />} />
        <Route path="/laporan" element={<Reports />} />
        <Route path="/akun" element={<Account />} />
      </Route>
      <Route path="*" element={<Navigate to={admin ? "/" : "/login"} replace />} />
    </Routes>
  </AuthContext.Provider>;
}

function Login() {
  const { setAdmin } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!values.username?.trim() || !values.password) {
      setError("Username/email dan password wajib diisi.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", { method: "POST", body: values });
      setAdmin(await api("/auth/me"));
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message === "Username atau password salah" ? err.message : err.message);
    } finally { setBusy(false); }
  }
  return <main className="login-page">
    <div className="login-art"><div className="login-brand"><span className="brand-mark"><img src="/logo-pondok.png" alt="Logo Pondok Pesantren" /></span><span>SYAHRIAH<span className="brand-accent"> PESANTREN</span></span></div>
      <div className="art-copy"><div className="art-pill"><ShieldCheck size={14} /> ADMINISTRASI PESANTREN</div><h1>Kelola keuangan<br />dengan lebih <em>tenang.</em></h1><p>Satu ruang untuk pencatatan syahriyah yang rapi, transparan, dan mudah dipantau.</p><div className="art-summary"><div className="art-summary-icon"><CircleDollarSign size={22} /></div><div><strong>Catat dengan aman</strong><span>Data tersimpan terpusat dan terlindungi.</span></div><Check size={19} className="art-check" /></div></div>
      <div className="art-footer">Syahriah Pesantren<span>•</span> Sistem Administrasi Keuangan</div>
    </div>
    <div className="login-panel"><div className="login-form-wrap"><div className="mobile-brand"><span className="brand-mark"><img src="/logo-pondok.png" alt="Logo Pondok Pesantren" /></span><strong>SYAHRIAH PESANTREN</strong></div>
      <div className="form-eyebrow">SELAMAT DATANG KEMBALI</div><h2>Masuk ke akun admin</h2><p className="form-intro">Masukkan kredensial Anda untuk melanjutkan.</p>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <form className="login-form" onSubmit={submit}>
        <TextInput label="Username atau email" name="username" placeholder="contoh: admin@pesantren.id" autoComplete="username" required />
        <Field label="Password" required><div className="password-wrap"><input name="password" type={showPassword ? "text" : "password"} placeholder="Masukkan password" autoComplete="current-password" required /><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></Field>
        <button className="button button-primary login-button" disabled={busy}>{busy ? <><span className="button-spinner" /> Memeriksa...</> : <>Masuk ke Dashboard <ArrowRight size={17} /></>}</button>
      </form><div className="login-secure"><ShieldCheck size={15} /> Akses khusus administrator pesantren</div>
    </div><div className="login-copyright">© {new Date().getFullYear()} Syahriah Pesantren · Sistem Informasi Keuangan Syahriyah</div></div>
  </main>;
}

function profilePhotoKey(adminId) {
  return `syahriah-admin-photo-${adminId}`;
}

function readProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File foto tidak dapat dibaca."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("File gambar tidak valid."));
      image.onload = () => {
        const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Foto tidak dapat diproses di browser ini."));
          return;
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
          image,
          (image.naturalWidth - cropSize) / 2,
          (image.naturalHeight - cropSize) / 2,
          cropSize,
          cropSize,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch {
          reject(new Error("Foto tidak dapat disimpan di browser ini."));
        }
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function ProfileAvatar({ admin, photo, className = "" }) {
  return <div className={`avatar ${className} ${photo ? "avatar-photo" : ""}`}>
    {photo ? <img src={photo} alt={`Foto profil ${admin?.name || "Administrator"}`} /> : (admin?.name || "A").slice(0, 1).toUpperCase()}
  </div>;
}

const navigation = [
  { to: "/", label: "Dashboard", icon: Home, end: true },
  { to: "/santri", label: "Data Santri", icon: Users },
  { to: "/tagihan", label: "Tagihan", icon: ClipboardList },
  { to: "/pembayaran", label: "Pembayaran", icon: CreditCard },
  { to: "/laporan", label: "Laporan", icon: FileBarChart2 },
];

function AdminLayout() {
  const { admin, setAdmin, profilePhoto, notify } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const profileMenuRef = useRef(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = navigation.find((item) => item.to === location.pathname);
  useEffect(() => {
    if (!profileMenuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileMenuOpen]);
  async function logout() {
    setProfileMenuOpen(false);
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" });
      setAdmin(null);
      navigate("/login", { replace: true });
    } catch (error) { notify(error.message, "error"); }
    finally { setBusy(false); }
  }
  return <div className="app-shell min-h-screen">
    {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Tutup menu" />}
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
      <Link to="/" className="sidebar-brand"><span className="brand-mark"><img src="/logo-pondok.png" alt="Logo Pondok Pesantren" /></span><span>SYAHRIAH<span className="brand-accent"> PESANTREN</span><small>ADMINISTRASI KEUANGAN</small></span></Link>
      <div className="nav-caption">MENU UTAMA</div><nav className="side-nav">
        {navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}><Icon size={18} /><span>{label}</span>{label === "Pembayaran" && <span className="nav-dot" />}</NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/akun" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} onClick={() => setMobileOpen(false)}><Settings size={18} /><span>Pengaturan Akun</span></NavLink>
        <div className="sidebar-help"><div className="help-shield"><ShieldCheck size={17} /></div><strong>Data tersimpan aman</strong><span>Catatan keuangan dapat diakses kapan saja.</span></div>
        <div className="admin-chip"><ProfileAvatar admin={admin} photo={profilePhoto} /><div className="admin-info"><strong>{admin?.name}</strong><span>Administrator</span></div><button className="logout-btn" title="Keluar" onClick={logout} disabled={busy}><LogOut size={17} /></button></div>
      </div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><button className="mobile-menu icon-btn" onClick={() => setMobileOpen(true)} aria-label="Buka menu"><Menu size={21} /></button><div className="breadcrumb"><span>Workspace</span><span className="crumb-sep">/</span><strong>{current?.label || "Pengaturan Akun"}</strong></div><div className="topbar-right"><div className="today-pill"><CalendarDays size={15} /> {new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date())}</div><div className="topbar-divider" /><div className="profile-menu-wrap" ref={profileMenuRef}>
        <button className="top-user" type="button" aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}><ProfileAvatar admin={admin} photo={profilePhoto} className="avatar-small" /><span className="top-user-info"><strong>{admin?.name}</strong><span>Administrator</span></span><ChevronDown size={15} /></button>
        {profileMenuOpen && <div className="profile-menu" role="menu"><Link to="/akun" role="menuitem" onClick={() => setProfileMenuOpen(false)}><Settings size={16} /> Pengaturan akun</Link><button type="button" role="menuitem" onClick={logout} disabled={busy}><LogOut size={16} /> {busy ? "Keluar..." : "Keluar dari akun"}</button></div>}
      </div></div></header>
      <div className="content"><Outlet /></div>
      <footer className="app-footer"><span>Syahriah Pesantren</span> <span>·</span> Administrasi Keuangan Syahriyah <span className="footer-version">Versi 1.0</span></footer>
    </main>
  </div>;
}

function Dashboard() {
  const { notify } = useAuth();
  const [data, setData] = useState(null);
  useEffect(() => { api("/dashboard").then(setData).catch((error) => notify(error.message, "error")); }, []);
  if (!data) return <Spinner />;
  const stats = [
    { label: "Santri Aktif", value: data.activeStudents, icon: Users, tone: "mint", note: "Terdaftar saat ini", format: false },
    { label: "Tagihan Bulan Ini", value: data.billed, icon: ClipboardList, tone: "blue", note: "Periode berjalan", format: true },
    { label: "Pembayaran Bulan Ini", value: data.collected, icon: Wallet, tone: "gold", note: "Dana telah diterima", format: true },
    { label: "Total Tunggakan", value: data.arrears, icon: TrendingDown, tone: "rose", note: "Belum lunas", format: true },
  ];
  const maxBar = Math.max(1, ...data.months.flatMap((item) => [Number(item.tagihan), Number(item.pembayaran)]));
  return <>
    <PageTitle eyebrow="RINGKASAN" title="Dashboard" description="Pantau kondisi keuangan syahriyah pesantren hari ini." action={<div className="live-tag"><span /> Data diperbarui langsung</div>} />
    <section className="stats-grid">{stats.map(({ label, value, icon: Icon, tone, note, format }) => <article className="stat-card" key={label}><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon size={19} /></span></div><div className="stat-value">{format ? money(value) : new Intl.NumberFormat("id-ID").format(value)}</div><div className="stat-note"><span className={`note-icon ${tone}`}><Activity size={13} /></span>{note}</div></article>)}</section>
    <section className="dashboard-grid">
      <article className="panel chart-panel"><div className="panel-heading"><div><h2>Tagihan & pembayaran</h2><p>Perbandingan enam bulan terakhir</p></div><span className="period-label"><CalendarDays size={14} /> 6 bulan</span></div>
        <div className="chart-legend"><span><i className="legend-bill" />Tagihan</span><span><i className="legend-paid" />Pembayaran</span></div>
        <div className="bar-chart">{data.months.map((month) => <div className="bar-group" key={month.month}><div className="bars"><span className="bar bill-bar" style={{ height: `${Math.max(3, (Number(month.tagihan) / maxBar) * 100)}%` }} title={`Tagihan ${money(month.tagihan)}`} /><span className="bar paid-bar" style={{ height: `${Math.max(3, (Number(month.pembayaran) / maxBar) * 100)}%` }} title={`Pembayaran ${money(month.pembayaran)}`} /></div><span className="bar-label">{new Intl.DateTimeFormat("id-ID", { month: "short" }).format(new Date(`${month.month}-01T00:00:00`))}</span></div>)}</div>
        <div className="chart-caption">Grafik berdasarkan total nominal tagihan dan penerimaan bulanan.</div>
      </article>
      <article className="panel status-panel"><div className="panel-heading"><div><h2>Status tagihan</h2><p>Ringkasan status pembayaran</p></div><span className="soft-icon"><CircleDollarSign size={18} /></span></div>
        <div className="status-list">{["Lunas", "Belum Lunas", "Belum Dibayar"].map((status) => { const match = data.statuses.find((item) => item.status === status); const amount = Number(match?.jumlah || 0); const total = data.statuses.reduce((sum, item) => sum + Number(item.jumlah), 0); return <div className="status-row" key={status}><span className={`status-mark ${status === "Lunas" ? "mark-paid" : status === "Belum Lunas" ? "mark-partial" : "mark-unpaid"}`} /><div className="status-detail"><span>{status}</span><div className="progress-track"><span className={`progress-fill ${status === "Lunas" ? "fill-paid" : status === "Belum Lunas" ? "fill-partial" : "fill-unpaid"}`} style={{ width: `${total ? amount / total * 100 : 0}%` }} /></div></div><strong>{amount}</strong></div>; })}</div>
        <Link className="panel-link" to="/tagihan">Lihat semua tagihan <ArrowRight size={15} /></Link>
      </article>
    </section>
    <section className="dashboard-grid dashboard-lower">
      <article className="panel"><div className="panel-heading"><div><h2>Pembayaran terbaru</h2><p>Transaksi yang baru dicatat</p></div><Link className="text-link" to="/pembayaran">Lihat semua <ArrowRight size={15} /></Link></div>
        <DataTable columns={["Santri", "Periode", "Tanggal", "Jumlah"]} rows={data.recent} empty="Belum ada pembayaran." renderRow={(row) => <tr key={row.kode_transaksi}><td><div className="person-cell"><div className="mini-avatar">{row.nama.slice(0, 1)}</div><div><strong>{row.nama}</strong><span>{row.nis}</span></div></div></td><td>{monthYear(row.periode)}</td><td>{date(row.tanggal_pembayaran)}</td><td className="amount-cell">{money(row.jumlah_bayar)}</td></tr>} />
      </article>
      <article className="panel"><div className="panel-heading"><div><h2>Perlu ditindaklanjuti</h2><p>Santri dengan sisa tagihan</p></div><span className="arrears-badge">{data.arrearsList.length} data</span></div>
        {data.arrearsList.length ? <div className="arrears-list">{data.arrearsList.map((item, index) => <div className="arrears-item" key={`${item.nis}-${item.periode}`}><div className="arrears-rank">{String(index + 1).padStart(2, "0")}</div><div className="arrears-person"><strong>{item.nama}</strong><span>{item.nis} · {item.periode}</span></div><strong className="arrears-amount">{money(item.sisa)}</strong></div>)}</div> : <Empty>Tidak ada tunggakan saat ini.</Empty>}
        <Link className="panel-link" to="/tagihan">Kelola tagihan <ArrowRight size={15} /></Link>
      </article>
    </section>
  </>;
}

function Students() {
  const { notify } = useAuth();
  const [result, setResult] = useState({ rows: [], total: 0, page: 1, pages: 0 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = () => {
    setLoading(true);
    api(`/santri?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&page=${page}`)
      .then(setResult).catch((error) => notify(error.message, "error")).finally(() => setLoading(false));
  };
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [search, status, page]);
  async function save(event) {
    event.preventDefault(); setSaving(true);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(selected?.id ? `/santri/${selected.id}` : "/santri", { method: selected?.id ? "PUT" : "POST", body: form });
      notify(selected?.id
        ? "Data santri berhasil diperbarui."
        : form.status === "Aktif"
        ? "Santri berhasil ditambahkan. 12 tagihan bulanan dengan rincian semua biaya sudah dibuat."
          : "Santri berhasil ditambahkan.");
      setSelected(null); load();
    } catch (error) { notify(error.message, "error"); }
    finally { setSaving(false); }
  }
  async function remove(student) {
    if (!window.confirm(`Hapus data santri ${student.nama} beserta semua tagihan dan riwayat pembayarannya? Tindakan ini tidak dapat dibatalkan.`)) return;
    try { await api(`/santri/${student.id}`, { method: "DELETE" }); notify("Data santri berhasil dihapus."); load(); }
    catch (error) { notify(error.message, "error"); }
  }
  return <>
    <PageTitle eyebrow="DATA MASTER" title="Data Santri" description="Kelola informasi santri dan status keaktifannya." action={<button className="button button-primary" onClick={() => setSelected({})}><Plus size={17} /> Tambah Santri</button>} />
    <section className="panel">
      <div className="table-toolbar"><div><h2>Daftar santri</h2><p>{result.total} santri terdaftar</p></div><div className="toolbar-filters"><label className="search-box"><Search size={16} /><input placeholder="Cari nama atau NIS..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><select className="filter-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Semua status</option><option>Aktif</option><option>Tidak Aktif</option></select></div></div>
      {loading ? <Spinner /> : <DataTable columns={["NIS", "Nama santri", "Jenis kelamin", "Kelas / asrama", "Kontak wali", "Masuk", "Status", "Aksi"]} rows={result.rows} empty="Belum ada data santri." renderRow={(row) => <tr key={row.id}><td className="code-cell">{row.nis}</td><td><div className="person-cell"><div className="mini-avatar">{row.nama.slice(0, 1)}</div><div><strong>{row.nama}</strong><span>{row.alamat}</span></div></div></td><td>{row.jenis_kelamin}</td><td><strong className="regular-strong">{row.kelas}</strong><span className="table-sub">{row.asrama || "—"}</span></td><td>{row.no_hp_wali}</td><td>{date(row.tanggal_masuk)}</td><td><span className={`badge ${row.status === "Aktif" ? "badge-success" : "badge-muted"}`}>{row.status}</span></td><td><div className="row-actions"><button title="Edit santri" onClick={() => setSelected(row)}><Pencil size={15} /></button><button title="Hapus santri" className="danger-action" onClick={() => remove(row)}><Trash2 size={15} /></button></div></td></tr>} />}
      <Pagination page={result.page} pages={result.pages} total={result.total} onChange={setPage} />
    </section>
    {selected && <Modal title={selected.id ? "Edit data santri" : "Tambah santri"} onClose={() => setSelected(null)} wide><form className="modal-form" onSubmit={save}>
      <div className="form-grid"><TextInput label="NIS" name="nis" defaultValue={selected.nis} required placeholder="Contoh: 2026001" /><TextInput label="Nama lengkap" name="nama" defaultValue={selected.nama} required placeholder="Nama santri" />
        <SelectInput label="Jenis kelamin" name="jenis_kelamin" defaultValue={selected.jenis_kelamin || "Laki-laki"} required><option>Laki-laki</option><option>Perempuan</option></SelectInput><TextInput label="Kelas" name="kelas" defaultValue={selected.kelas} required placeholder="Contoh: 1 Tsanawiyah" />
        <TextInput label="Asrama" name="asrama" defaultValue={selected.asrama} placeholder="Nama asrama" /><TextInput label="Nomor HP wali" name="no_hp_wali" defaultValue={selected.no_hp_wali} required type="tel" pattern="\+?[0-9][0-9\s()-]{7,19}" placeholder="08xxxxxxxxxx" />
        <TextInput label="Tanggal masuk" name="tanggal_masuk" defaultValue={selected.tanggal_masuk?.slice(0, 10) || dateInputToday()} required type="date" /><SelectInput label="Status santri" name="status" defaultValue={selected.status || "Aktif"} required><option>Aktif</option><option>Tidak Aktif</option></SelectInput>
        <label className="field field-full"><span>Alamat <b className="required">*</b></span><textarea name="alamat" defaultValue={selected.alamat} rows="3" required placeholder="Alamat lengkap santri" /></label>
      </div><div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setSelected(null)}>Batal</button><button className="button button-primary" disabled={saving}>{saving ? "Menyimpan..." : "Simpan data"}</button></div>
    </form></Modal>}
  </>;
}

function dateInputToday() { return new Date().toISOString().slice(0, 10); }

function Pagination({ page, pages, total, onChange }) {
  if (!total) return null;
  return <div className="pagination"><span>Halaman <strong>{page}</strong> dari <strong>{pages}</strong> · {total} data</span><div><button disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Halaman sebelumnya"><ArrowLeft size={15} /></button><button disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Halaman selanjutnya"><ArrowRight size={15} /></button></div></div>;
}

function Bills() {
  const { notify } = useAuth();
  const [bills, setBills] = useState([]);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState(currentMonth());
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = () => {
    setLoading(true);
    api(`/tagihan?search=${encodeURIComponent(search)}&periode=${encodeURIComponent(period)}&status=${encodeURIComponent(status)}`)
      .then(setBills).catch((error) => notify(error.message, "error")).finally(() => setLoading(false));
  };
  useEffect(() => { const timer = setTimeout(load, 180); return () => clearTimeout(timer); }, [search, period, status]);
  useEffect(() => { api("/santri?status=Aktif&limit=100").then((value) => setStudents(value.rows)).catch((error) => notify(error.message, "error")); }, []);
  async function save(event) {
    event.preventDefault(); setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (modal.edit) {
        await api(`/tagihan/${modal.edit.id}`, { method: "PUT", body: values });
        notify("Tagihan berhasil diperbarui.");
      } else {
        const result = await api("/tagihan/generate", { method: "POST", body: values });
        notify(`${result.created} tagihan berhasil dibuat.`);
      }
      setModal(null); load();
    } catch (error) { notify(error.message, "error"); }
    finally { setSaving(false); }
  }
  async function remove(bill) {
    if (!window.confirm(`Hapus tagihan ${bill.nama} untuk periode ${bill.periode}?`)) return;
    try { await api(`/tagihan/${bill.id}`, { method: "DELETE" }); notify("Tagihan berhasil dihapus."); load(); }
    catch (error) { notify(error.message, "error"); }
  }
  return <>
    <PageTitle eyebrow="KEWAJIBAN BULANAN" title="Tagihan Syahriyah" description="Buat tagihan per periode dan pantau status pembayaran santri." action={<button className="button button-primary" onClick={() => setModal({})}><Plus size={17} /> Buat Tagihan</button>} />
    <section className="panel"><div className="table-toolbar"><div><h2>Daftar tagihan</h2><p>{bills.length} tagihan ditampilkan</p></div><div className="toolbar-filters"><label className="search-box"><Search size={16} /><input placeholder="Cari nama atau NIS..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><input className="filter-select" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /><select className="filter-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua status</option><option>Belum Dibayar</option><option>Belum Lunas</option><option>Lunas</option></select></div></div>
      {loading ? <Spinner /> : <DataTable columns={["Santri", "Periode", "Rincian tagihan", "Dibayar", "Sisa", "Tanggal bayar", "Status", "Aksi"]} rows={bills} empty="Belum ada tagihan. Buat tagihan pertama untuk memulai." renderRow={(row) => <tr key={row.id}><td><div className="person-cell"><div className="mini-avatar">{row.nama.slice(0, 1)}</div><div><strong>{row.nama}</strong><span>{row.nis}</span></div></div></td><td className="code-cell">{monthYear(row.periode)}</td><td>{money(row.nominal)}<FeeBreakdown bill={row} /></td><td>{money(row.total_dibayar)}</td><td className={Number(row.nominal) - Number(row.total_dibayar) ? "arrears-amount" : ""}>{money(Number(row.nominal) - Number(row.total_dibayar))}</td><td>{row.tanggal_bayar ? date(row.tanggal_bayar) : "—"}</td><td><span className={`badge ${row.status === "Lunas" ? "badge-success" : row.status === "Belum Lunas" ? "badge-warning" : "badge-danger"}`}>{row.status}</span></td><td><div className="row-actions"><button title="Edit tagihan" onClick={() => setModal({ edit: row })}><Pencil size={15} /></button><button title="Hapus tagihan" className="danger-action" onClick={() => remove(row)}><Trash2 size={15} /></button></div></td></tr>} />}</section>
    {modal && <Modal title={modal.edit ? "Edit tagihan" : "Buat tagihan syahriyah"} onClose={() => setModal(null)}><form className="modal-form" onSubmit={save}>
      {!modal.edit && <SelectInput label="Santri" name="santriId" defaultValue="" required><option value="">Semua santri aktif</option>{students.map((student) => <option value={student.id} key={student.id}>{student.nama} · {student.nis}</option>)}</SelectInput>}
      <div className="form-grid"><TextInput label="Periode tagihan" name="periode" type="month" defaultValue={modal.edit?.periode || currentMonth()} required /><TextInput label="Nominal (Rp)" name="nominal" type="number" min="1" step="1" defaultValue={modal.edit?.nominal || ""} required /></div>
      {!modal.edit && <p className="form-hint">Pilih santri tertentu, atau biarkan pilihan kosong untuk membuat tagihan bagi seluruh santri aktif.</p>}
      {modal.edit && <p className="form-hint">Tagihan yang sudah memiliki pembayaran tidak dapat diubah menjadi lebih kecil dari jumlah yang dibayar.</p>}
      <div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setModal(null)}>Batal</button><button className="button button-primary" disabled={saving}>{saving ? "Menyimpan..." : modal.edit ? "Simpan perubahan" : "Buat tagihan"}</button></div>
    </form></Modal>}
  </>;
}

function Payments() {
  const { notify } = useAuth();
  const [payments, setPayments] = useState([]);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentMatches, setStudentMatches] = useState([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [studentBills, setStudentBills] = useState([]);
  const [saving, setSaving] = useState(false);
  const load = () => { setLoading(true); api(`/pembayaran?search=${encodeURIComponent(search)}&month=${encodeURIComponent(month)}`).then(setPayments).catch((error) => notify(error.message, "error")).finally(() => setLoading(false)); };
  useEffect(() => { const timer = setTimeout(load, 180); return () => clearTimeout(timer); }, [search, month]);
  useEffect(() => {
    const query = studentSearch.trim();
    if (!modal || selectedStudent || query.length < 2) {
      setStudentMatches([]);
      setSearchingStudents(false);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(() => {
      setSearchingStudents(true);
      api(`/santri?status=Aktif&search=${encodeURIComponent(query)}&limit=10`)
        .then((result) => { if (active) setStudentMatches(result.rows); })
        .catch((error) => notify(error.message, "error"))
        .finally(() => { if (active) setSearchingStudents(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [modal, selectedStudent, studentSearch]);
  useEffect(() => {
    if (!selectedStudent) {
      setStudentBills([]);
      return;
    }
    api(`/tagihan?search=${encodeURIComponent(selectedStudent.nis)}`)
      .then((rows) => setStudentBills(rows.filter((bill) => String(bill.santri_id) === String(selectedStudent.id) && Number(bill.nominal) > Number(bill.total_dibayar))))
      .catch((error) => notify(error.message, "error"));
  }, [selectedStudent]);
  function openPaymentModal() {
    setStudentId("");
    setSelectedStudent(null);
    setStudentSearch("");
    setStudentMatches([]);
    setModal(true);
  }
  function closePaymentModal() {
    setModal(false);
    setStudentId("");
    setSelectedStudent(null);
    setStudentSearch("");
    setStudentMatches([]);
  }
  async function save(event) {
    event.preventDefault();
    if (!selectedStudent) {
      notify("Cari dan pilih santri terlebih dahulu.", "error");
      return;
    }
    setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const payment = await api("/pembayaran", { method: "POST", body: values });
      closePaymentModal(); load(); notify("Pembayaran berhasil dicatat.");
      if (window.confirm(`Pembayaran ${payment.kode_transaksi} berhasil disimpan. Cetak bukti sekarang?`)) printReceipt(payment);
    } catch (error) { notify(error.message, "error"); }
    finally { setSaving(false); }
  }
  return <>
    <PageTitle eyebrow="PENERIMAAN SYAHRIYAH" title="Pembayaran" description="Catat pembayaran dan cetak bukti transaksi." action={<button className="button button-primary" onClick={openPaymentModal}><Plus size={17} /> Catat Pembayaran</button>} />
    <section className="panel"><div className="table-toolbar"><div><h2>Riwayat transaksi</h2><p>{payments.length} pembayaran · {monthYear(month)}</p></div><div className="toolbar-filters"><label className="search-box"><Search size={16} /><input placeholder="Cari nama, NIS, atau kode transaksi..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><input className="filter-select" type="month" aria-label="Filter bulan pembayaran" value={month} onChange={(event) => setMonth(event.target.value)} /></div></div>
      {loading ? <Spinner /> : <DataTable columns={["Kode transaksi", "Santri", "Tanggal", "Periode & rincian", "Jumlah bayar", "Status tagihan", "Metode", "Aksi"]} rows={payments} empty="Belum ada transaksi pembayaran." renderRow={(row) => <tr key={row.id}><td className="code-cell">{row.kode_transaksi}</td><td><div className="person-cell"><div className="mini-avatar">{row.nama.slice(0, 1)}</div><div><strong>{row.nama}</strong><span>{row.nis}</span></div></div></td><td>{date(row.tanggal_pembayaran)}</td><td>{monthYear(row.periode)}<FeeBreakdown bill={row} /></td><td className="amount-cell">{money(row.jumlah_bayar)}</td><td><span className={`badge ${row.status_tagihan === "Lunas" ? "badge-success" : row.status_tagihan === "Belum Lunas" ? "badge-warning" : "badge-danger"}`}>{row.status_tagihan}</span></td><td><span className="method-chip">{row.metode_pembayaran}</span></td><td><button className="row-print" onClick={() => printReceipt(row)} title="Cetak bukti pembayaran"><Printer size={15} /> Cetak</button></td></tr>} />}</section>
    {modal && <Modal title="Catat pembayaran" onClose={closePaymentModal}><form className="modal-form" onSubmit={save}>
      <Field label="Cari santri" required><div className="student-search">
        {selectedStudent
          ? <div className="student-selected"><span><strong>{selectedStudent.nama}</strong><small>NIS {selectedStudent.nis}</small></span><button type="button" className="button button-ghost" onClick={() => { setSelectedStudent(null); setStudentId(""); setStudentSearch(""); }}>Ganti santri</button></div>
          : <>
            <div className="student-search-input"><Search size={17} /><input type="search" value={studentSearch} onChange={(event) => { setStudentId(""); setStudentSearch(event.target.value); }} placeholder="Ketik nama atau NIS santri..." autoComplete="off" aria-label="Cari santri berdasarkan nama atau NIS" /></div>
            {studentSearch.trim().length >= 2 && <div className="student-search-results" role="status">{searchingStudents ? <span className="student-search-message">Mencari santri...</span> : studentMatches.length ? studentMatches.map((student) => <button type="button" className="student-search-result" key={student.id} onClick={() => { setSelectedStudent(student); setStudentId(String(student.id)); setStudentSearch(""); setStudentMatches([]); }}><strong>{student.nama}</strong><span>NIS {student.nis} · {student.kelas}</span></button>) : <span className="student-search-message">Santri aktif tidak ditemukan.</span>}</div>}
            {studentSearch.trim().length < 2 && <span className="student-search-hint">Masukkan minimal 2 karakter nama atau NIS.</span>}
          </>}
      </div></Field>
      <SelectInput label="Tagihan yang dibayar" name="tagihanId" required disabled={!studentId}><option value="">Pilih periode tagihan</option>{studentBills.map((bill) => <option key={bill.id} value={bill.id}>{monthYear(bill.periode)} · Total {money(bill.nominal)} · Sisa {money(Number(bill.nominal) - Number(bill.total_dibayar))}</option>)}</SelectInput>
      <div className="form-grid"><TextInput label="Jumlah pembayaran (Rp)" name="jumlahBayar" type="number" min="1" step="1" required placeholder="Contoh: 500000" /><TextInput label="Tanggal pembayaran" name="tanggalPembayaran" type="date" defaultValue={dateInputToday()} required />
        <SelectInput label="Metode pembayaran" name="metodePembayaran" required><option>Tunai</option><option>Transfer</option></SelectInput><TextInput label="Keterangan" name="keterangan" placeholder="Opsional" /></div>
      {selectedStudent && !studentBills.length && <div className="form-hint">Santri ini tidak memiliki tagihan yang masih terbuka.</div>}
      <div className="modal-actions"><button type="button" className="button button-ghost" onClick={closePaymentModal}>Batal</button><button className="button button-primary" disabled={saving || !studentId || !studentBills.length}>{saving ? "Menyimpan..." : "Simpan pembayaran"}</button></div>
    </form></Modal>}
  </>;
}

function printReceipt(payment) {
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const popup = window.open("", "_blank", "width=720,height=800");
  if (!popup) return;
  const feeBreakdown = feeLines
    .filter((line) => payment[line.key] != null)
    .map((line) => `<dt>${escapeHtml(line.label)}</dt><dd>${escapeHtml(money(payment[line.key]))}</dd>`)
    .join("") + `<dt>Total tagihan</dt><dd>${escapeHtml(money(payment.nominal))}</dd>`;
  popup.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Bukti ${escapeHtml(payment.kode_transaksi)}</title><style>body{font-family:Arial,sans-serif;color:#173b31;padding:42px;max-width:620px;margin:auto}header{text-align:center;border-bottom:2px solid #1d5b47;padding-bottom:20px}h1{font-size:21px;margin:0}header p{color:#66766f;margin-bottom:0}.code{background:#f1f7f3;padding:14px;margin:24px 0;font-weight:bold;letter-spacing:1px}dl{display:grid;grid-template-columns:180px 1fr;gap:15px}dt{color:#75827d}dd{margin:0;font-weight:bold}.total{font-size:19px;color:#1d5b47;border-top:1px solid #dfe7e2;padding-top:20px;margin-top:22px}.sign{text-align:right;margin-top:70px;color:#75827d}@media print{body{padding:10px}}</style></head><body><header><h1>BUKTI PEMBAYARAN SYAHRIYAH</h1><p>SANTRI-CATAT · Administrasi Keuangan Pesantren</p></header><div class="code">${escapeHtml(payment.kode_transaksi)}</div><dl><dt>Nama santri</dt><dd>${escapeHtml(payment.nama)}</dd><dt>NIS</dt><dd>${escapeHtml(payment.nis)}</dd><dt>Periode tagihan</dt><dd>${escapeHtml(monthYear(payment.periode))}</dd>${feeBreakdown}<dt>Status tagihan</dt><dd>${escapeHtml(payment.status_tagihan)}</dd><dt>Tanggal pembayaran</dt><dd>${escapeHtml(date(payment.tanggal_pembayaran))}</dd><dt>Metode</dt><dd>${escapeHtml(payment.metode_pembayaran)}</dd><dt>Keterangan</dt><dd>${escapeHtml(payment.keterangan || "-")}</dd></dl><div class="total">Jumlah dibayar: ${escapeHtml(money(payment.jumlah_bayar))}</div><div class="sign">Penerima,<br><br><br>Administrator</div><script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
}

function Reports() {
  const { notify } = useAuth();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ from: "", to: "", month: "", year: "" });
  const [loading, setLoading] = useState(false);
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  async function run(event) {
    event?.preventDefault(); setLoading(true);
    const query = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)));
    try { setData(await api(`/reports?${query}`)); }
    catch (error) { notify(error.message, "error"); }
    finally { setLoading(false); }
  }
  useEffect(() => { run(); }, []);
  function exportExcel() {
    if (!data) return;
    const rows = data.payments.map((row) => ({
      "Kode Transaksi": row.kode_transaksi, "Tanggal": date(row.tanggal_pembayaran), "NIS": row.nis,
      "Nama Santri": row.nama, "Periode": monthYear(row.periode),
      ...Object.fromEntries(feeLines.map((line) => [line.label, row[line.key] == null ? "" : Number(row[line.key])])),
      "Total Tagihan": Number(row.nominal), "Jumlah Pembayaran": Number(row.jumlah_bayar),
      "Metode": row.metode_pembayaran, "Keterangan": row.keterangan,
    }));
    const workbook = window.XLSX?.utils?.book_new?.();
    if (workbook) {
      const sheet = window.XLSX.utils.json_to_sheet(rows);
      window.XLSX.utils.book_append_sheet(workbook, sheet, "Pembayaran");
      window.XLSX.writeFile(workbook, `laporan-pembayaran-${dateInputToday()}.xlsx`);
      return;
    }
    import("xlsx").then((XLSX) => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Pembayaran");
      XLSX.writeFile(wb, `laporan-pembayaran-${dateInputToday()}.xlsx`);
    }).catch((error) => notify(error.message, "error"));
  }
  return <>
    <PageTitle eyebrow="REKAPITULASI" title="Laporan Keuangan" description="Tinjau penerimaan dan tagihan, lalu cetak atau ekspor laporan." action={<div className="report-actions"><button className="button button-outline" onClick={exportExcel} disabled={!data}><FileSpreadsheet size={16} /> Export Excel</button><button className="button button-primary" onClick={() => window.print()} disabled={!data}><Printer size={16} /> Cetak / PDF</button></div>} />
    <section className="panel report-filter"><div className="panel-heading"><div><h2>Filter laporan</h2><p>Pilih rentang tanggal, bulan, atau tahun pembayaran.</p></div><span className="soft-icon"><CalendarDays size={18} /></span></div><form className="report-filter-form" onSubmit={run}>
      <TextInput label="Dari tanggal" type="date" value={filters.from} onChange={(event) => update("from", event.target.value)} /><TextInput label="Sampai tanggal" type="date" value={filters.to} onChange={(event) => update("to", event.target.value)} /><TextInput label="Bulan" type="month" value={filters.month} onChange={(event) => update("month", event.target.value)} /><TextInput label="Tahun" type="number" min="2000" max="2100" placeholder="Contoh: 2026" value={filters.year} onChange={(event) => update("year", event.target.value)} /><button className="button button-primary" disabled={loading}><Search size={16} /> Terapkan</button>
    </form></section>
    {loading || !data ? <Spinner /> : <>
      <section className="report-summary"><ReportMetric icon={TrendingUp} label="Total pemasukan" value={money(data.totalPayments)} tone="mint" /><ReportMetric icon={ClipboardList} label="Total tagihan" value={money(data.totalBills)} tone="blue" /><ReportMetric icon={Wallet} label="Total pembayaran" value={money(data.totalPayments)} tone="gold" /><ReportMetric icon={TrendingDown} label="Total tunggakan" value={money(data.totalArrears)} tone="rose" /></section>
      <section className="panel report-table"><div className="table-toolbar"><div><h2>Detail pembayaran</h2><p>{data.payments.length} transaksi dalam laporan</p></div></div><DataTable columns={["Kode transaksi", "Tanggal", "Santri", "Periode & rincian", "Jumlah", "Metode"]} rows={data.payments} empty="Tidak ada pembayaran untuk filter ini." renderRow={(row) => <tr key={row.kode_transaksi}><td className="code-cell">{row.kode_transaksi}</td><td>{date(row.tanggal_pembayaran)}</td><td><div className="person-cell"><div className="mini-avatar">{row.nama.slice(0, 1)}</div><div><strong>{row.nama}</strong><span>{row.nis}</span></div></div></td><td>{monthYear(row.periode)}<FeeBreakdown bill={row} /></td><td className="amount-cell">{money(row.jumlah_bayar)}</td><td>{row.metode_pembayaran}</td></tr>} /></section>
      <section className="panel report-table"><div className="table-toolbar"><div><h2>Ringkasan tagihan</h2><p>Status tagihan seluruh santri</p></div></div><DataTable columns={["Santri", "NIS", "Periode", "Rincian tagihan", "Dibayar", "Sisa", "Status"]} rows={data.bills} empty="Belum ada data tagihan." renderRow={(row, index) => <tr key={`${row.nis}-${row.periode}-${index}`}><td>{row.nama}</td><td className="code-cell">{row.nis}</td><td>{monthYear(row.periode)}</td><td>{money(row.nominal)}<FeeBreakdown bill={row} /></td><td>{money(row.total_dibayar)}</td><td>{money(Number(row.nominal) - Number(row.total_dibayar))}</td><td><span className={`badge ${row.status === "Lunas" ? "badge-success" : row.status === "Belum Lunas" ? "badge-warning" : "badge-danger"}`}>{row.status}</span></td></tr>} /></section>
    </>}
  </>;
}

function ReportMetric({ icon: Icon, label, value, tone }) {
  return <article className="report-metric"><span className={`stat-icon ${tone}`}><Icon size={18} /></span><span>{label}</span><strong>{value}</strong></article>;
}

function Account() {
  const { admin, setAdmin, profilePhoto, setProfilePhoto, notify } = useAuth();
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInput = useRef(null);
  async function changePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Pilih file gambar untuk foto profil.", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify("Ukuran foto maksimal 5 MB.", "error");
      return;
    }
    setPhotoBusy(true);
    try {
      const photo = await readProfilePhoto(file);
      window.localStorage.setItem(profilePhotoKey(admin.id), photo);
      setProfilePhoto(photo);
      notify("Foto profil berhasil diperbarui.");
    } catch (error) {
      notify(error.message || "Foto profil tidak dapat disimpan di browser ini.", "error");
    } finally {
      setPhotoBusy(false);
    }
  }
  function removePhoto() {
    try {
      window.localStorage.removeItem(profilePhotoKey(admin.id));
      setProfilePhoto(null);
      notify("Foto profil berhasil dihapus.");
    } catch (error) {
      notify("Foto profil tidak dapat dihapus dari penyimpanan browser.", "error");
    }
  }
  async function submit(event) {
    event.preventDefault(); setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if ((values.newPassword || values.confirmPassword || values.currentPassword) && values.newPassword !== values.confirmPassword) {
      notify("Konfirmasi password tidak sama.", "error"); setSaving(false); return;
    }
    try {
      const updated = await api("/auth/account", { method: "PUT", body: values });
      setAdmin(updated); event.currentTarget.reset(); notify("Pengaturan akun berhasil diperbarui.");
    } catch (error) { notify(error.message, "error"); }
    finally { setSaving(false); }
  }
  return <>
    <PageTitle eyebrow="PREFERENSI" title="Pengaturan Akun" description="Perbarui informasi profil dan kata sandi administrator." />
    <div className="account-layout"><aside className="account-card"><div className={`account-avatar ${profilePhoto ? "avatar-photo" : ""}`}>{profilePhoto ? <img src={profilePhoto} alt={`Foto profil ${admin?.name || "Administrator"}`} /> : (admin?.name || "A").slice(0, 1).toUpperCase()}</div><h2>{admin?.name}</h2><span className="account-role"><ShieldCheck size={14} /> Administrator</span><input ref={photoInput} className="visually-hidden" type="file" accept="image/*" onChange={changePhoto} /><div className="profile-photo-actions"><button type="button" className="button button-outline" onClick={() => photoInput.current?.click()} disabled={photoBusy}><Camera size={15} /> {photoBusy ? "Memproses..." : profilePhoto ? "Ganti foto" : "Unggah foto"}</button>{profilePhoto && <button type="button" className="button button-ghost" onClick={removePhoto}>Hapus</button>}</div><div className="account-separator" /><p>Informasi akun hanya dapat diubah oleh admin yang sedang masuk.</p></aside>
      <section className="panel account-form-panel"><div className="panel-heading"><div><h2>Informasi profil</h2><p>Pastikan data kontak administrator tetap aktif.</p></div><span className="soft-icon"><Settings size={18} /></span></div>
        <form className="account-form" onSubmit={submit}><div className="form-grid"><TextInput label="Nama admin" name="name" defaultValue={admin?.name} required /><TextInput label="Username" name="username" defaultValue={admin?.username} required /><TextInput label="Email" name="email" type="email" defaultValue={admin?.email} required /></div>
          <div className="password-section"><h3>Ganti password</h3><p>Kosongkan bagian password jika tidak ingin menggantinya.</p><div className="form-grid"><TextInput label="Password lama" name="currentPassword" type="password" autoComplete="current-password" /><TextInput label="Password baru" name="newPassword" type="password" minLength="8" autoComplete="new-password" /><TextInput label="Konfirmasi password baru" name="confirmPassword" type="password" minLength="8" autoComplete="new-password" /></div></div>
          <div className="account-save"><span><ShieldCheck size={15} /> Password disimpan dengan enkripsi bcrypt.</span><button className="button button-primary" disabled={saving}>{saving ? "Menyimpan..." : "Simpan perubahan"}</button></div>
        </form></section></div>
  </>;
}

export default App;

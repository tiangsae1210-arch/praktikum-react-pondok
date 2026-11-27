export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "include",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error(
      "Backend tidak dapat dihubungi. Pastikan server berjalan dengan `npm run dev`.",
    );
  }

  let data = null;
  if (response.status !== 204) {
    const body = await response.text();
    if (body) {
      try {
        data = JSON.parse(body);
      } catch {
        if (!response.ok) {
          throw new Error(
            `Backend mengembalikan respons yang tidak valid (HTTP ${response.status}). Periksa konfigurasi .env dan log server.`,
          );
        }
        throw new Error("Backend mengembalikan respons yang tidak valid.");
      }
    } else if (!response.ok) {
      throw new Error(
        `Backend tidak siap (HTTP ${response.status}). Periksa konfigurasi .env dan log server.`,
      );
    }
  }
  if (!response.ok) throw new Error(data?.message || "Permintaan tidak dapat diproses.");
  return data;
}

export const money = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export const date = (value) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(
    new Date(`${String(value).slice(0, 10)}T00:00:00`),
  );
};

export const monthYear = (value) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
    new Date(`${String(value).slice(0, 7)}-01T00:00:00`),
  );
};

export const currentMonth = () => new Date().toISOString().slice(0, 7);

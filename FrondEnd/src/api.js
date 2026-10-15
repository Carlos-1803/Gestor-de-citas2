let csrf;
export async function api(path, options = {}) {
  const method = options.method || "GET";
  if (method !== "GET" && !csrf) {
    const res = await fetch("/api/auth/token");
    if (!res.ok) throw new Error("No se pudo conectar con el servidor.");
    csrf = (await res.json()).token;
  }
  const form = options.body instanceof FormData;
  const res = await fetch("/api" + path, {
    ...options,
    headers: {
      ...(form ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "X-CSRF-TOKEN": csrf }),
      ...options.headers,
    },
    body: options.body
      ? form
        ? options.body
        : JSON.stringify(options.body)
      : undefined,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.message ||
        (res.status === 401
          ? "Inicia sesión para continuar."
          : res.status === 403
            ? "No tienes permiso para realizar esta acción."
            : res.status === 429
              ? "Demasiados intentos. Espera un minuto."
              : "No se pudo completar la solicitud."),
    );
  }
  if (path.startsWith("/auth/") && method !== "GET") csrf = null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
export const money = (value) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    value,
  );
export const states = {
  Pending: "Pendiente",
  Confirmed: "Confirmada",
  Cancelled: "Cancelada",
  Completed: "Completada",
};
export function dateLabel(value, timeZone) {
  return new Date(value).toLocaleString("es-MX", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

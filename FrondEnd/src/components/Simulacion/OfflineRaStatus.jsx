import { useEffect, useState } from "react";

async function askStatus(registration) {
  if (!registration?.active) return null;
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 3000);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
    registration.active.postMessage({ type: "RA_STATUS" }, [channel.port2]);
  });
}
function waitForWorker(worker, states) {
  if (!worker || states.includes(worker.state)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("La actualización no terminó. Revisa tu conexión e inténtalo de nuevo.")), 45000);
    const changed = () => {
      if (states.includes(worker.state)) finish();
      else if (worker.state === "redundant") finish(new Error("No se pudo guardar el paquete offline. Revisa el espacio y la conexión."));
    };
    function finish(error) {
      clearTimeout(timer); worker.removeEventListener("statechange", changed);
      if (error) reject(error); else resolve();
    }
    worker.addEventListener("statechange", changed); changed();
  });
}
export default function OfflineRaStatus() {
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    async function refresh() {
      const registration = await navigator.serviceWorker.getRegistration();
      const value = await askStatus(registration);
      if (active && value) { setStatus(value); if (value.ready) setError(""); }
    }
    const onMessage = event => {
      if (event.data?.type === "RA_CACHE_PROGRESS") { setProgress(event.data); refresh(); }
      if (event.data?.type === "RA_CACHE_ERROR") { setError(`No se completó la descarga: ${event.data.message}. Comprueba el espacio disponible y la conexión.`); setBusy(false); }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.addEventListener("controllerchange", refresh);
    refresh();
    return () => { active = false; navigator.serviceWorker.removeEventListener("message", onMessage); navigator.serviceWorker.removeEventListener("controllerchange", refresh); };
  }, []);
  async function prepare() {
    setBusy(true); setError("");
    try {
      if (!window.isSecureContext || !("serviceWorker" in navigator)) throw new Error("La preparación offline necesita HTTPS o localhost y soporte de Service Worker.");
      const registration = await navigator.serviceWorker.register("/sw.js");
      try { await registration.update(); }
      catch (failure) {
        const cached = await askStatus(registration);
        if (cached?.ready) { setStatus(cached); return; }
        throw failure;
      }
      await waitForWorker(registration.installing, ["installed", "activating", "activated"]);
      if (registration.waiting) {
        const waiting = registration.waiting;
        waiting.postMessage({ type: "SKIP_WAITING" });
        await waitForWorker(waiting, ["activated"]);
      }
      await waitForWorker(registration.active, ["activated"]);
      const ready = registration;
      const value = await askStatus(ready);
      if (value) setStatus(value);
      if (!value?.ready) setError("La descarga o actualización sigue pendiente. Espera la barra de progreso y vuelve a comprobar.");
    } catch (failure) { setError(failure.message || "No se pudo preparar el simulador. Comprueba la conexión y el espacio disponible."); }
    finally { setBusy(false); }
  }
  return <section className="panel simulador-offline" aria-label="Simulador sin conexión">
    <h2>Simulador sin conexión</h2>
    <p role="status">{status?.ready ? `Listo sin conexión: ${status.count} recursos locales (${(status.bytes / 1024 / 1024).toFixed(1)} MB).`
      : "Abre la versión compilada con internet para preparar la interfaz, el detector y los 20 filtros. Después podrás usarlos sin señal."}</p>
    {progress && progress.completed < progress.total && <><progress max={progress.total} value={progress.completed} aria-label="Preparación offline" /><span>{progress.completed} / {progress.total}</span></>}
    <button className="outline" disabled={busy || !import.meta.env.PROD} onClick={prepare}>{busy ? "Preparando…" : "Preparar / comprobar uso sin conexión"}</button>
    {!import.meta.env.PROD && <p>La caché se comprueba con npm run build y npm run preview.</p>}
    {error && <p role="alert">{error}</p>}
    <small>Necesita una primera preparación completa. El navegador puede borrar el almacenamiento; este indicador vuelve a comprobarlo. Reservas y guardado de preferencias requieren conexión. Tras actualizar el paquete, cierra y vuelve a abrir la app.</small>
  </section>;
}

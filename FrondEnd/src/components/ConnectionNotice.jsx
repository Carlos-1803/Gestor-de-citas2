import { useEffect, useState, useSyncExternalStore } from "react";
import { accountSnapshot, saveAccountSnapshot } from "../pwa/cuentas";
import { offlineShell, prepareAccount } from "../pwa/preparacion";
import { serverOnline, serverRead, watchConnection } from "../pwa/red";
import "./ConnectionNotice.css";

const build = document.querySelector('script[type="module"][src]')?.src;
export default function ConnectionNotice({ owner, role, sessionReady }) {
  const online = useSyncExternalStore(watchConnection, serverOnline);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState(null);
  const [hidden, setHidden] = useState(null);
  const key = (role || "visitante") + ":" + (owner || 0);
  useEffect(() => {
    if (!import.meta.env.PROD || !sessionReady || !online) return;
    let current = true;
    let timer;
    Promise.all([offlineShell(), prepareAccount(owner, role, () => current)]).then(() => {
      if (!current) return;
      saveAccountSnapshot(owner || 0, "offline-ready", role || "visitante", build);
      const done = {key, state:"ready", text:"Lista para usar sin conexión"};
      setNotice(done);
      timer = setTimeout(() => setHidden(done), 6000);
    }).catch(error => {
      if (current) setNotice({key, state:"error", text:error.message});
    });
    return () => { current = false; clearTimeout(timer); };
  }, [owner, role, key, online, sessionReady, attempt]);

  useEffect(() => {
    if (online || !navigator.onLine) return;
    // Al pasar de datos móviles al Wi-Fi de la PC Android puede seguir diciendo «en línea».
    function check() {
      if (!document.hidden) serverRead("/api/health").catch(() => {});
    }
    const timer = setInterval(check, 6000);
    window.addEventListener("focus", check);
    return () => { clearInterval(timer); window.removeEventListener("focus", check); };
  }, [online]);

  let state;
  let text;
  if (!online) {
    state = "offline";
    const prepared = accountSnapshot(owner || 0, "offline-ready", role || "visitante") === build;
    text = prepared ? "Sin conexión · Se sincronizará al volver" : "Sin conexión · Disponibles los datos ya guardados";
  } else if (import.meta.env.PROD && sessionReady) {
    if (notice?.key !== key) {
      state = "preparing";
      text = "Preparando la PWA para usarla sin conexión…";
    } else if (notice !== hidden) {
      ({state, text} = notice);
    }
  }
  return <div role="status" className="connection-notice" data-state={state}>{text}
    {state === "error" && <button type="button" onClick={() => { setNotice(null); setAttempt(value => value + 1); }}>Reintentar</button>}
  </div>;
}

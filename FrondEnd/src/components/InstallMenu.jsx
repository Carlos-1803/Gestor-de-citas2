import { useEffect, useRef, useState } from "react";
import "./InstallMenu.css";

const display = window.matchMedia("(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)");
const installedWindow = () => display.matches || navigator.standalone === true || navigator.userAgent.includes("EntreCortesAndroid/");

function deviceInstaller() {
  const platform = navigator.userAgentData?.platform;
  const agent = navigator.userAgent;
  if (platform === "Android" || /\bAndroid\b|EntreCortesAndroid\//i.test(agent)) {
    return { label: "Descargar para Android", file: "EntreCortes.apk", format: "APK" };
  }
  if (platform === "Windows" || /\bWindows NT\b/i.test(agent)) {
    return { label: "Instalar para Windows", file: "EntreCortes.msi", format: "MSI" };
  }
  return null;
}
const installer = deviceInstaller();

function browserHelp() {
  if (!window.isSecureContext) return "Abre EntreCortes con HTTPS de confianza o desde localhost para instalarla.";
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
    return "En Safari, toca Compartir y luego Agregar a inicio.";
  if (/Edg\//.test(navigator.userAgent)) return "En Edge, abre el menú ⋯ y busca Aplicaciones → Instalar EntreCortes.";
  return "En Chrome o Edge, usa el icono de instalación de la barra de direcciones o busca Instalar en el menú del navegador.";
}

export default function InstallMenu() {
  const menu = useRef(null);
  const lookup = useRef(null);
  const pending = useRef(null);
  const [installed, setInstalled] = useState(installedWindow);
  const [packageReady, setPackageReady] = useState(null);
  const [help, setHelp] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function available(event) {
      if (installer) return;
      event.preventDefault();
      pending.current = event;
      setHelp("");
    }
    function complete() { pending.current = null; setInstalled(true); }
    function modeChanged() { setInstalled(installedWindow()); }
    function outside(event) {
      if (menu.current?.open && !menu.current.contains(event.target)) menu.current.open = false;
    }
    function escape(event) {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary").focus();
      }
    }
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", complete);
    display.addEventListener("change", modeChanged);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      lookup.current?.abort();
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", complete);
      display.removeEventListener("change", modeChanged);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  async function toggle(event) {
    setHelp("");
    lookup.current?.abort();
    if (!event.currentTarget.open || !installer) return;
    const request = new AbortController();
    lookup.current = request;
    setPackageReady(null);
    try {
      const response = await fetch("/descargas/disponibles.json", { cache: "no-store", signal: request.signal });
      const ready = response.ok && response.headers.get("content-type")?.includes("application/json")
        && (await response.json()).version === 1;
      if (!request.signal.aborted) setPackageReady(Boolean(ready));
    } catch {
      if (!request.signal.aborted) setPackageReady(false);
    }
  }
  async function install() {
    const prompt = pending.current;
    if (!prompt) { setHelp(browserHelp()); return; }
    pending.current = null;
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } catch { setHelp(browserHelp()); }
    finally { setBusy(false); }
  }

  const label = installer && <>{installer.label} <small>{installer.format}</small></>;
  return <details className="install-menu" ref={menu} onToggle={toggle}>
    <summary aria-label="Instalación y descargas de EntreCortes" title="Instalación y descargas">⋮</summary>
    <div className="install-options">
      {installer ? <>
        {packageReady
          ? <a href={"/descargas/" + installer.file} download={installer.file}>{label}</a>
          : <button type="button" disabled>{label}</button>}
        {packageReady === false && <p role="status">El instalador no está disponible. Comprueba la conexión con EntreCortes y vuelve a abrir este menú.</p>}
      </> : <>
        {installed ? <p>EntreCortes está instalada en este dispositivo.</p> :
          <button type="button" disabled={busy} onClick={install}>Instalar EntreCortes</button>}
        {help && <p role="status">{help}</p>}
      </>}
    </div>
  </details>;
}

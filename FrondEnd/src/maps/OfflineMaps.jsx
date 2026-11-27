import { useCallback, useEffect, useRef, useState } from "react";
import LocationMap from "./LocationMap";
import { clearMapTiles, downloadMapPack, loadMapConfig, mapStats } from "./mapStorage";
import { CAMPECHE, countTiles, ESTIMATED_TILE_BYTES, formatBytes, intersectCampeche } from "./mapRegion";

export default function OfflineMaps() {
  const [config, setConfig] = useState(null);
  const [coverage, setCoverage] = useState("state");
  const [visible, setVisible] = useState(CAMPECHE);
  const [zoom, setZoom] = useState(11);
  const [budget, setBudget] = useState(128);
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState(null);
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const controller = useRef(null);
  const mounted = useRef(false);
  const updateVisibleBounds = useCallback((value) => {
    setVisible(value);
    if (coverage === "visible") setConfirmed(false);
  }, [coverage]);
  useEffect(() => {
    mounted.current = true;
    loadMapConfig().then((value) => { if (mounted.current) setConfig(value); });
    mapStats().then((value) => { if (mounted.current) setStats(value); })
      .catch(() => { if (mounted.current) setMessage("El navegador no permite IndexedDB. La consulta online funciona, pero no se pueden guardar mapas."); });
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);

  const bounds = coverage === "state" ? CAMPECHE : intersectCampeche(visible);
  const total = bounds ? countTiles(bounds, zoom, coverage === "visible") : 0;
  const estimate = total * ESTIMATED_TILE_BYTES;
  async function download() {
    if (!config?.offline || !bounds) return;
    controller.current = new AbortController();
    setBusy(true);
    setMessage("");
    try {
      const result = await downloadMapPack({ source: config.offline, bounds, maxZoom: zoom,
        stateBase: coverage === "visible", maxBytes: budget * 1024 ** 2, signal: controller.current.signal,
        progress(value) { if (mounted.current) setProgress(value); } });
      if (mounted.current) setMessage(`Mapa guardado: ${result.completed} teselas disponibles. Puedes ampliar el detalle desde los niveles descargados.`);
    } catch (error) {
      if (mounted.current) setMessage(error.name === "AbortError"
        ? "Descarga cancelada. Lo completado se conserva; pulsa Descargar para continuar sin repetirlo."
        : `${error.message} Las teselas ya guardadas se conservan para reanudar.`);
    } finally {
      if (mounted.current) {
        setBusy(false);
        setStats(await mapStats().catch(() => null));
        window.dispatchEvent(new Event("barberst:maps-changed"));
      }
    }
  }
  async function clear() {
    if (!window.confirm("¿Borrar únicamente los mapas guardados en este dispositivo? No se borrarán citas ni otros datos.")) return;
    try {
      await clearMapTiles();
      setStats(await mapStats());
      setProgress(null);
      setMessage("Mapas locales eliminados. Las zonas que vuelvas a consultar podrán guardarse de nuevo.");
    } catch (error) { setMessage(error.message); }
  }

  return <section>
    <p className="eyebrow">CAMPECHE · MAPAS EN TU DISPOSITIVO</p>
    <h1>Mapas sin conexión</h1>
    <p>Consulta el mapa, elige el área y el detalle antes de descargar. Las teselas se guardan en IndexedDB, exclusivamente para mapas.</p>
    <LocationMap overview onBounds={updateVisibleBounds} title="Cobertura de Campeche" />
    <div className="panel map-downloads">
      <h2>Descargar mapa offline de Campeche</h2>
      {config?.error && <p className="map-help" role="status">{config.error}</p>}
      {!config?.offline && <p className="map-status" role="status">La descarga regional aún no está disponible: falta configurar una fuente que permita uso offline. El servidor público de OpenStreetMap solo se utiliza para consulta normal; las zonas vistas se guardan automáticamente cuando el navegador lo permite.</p>}
      <div className="form-row">
        <label className="field">Cobertura
          <select value={coverage} disabled={busy} onChange={(event) => { setCoverage(event.target.value); setConfirmed(false); }}>
            <option value="state">Todo Campeche</option><option value="visible">Área visible + base estatal en zoom 8</option>
          </select>
        </label>
        <label className="field">Detalle máximo
          <select value={zoom} disabled={busy} onChange={(event) => { setZoom(Number(event.target.value)); setConfirmed(false); }}>
            {[8, 9, 10, 11, 12, 13, 14, 15].map((z) => <option key={z} value={z}>Zoom {z}{z === 11 ? " · recomendado para base estatal" : z === 15 ? " · calles" : ""}</option>)}
          </select>
        </label>
        <label className="field">Límite para nuevos datos (MiB)
          <select value={budget} disabled={busy} onChange={(event) => setBudget(Number(event.target.value))}>
            {[32, 64, 128, 256, 512, 1024, 2048, 4096].map((size) => <option key={size} value={size}>{size} MiB</option>)}
          </select>
        </label>
      </div>
      <p>{total.toLocaleString("es-MX")} teselas · estimación orientativa: <strong>{formatBytes(estimate)}</strong> a 25 KiB por tesela. El tamaño real depende del proveedor.</p>
      {coverage === "visible" && <p className="map-help">Mueve y acerca el mapa para ajustar el área. Se incluyen las teselas base de todo Campeche en zoom 8 para ampliar ese nivel cuando falte detalle.</p>}
      {!bounds && <p role="alert">El área visible no intersecta la cobertura de Campeche.</p>}
      {total > 5000 && <label className="checkbox"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />Entiendo que esta descarga puede ser grande y tardar. Usaré una conexión y almacenamiento adecuados.</label>}
      <div className="actions">
        <button type="button" className="primary" disabled={busy || !config?.offline || !bounds || (total > 5000 && !confirmed)} onClick={download}>Descargar mapa offline de Campeche</button>
        {busy && <button type="button" className="outline" onClick={() => controller.current?.abort()}>Cancelar descarga</button>}
        <button type="button" className="outline" disabled={busy} onClick={clear}>Borrar mapas de este dispositivo</button>
      </div>
      {progress && <div className="map-progress" role="status">
        <progress max={progress.total} value={progress.completed} aria-label="Progreso de descarga del mapa" />
        <p>{progress.completed.toLocaleString("es-MX")} / {progress.total.toLocaleString("es-MX")} · {formatBytes(progress.bytes)} nuevos · {progress.reused} reutilizados</p>
      </div>}
      {message && <p className="map-status" role="status">{message}</p>}
      {stats && <p>{stats.count.toLocaleString("es-MX")} teselas guardadas · {formatBytes(stats.bytes)} en este dispositivo.
        {stats.lastPack && <> Última descarga: {new Date(stats.lastPack.finishedAt).toLocaleString("es-MX")} ({stats.lastPack.complete ? "completa" : "parcial"}).</>}
      </p>}
      <p className="map-help">Mantén esta pantalla abierta durante la descarga. La app solicita almacenamiento persistente, pero el navegador o el sistema pueden eliminarlo. La reapertura completa de React sin red aún depende de implementar el App Shell de la auditoría; guardar mapas no agrega sincronización de citas.</p>
    </div>
  </section>;
}

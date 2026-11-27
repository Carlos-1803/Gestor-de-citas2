import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { HAIR_STYLES, linkCatalog } from "./hairCatalog.js";
import { crearDetector, iniciarCamara, liberarCamara } from "./servicioSimulacion.js";
import { createHairRenderer } from "./hairRenderer.js";
import OfflineRaStatus from "./OfflineRaStatus.jsx";
import "./simulacion.css";

export function SimulacionView({ user }) {
  const videoRef = useRef(null), canvasRef = useRef(null), engineRef = useRef(null);
  const requestId = useRef(0);
  const [catalog, setCatalog] = useState(() => linkCatalog([]));
  const [key, setKey] = useState("classic");
  const [tone, setTone] = useState("#24160e");
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState(0);
  const [input, setInput] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const settings = { key, tone, scale, offset };
  const latest = useRef(settings);
  useEffect(() => { latest.current = { key, tone, scale, offset }; engineRef.current?.update(latest.current); }, [key, tone, scale, offset]);
  useEffect(() => {
    let active = true;
    api("/haircuts").then(rows => { if (active && Array.isArray(rows)) setCatalog(linkCatalog(rows)); })
      .catch(() => { /* Local catalog is complete and available without the API. */ });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!input) return;
    const controller = new AbortController();
    let detector = null, stream = null, engine = null;
    async function start() {
      try {
        if (input.kind === "camera") {
          stream = await iniciarCamara(controller.signal);
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          controller.signal.throwIfAborted();
        }
        detector = await crearDetector(input.kind === "camera" ? "VIDEO" : "IMAGE", controller.signal);
        controller.signal.throwIfAborted();
        const live = input.kind === "camera", video = videoRef.current;
        engine = createHairRenderer(canvasRef.current, {
          live, mirror: live,
          width: () => live ? video.videoWidth : input.image.width,
          height: () => live ? video.videoHeight : input.image.height,
          ready: () => live && video.readyState >= 2,
          time: () => video.currentTime,
          detect: () => detector.detectForVideo(video, performance.now()),
        }, latest.current, text => { if (!controller.signal.aborted) setMessage(text); }, failure => {
          if (!controller.signal.aborted) { setError(failure.message || "Falló el seguimiento facial."); setPhase("error"); liberarCamara(stream); }
        });
        engineRef.current = engine;
        if (!live) engine.setResult(detector.detect(input.image));
        setPhase("active");
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(failure.message || "No se pudo iniciar el detector. Revisa los recursos offline."); setPhase("error");
        }
        liberarCamara(stream); detector?.close(); detector = null;
      }
    }
    start();
    return () => {
      controller.abort(); engine?.dispose();
      if (engineRef.current === engine) engineRef.current = null;
      liberarCamara(stream); detector?.close();
    };
  }, [input]);
  useEffect(() => {
    const counter = requestId;
    return () => { counter.current++; };
  }, []);
  function camera() {
    requestId.current++; setError(""); setMessage("Preparando cámara y detector local…"); setPhase("loading");
    setInput({ kind: "camera", id: requestId.current });
  }
  async function photo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const version = ++requestId.current;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) {
      setError("Elige una foto JPG, PNG o WebP de hasta 10 MB."); return;
    }
    setInput(null); setPhase("loading"); setError(""); setMessage("Leyendo foto local…");
    try {
      const bitmap = await createImageBitmap(file);
      const factor = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      const image = document.createElement("canvas");
      image.width = Math.max(1, Math.round(bitmap.width * factor)); image.height = Math.max(1, Math.round(bitmap.height * factor));
      image.getContext("2d").drawImage(bitmap, 0, 0, image.width, image.height); bitmap.close();
      if (version !== requestId.current) return;
      setInput({ kind: "photo", image, preview: image.toDataURL("image/jpeg", .9) });
    } catch { if (version === requestId.current) { setPhase("error"); setError("No se pudo abrir esa foto. Intenta con otro JPG o PNG."); } }
    event.target.value = "";
  }
  async function selectStyle(cut) {
    setKey(cut.key);
    // Preserve the existing server selection only when an authenticated client is online.
    if (user?.role === "Client" && cut.haircutId && navigator.onLine) {
      try { await api("/preferencias/guardar", { method: "POST", body: { estiloId: cut.haircutId } }); }
      catch { setError("El filtro está seleccionado, pero no se pudo guardar la preferencia en el servidor."); }
    }
  }
  const selected = HAIR_STYLES.find(style => style.key === key);
  return <main className="simulador-container">
    <header className="simulador-header">
      <span className="simulador-etiqueta">K'iin BARBER</span>
      <h1>Simulador de cortes AR</h1>
      <p>Prueba los 20 cortes con tu cámara o una foto. El ajuste sigue el rostro; las vistas son ilustrativas.</p>
    </header>
    <section className="simulador-layout">
      <div className="simulador-camara">
        <video ref={videoRef} className="simulador-video" autoPlay muted playsInline hidden={input?.kind !== "camera"} />
        {input?.kind === "photo" && <img className="simulador-foto" src={input.preview} alt="Foto local para probar el corte" />}
        <canvas ref={canvasRef} className="simulador-canvas" aria-label={`Filtro ${selected.name}`} />
        {!input && <div className="simulador-inicio"><span className="simulador-icono">✦</span>
          <h2>Prueba tu próximo corte</h2><p>Activa tu cámara o carga una foto frontal con la frente visible.</p>
        </div>}
      </div>
      <div className="simulador-source-controls">
        <button className="simulador-boton" onClick={camera} disabled={phase === "loading"}>Activar cámara</button>
        <button className="outline" disabled={!input} onClick={() => { requestId.current++; setInput(null); setPhase("idle"); setMessage("Cámara desactivada."); setError(""); }}>Detener vista previa</button>
        <label className="field">Cargar foto del rostro<input type="file" accept="image/jpeg,image/png,image/webp" onChange={photo} /></label>
        <p role="status">{phase === "loading" ? "Preparando vista previa… " : ""}{message || "Cámara desactivada. Las fotos permanecen en este dispositivo."}</p>
        {error && <p role="alert">{error}</p>}
      </div>
      <aside className="simulador-panel">
        <h2>Elige tu estilo</h2><p>Seleccionado: <strong>{selected.name}</strong>. {catalog.length} filtros disponibles.</p>
        <div className="simulador-ajustes">
          <label className="field">Tono de cabello<input type="color" value={tone} onInput={e => setTone(e.currentTarget.value)} onChange={e => setTone(e.target.value)} /></label>
          <label className="field">Escala: {Math.round(scale * 100)}%<input type="range" min="0.7" max="1.4" step="0.01" value={scale} onChange={e => setScale(Number(e.target.value))} /></label>
          <label className="field">Altura: {Math.round(offset * 100)}%<input type="range" min="-0.3" max="0.3" step="0.01" value={offset} onChange={e => setOffset(Number(e.target.value))} /></label>
          <button className="outline" onClick={() => { setScale(1); setOffset(0); }}>Restablecer ajuste</button>
        </div>
        <div className="simulador-cortes">{catalog.map(cut => <button key={cut.key} aria-pressed={cut.key === key}
          className={`simulador-corte ${cut.key === key ? "seleccionado" : ""}`} onClick={() => selectStyle(cut)}>
          <span className="corte-nombre">{cut.name}</span><span className="corte-descripcion">{cut.description}</span>
        </button>)}</div>
        <p className="simulador-nota">Hebras y sombras se preparan al elegir el corte. La altura respeta la frente y protege las cejas. La coronilla se estima; la superposición no elimina el cabello real ni predice un resultado exacto.</p>
      </aside>
      <OfflineRaStatus />
    </section>
  </main>;
}

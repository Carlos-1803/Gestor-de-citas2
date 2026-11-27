import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Tooltip, Rectangle, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import { divIcon, Map as LeafletMap } from "leaflet";
import { GestureHandling } from "leaflet-gesture-handling";
import PersistentTileLayer from "./PersistentTileLayer";
import { sourceKey } from "./mapConfig";
import { loadMapConfig } from "./mapStorage";
import { requestPreciseLocation } from "./preciseLocation";
import { CAMPECHE_BOUNDS, CANDELARIA, inCampeche, validCoordinates } from "./mapRegion";
import "leaflet/dist/leaflet.css";
import "leaflet-gesture-handling/dist/leaflet-gesture-handling.css";
import "./maps.css";

LeafletMap.addInitHook("addHandler", "gestureHandling", GestureHandling);
const pin = divIcon({ className: "barberst-pin", html: '<span aria-hidden="true">●</span>', iconSize: [36, 46], iconAnchor: [18, 42] });

function GpsViewport({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.latitude, target.longitude], 16);
    else map.stop();
  }, [map, target]);
  return null;
}

function MapContents({ selectedPosition, editable, choose, config, onBounds, overview }) {
  const map = useMap();
  useMapEvents({
    click(event) { if (editable) choose(event.latlng.lat, event.latlng.lng); },
    moveend() {
      const bounds = map.getBounds();
      onBounds?.({ minLat: bounds.getSouth(), maxLat: bounds.getNorth(), minLon: bounds.getWest(), maxLon: bounds.getEast() });
    },
  });
  useEffect(() => {
    if (!config) return;
    const layer = new PersistentTileLayer(config, {
      tileSize: 256, minNativeZoom: 8, maxNativeZoom: 15, minZoom: 7, maxZoom: 18,
      keepBuffer: 1, noWrap: true, updateWhenIdle: true,
      bounds: overview ? CAMPECHE_BOUNDS : undefined,
    }).addTo(map);
    const redraw = () => layer.redraw();
    window.addEventListener("online", redraw);
    window.addEventListener("barberst:maps-changed", redraw);
    return () => {
      window.removeEventListener("online", redraw);
      window.removeEventListener("barberst:maps-changed", redraw);
      map.removeLayer(layer);
    };
  }, [config, map, overview]);
  useEffect(() => {
    if (!editable && !overview && selectedPosition) map.setView(selectedPosition, Math.max(map.getZoom(), 13));
  }, [selectedPosition, editable, overview, map]);
  useEffect(() => {
    const element = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [map]);

  return <>
    <ZoomControl position="bottomright" zoomInTitle="Acercar mapa" zoomOutTitle="Alejar mapa" />
    {overview && <Rectangle bounds={CAMPECHE_BOUNDS} pathOptions={{ color: "#956e2e", weight: 2, fillOpacity: 0.04 }} />}
    {selectedPosition && <Marker position={selectedPosition} icon={pin}
      draggable={editable} title="Ubicación de la barbería"
      eventHandlers={{ dragend(event) {
        const point = event.target.getLatLng();
        if (!inCampeche(point.lat, point.lng)) event.target.setLatLng(selectedPosition);
        choose(point.lat, point.lng);
      } }}>
      <Tooltip>Ubicación de la barbería</Tooltip>
    </Marker>}

  </>;
}

export default function LocationMap({ latitude, longitude, editable = false, existing = false, onChange,
  overview = false, onBounds, title = "Ubicación de la barbería" }) {
  const label = useId();
  // Controlled by the form: click, drag and GPS all write through onChange.
  // No separate device marker or local copy of the selected coordinates.
  const selectedPosition = useMemo(() => validCoordinates(latitude, longitude)
    ? [latitude, longitude] : null, [latitude, longitude]);
  const [config, setConfig] = useState(null);
  const [message, setMessage] = useState("");
  const [locationError, setLocationError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [gpsTarget, setGpsTarget] = useState(null);
  const interaction = useRef(0);
  const mounted = useRef(false);
  const gpsAttempt = useRef(0);
  const gpsController = useRef(null);
  const currentPoint = useRef({ latitude, longitude });
  useEffect(() => { currentPoint.current = { latitude, longitude }; }, [latitude, longitude]);
  useEffect(() => {
    mounted.current = true;
    loadMapConfig().then((value) => { if (mounted.current) setConfig(value); });
    return () => { mounted.current = false; gpsController.current?.abort(); };
  }, []);

  const choose = useCallback((lat, lon) => {
    interaction.current++;
    gpsController.current?.abort();
    setLocationError(false);
    if (!inCampeche(lat, lon)) {
      setLocationError(true);
      setMessage("Elige un punto dentro del área de Campeche. Las coordenadas anteriores se conservan.");
      return;
    }
    setGpsTarget(null);
    onChange?.({ latitude: lat, longitude: lon });
    setMessage("Ubicación seleccionada. Guarda el perfil para enviarla al servidor.");
  }, [onChange]);

  const locate = useCallback(async (automatic = false) => {
    setLocationError(false);
    if (!window.isSecureContext) {
      setLocationError(true);
      setMessage("La geolocalización requiere conexión segura HTTPS o localhost. Puedes colocar el pin en el mapa.");
      return;
    }
    const version = interaction.current;
    const attempt = ++gpsAttempt.current;
    const initialPoint = currentPoint.current;
    gpsController.current?.abort();
    const controller = new AbortController();
    gpsController.current = controller;
    setLocating(true);
    setMessage("Obteniendo ubicación del dispositivo…");
    try {
      const point = await requestPreciseLocation({ signal: controller.signal, onFallback() {
        if (mounted.current && attempt === gpsAttempt.current && version === interaction.current) {
          setMessage("TIMEOUT (3): La búsqueda de alta precisión agotó el tiempo. Reintentando con ubicación por red/Wi-Fi…");
        }
      } });
      if (!mounted.current || attempt !== gpsAttempt.current) return;
      const current = currentPoint.current;
      if (version !== interaction.current || (automatic && (current.latitude !== initialPoint.latitude || current.longitude !== initialPoint.longitude))) return;
      if (!inCampeche(point.latitude, point.longitude)) {
        setLocationError(true);
        setMessage("La ubicación recibida está fuera del área de Campeche. Selecciona manualmente la ubicación del local.");
        return;
      }
      const precision = point.accuracy === null ? "precisión no informada" : `precisión reportada ±${Math.ceil(point.accuracy)} m`;
      if (automatic && existing) setMessage(`Ubicación del dispositivo disponible (${precision}). Se conserva la ubicación del negocio; pulsa el botón GPS para sustituirla.`);
      else {
        choose(point.latitude, point.longitude);
        setGpsTarget({ latitude: point.latitude, longitude: point.longitude, attempt });
        setMessage(`Ubicación del dispositivo seleccionada (${precision}${point.fallback ? "; reintento por red/Wi-Fi" : ""}). Confirma el pin antes de guardar.`);
      }
    } catch (error) {
      if (mounted.current && attempt === gpsAttempt.current && error.name !== "AbortError" && version === interaction.current) {
        setLocationError(true);
        setMessage(error.message);
      }
    } finally {
      if (mounted.current && attempt === gpsAttempt.current) setLocating(false);
    }
  }, [choose, existing]);

  useEffect(() => {
    if (!editable) return;
    const timer = setTimeout(() => locate(true), 0);
    return () => clearTimeout(timer);
  }, [editable, locate]);

  const center = selectedPosition || [CANDELARIA.latitude, CANDELARIA.longitude];
  return <section className="location-map" aria-labelledby={label}>
    <h3 id={label}>{title}</h3>
    <p className="map-help">{editable ? "Toca para colocar el pin o arrástralo. " : ""}Usa dos dedos para mover el mapa; con uno puedes desplazar la página.</p>
    <MapContainer center={overview ? undefined : center} zoom={overview ? undefined : 13} bounds={overview ? CAMPECHE_BOUNDS : undefined}
      maxBounds={overview ? CAMPECHE_BOUNDS : undefined} maxBoundsViscosity={1}
      minZoom={7} maxZoom={18} scrollWheelZoom={false} zoomControl={false}
      gestureHandling gestureHandlingOptions={{ text: { touch: "Usa dos dedos para mover el mapa", scroll: "Usa Ctrl + rueda para acercar", scrollMac: "Usa ⌘ + rueda para acercar" } }}>
      <MapContents selectedPosition={selectedPosition} editable={editable} choose={choose}
        config={config} onBounds={onBounds} overview={overview} />
      <GpsViewport target={gpsTarget} />
    </MapContainer>
    {editable && <button type="button" className="outline map-gps" disabled={locating} onClick={() => locate(false)}>
      {locating ? "Obteniendo GPS..." : "Usar mi ubicación GPS actual"}
    </button>}
    {locating && <button type="button" className="text-button" onClick={() => {
      gpsController.current?.abort();
      setMessage("Búsqueda cancelada. Selecciona el local tocando o arrastrando el pin en el mapa.");
    }}>Cancelar búsqueda GPS</button>}
    {editable && !selectedPosition && <p className="map-status" role="status">Vista de referencia de Candelaria. Aún no has seleccionado la ubicación del local; elige un punto o usa la ubicación del dispositivo.</p>}
    <div className="map-attribution">
      © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
      {config?.online.name !== "OpenStreetMap" && config?.online && <> · <a href={config.online.attributionUrl} target="_blank" rel="noreferrer">{config.online.attribution}</a></>}
      {config?.offline && sourceKey(config.offline) !== sourceKey(config.online) && <> · <a href={config.offline.attributionUrl} target="_blank" rel="noreferrer">{config.offline.attribution}</a></>}
    </div>
    {message && <p role={locationError ? "alert" : "status"} className="map-status">{message}</p>}
    {validCoordinates(latitude, longitude) && !inCampeche(latitude, longitude) && <p className="map-help">Esta ubicación guardada está fuera de la cobertura offline de Campeche.</p>}
    <small>El detalle sin conexión depende de las teselas guardadas. Si falta una tesela, se amplía su nivel disponible más cercano.</small>
  </section>;
}

import { useEffect, useState, useSyncExternalStore } from "react";
import { dateLabel } from "../api";
import { dismissRequest, receipts, localRequests, moveBooking, watchQueue } from "./reservas";

import { requestedInstant } from "./horario";
import { serverOnline, watchConnection } from "./red";
import { readPublic } from "./catalogo";

function OtherSlot({ row }) {
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState([]);
  const [start, setStart] = useState("");
  const [clock, setClock] = useState("");
  const [error, setError] = useState("");
  const online = useSyncExternalStore(watchConnection, serverOnline);
  const manual = Boolean(date && (clock || (!online && !slots.length)));
  useEffect(() => {
    if (!date) return;
    let active = true;
    readPublic("/offerings/" + row.body.offeringId + "/slots?date=" + date)
      .then(values => { if (active) setSlots(values.filter(s => Date.parse(s.start) !== Date.parse(row.body.start))); })
      .catch(e => { if (active && !(e.cause instanceof TypeError)) setError(e.message); });
    return () => { active = false; };
  }, [date, online, row.body.offeringId, row.body.start]);
  async function move() {
    try { await moveBooking(row, manual ? requestedInstant(date, clock, row.zone) : start); }
    catch (e) { setError(e.message); }
  }
  return <fieldset><legend>Elegir otro horario</legend>
    <label>Fecha <input type="date" value={date} onChange={e => {
      setDate(e.target.value); setStart(""); setSlots([]); setClock(""); setError("");
    }} /></label>
    {manual ? <label>Hora solicitada · {row.zone}
      <input type="time" value={clock} onChange={e => setClock(e.target.value)} />
      <small>Se comprobará la disponibilidad al reconectar.</small>
    </label> : <label>Horario <select value={start} onChange={e => setStart(e.target.value)}>
      <option value="">Selecciona una hora</option>
      {slots.map(s => <option key={s.start} value={s.start}>{s.label}</option>)}
    </select></label>}
    <button type="button" className="outline" disabled={!(manual ? clock : start)} onClick={move}>Conservar servicio y productos</button>
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}

export default function LocalBookings({ owner, role = "Client", kind }) {
  const [allRows, setRows] = useState(() => localRequests(owner, role));
  useEffect(() => {
    const refresh = () => setRows(localRequests(owner, role));
    refresh();
    return watchQueue(refresh);
  }, [owner, role]);
  const rows = kind ? allRows.filter(row => row.kind === kind) : allRows;
  const history = receipts(owner, role).filter(entry => !kind || entry.kind === kind);
  const receipt = history[0]?.text;
  if (!rows.length) return receipt ? (
    <details className="muted"><summary>Sincronizado · {receipt}</summary>
      <ul>{history.map(entry => <li key={entry.key}>{entry.text}</li>)}</ul>
    </details>
  ) : null;
  const issues = rows.filter(r => ["rechazada","revisar"].includes(r.state)).length;
  const summary = issues ? (issues === 1 ? "1 cambio requiere atención" : issues+" cambios requieren atención")
    : rows.length === 1 ? "1 cambio pendiente de envío" : rows.length+" cambios pendientes de envío";
  return <details className="pwa-queue" open={issues ? true : undefined}>
    <summary>{summary}</summary>
    {rows.map(row => <article className="panel" key={row.key}>
      <strong>{{ pendiente: "Pendiente de envío", enviando: "Enviando…",
        rechazada: "Solicitud rechazada", revisar: row.kind ? "Verifica el cambio" : "Comprueba tu agenda" }[row.state]}</strong>
      <p>{row.description}{!row.kind && row.body.start && " · " + dateLabel(row.body.start, row.zone)}</p>
      {["catalog", "createCut"].includes(row.kind) && <details><summary>Datos guardados</summary>
        <p>{row.body.name} · {row.body.active ? "Disponible" : "Inactivo"}</p><p>{row.body.description}</p>
      </details>}
      {row.kind === "profile" && <p>{Object.keys(row.body).filter(k => row.body[k] !== row.base[k]).map(k => row.body[k]).join(" · ")}</p>}
      {row.state === "pendiente" && <p>Se enviará con tu cuenta cuando abras EntreCortes con conexión.</p>}
      {row.state === "rechazada" && <p>{row.message}{row.body.offeringId && /horario|ocupad/i.test(row.message) && " Puedes elegir otro horario."}</p>}
      {row.state === "rechazada" && row.body.offeringId && /horario|ocupad/i.test(row.message) && <OtherSlot row={row} />}
      {row.state === "revisar" && <p>El envío quedó sin recibo. {row.kind ? "Comprueba el registro antes de repetirlo." : "Consulta tus citas antes de volver a reservar."}</p>}
      {row.state !== "enviando" && <button className="outline small"
        onClick={() => dismissRequest(row)}>{row.state === "pendiente" ? "Retirar solicitud local" : "Quitar aviso"}</button>}
    </article>)}
  </details>;
}

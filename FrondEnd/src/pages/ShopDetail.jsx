import { useEffect, useState, useSyncExternalStore } from "react";
import { api, money } from "../api";
import { requestedInstant } from "../pwa/horario";
import { serverOnline, watchConnection } from "../pwa/red";
import { readPublic } from "../pwa/catalogo";
import ShopPhoto from "../pwa/ShopPhoto";
import { ownerPreview, serverId } from "../pwa/gestion";
import { addRequest, localRequests } from "../pwa/reservas";
import Field from "../components/Field";
const phone = window.matchMedia("(max-width: 650px)");
function watchLayout(notify) {
  phone.addEventListener("change",notify);
  return () => phone.removeEventListener("change",notify);
}

function ShopDetail({ id, user, login, back, notify, booked }) {
  const online = useSyncExternalStore(watchConnection, serverOnline);
  const mobile = useSyncExternalStore(watchLayout, () => phone.matches);
  const role = user?.role, owner = user?.id;
  const [data, setData] = useState(null);
  const [offerId, setOfferId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [manual, setManual] = useState(false);
  const [clock, setClock] = useState("");
  const [start, setStart] = useState("");
  const [quantities, setQuantities] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      const key = role === "Barber" ? serverId(owner,id) : id;
      if (role === "Barber") {
        const rows = localRequests(owner,"Barber");
        if (id < 0 || !serverOnline() || rows.some(row => row.kind === "management" && serverId(owner,row.shopId) === key)) {
          const local = ownerPreview(owner,id,rows);
          if (local) return local;
        }
      }
      return readPublic("/shops/"+key);
    }
    load().then(value => { if (active) setData(value); }).catch(error => { if (active) notify(error.message); });
    return () => {active=false;};
  }, [id, notify, owner, role]);
  useEffect(() => {
    if (!offerId || !date) return;
    let cancelled = false;
    readPublic(`/offerings/${offerId}/slots?date=${date}`)
      .then((value) => {
        if (!cancelled) {setSlots(value); setManual(!serverOnline() && !value.length);}
      })
      .catch((e) => {
        if (!cancelled) {
          if (e.cause instanceof TypeError) setManual(true);
          else notify(e.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [offerId, date, notify]);
  if (!data)
    return (
      <p className="empty">
        Cargando perfil… <button onClick={back}>Volver</button>
      </p>
    );
  const { shop, barbers, offerings, products, photos } = data;
  const offer = offerings.find((o) => o.id === Number(offerId));
  const total =
    (offer?.price || 0) +
    products.reduce((sum, p) => sum + p.price * (quantities[p.id] || 0), 0);
  const manualTime = manual || Boolean(clock) || (!online && !loadingSlots && offerId && date && !slots.length);
  function changeSlot(field, value) {
    setStart("");
    setClock("");
    setManual(false);
    setSlots([]);
    setLoadingSlots(true);
    field(value);
  }
  async function reserve(e) {
    e.preventDefault();
    if (!user) {
      login();
      return;
    }
    setBusy(true);
    try {
      const body = {
        offeringId: Number(offerId), start: manualTime ? requestedInstant(date,clock,shop.timeZone) : start,
        items: products.filter(p => quantities[p.id] > 0)
          .map(p => ({ productId: p.id, quantity: Number(quantities[p.id]) })),
      };
      if (navigator.locks) {
        await addRequest(user.id, body, shop.name + " · " + offer.name, shop.timeZone, {
          shopId:shop.id, barber:barbers.find(b => b.id === offer.barberId)?.name, cut:offer.name,
          items:body.items.map(i => ({name:products.find(p => p.id === i.productId)?.name,quantity:i.quantity})),
        });
      } else {
        if (!navigator.onLine) throw Error("Abre la PWA en HTTPS para guardar una reserva sin conexión.");
        const result = await api("/bookings", { method: "POST", body });
        notify(`Cita #${result.id} registrada. Total: ${money(result.total)}.`);
      }
      booked();
    } catch (e) {
      notify(e.message);
      setStart("");
      setSlots([]);
      if (offerId && date)
        readPublic(`/offerings/${offerId}/slots?date=${date}`)
          .then(setSlots)
          .catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const lat = shop.latitude,
    lon = shop.longitude;
  const locationCard = (
    <section className="panel">
      <p className="eyebrow">CONOCE EL ESPACIO</p>
      <h2>El lugar de tu próximo corte</h2>
      {photos.length > 0 ? (
        <div className="gallery">
          {photos.map((p) => (
            <figure key={p.id}>
              <ShopPhoto photo={p} owner={owner} alt={`${p.kind} de ${shop.name}`} />
              <figcaption>
                {p.kind === "Exterior" ? "Exterior" : "Interior"}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="muted">
          La barbería todavía no ha publicado fotos de sus instalaciones.
        </p>
      )}
      {online ? (
        <>
          <iframe
            title={`Mapa de ${shop.name}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.008},${lat - 0.005},${lon + 0.008},${lat + 0.005}&layer=mapnik&marker=${lat},${lon}`}
          />
          <a
            href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir mapa y ubicación ↗
          </a>
        </>
      ) : <p className="muted">El mapa interactivo estará disponible al recuperar la conexión.</p>}
    </section>
  );
  const productFields = (
    <>
      {products.length ? (
        products.map((p) => (
          <div className="product-row" key={p.id}>
            <div>
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              <small>
                {p.stock} disponibles · {money(p.price)}
              </small>
            </div>
            <Field label="Cantidad">
              <input
                aria-label={`Cantidad de ${p.name}`}
                type="number"
                min="0"
                max={Math.min(100, p.stock)}
                value={quantities[p.id] || 0}
                onChange={(e) =>
                  setQuantities({
                    ...quantities,
                    [p.id]: Math.max(
                      0,
                      Math.min(100, p.stock, Number(e.target.value)),
                    ),
                  })
                }
              />
            </Field>
          </div>
        ))
      ) : (
        <p className="muted">Aún no hay productos publicados.</p>
      )}
      <small>
        Los productos se encargan junto con tu cita y se pagan en la
        barbería.
      </small>
    </>
  );
  const bookingCard = (
    <aside className="panel booking-panel">
      <p className="eyebrow">HAZ UN ESPACIO PARA TI</p>
      <h2>Reserva tu cita</h2>
      <form onSubmit={reserve}>
        <Field label="Corte y barbero">
          <select
            required
            aria-describedby={mobile && offer ? "detalle-servicio" : undefined}
            value={offerId}
            onChange={(e) => changeSlot(setOfferId, e.target.value)}
          >
            <option value="">Selecciona un servicio</option>
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {barbers.find((b) => b.id === o.barberId)?.name}{" "}
                · {money(o.price)} / {o.minutes} min
              </option>
            ))}
          </select>
        </Field>
        {mobile && offer && <small id="detalle-servicio" className="service-description">
          {offer.name} con {barbers.find(b => b.id === offer.barberId)?.name} · {offer.minutes} min · {money(offer.price)}
        </small>}
        <Field label={`Fecha · horario de ${shop.timeZone}`}>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => changeSlot(setDate, e.target.value)}
          />
        </Field>
        {manualTime ? (
          <Field label={"Hora solicitada · " + shop.timeZone}>
            <input type="time" required value={clock} onChange={e => setClock(e.target.value)} />
            <small>Se comprobará la disponibilidad al reconectar.</small>
          </Field>
        ) : (
        <Field label="Horario disponible">
          <select
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          >
            <option value="">
              {loadingSlots && offerId && date
                ? "Consultando…"
                : "Selecciona una hora"}
            </option>
            {slots.map((s) => (
              <option key={s.start} value={s.start}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        )}
        {!manualTime && offerId && date && !loadingSlots && slots.length === 0 && (
          <p className="muted">
            {online ? "No hay horarios disponibles. Prueba otro día." : "Sin horarios guardados para esta selección."}
          </p>
        )}
        {mobile && products.length > 0 && (
          <details className="booking-products">
            <summary>Productos opcionales</summary>
            {productFields}
          </details>
        )}
        <div className="receipt">
          <p>
            <span>Servicio</span>
            <b>{money(offer?.price || 0)}</b>
          </p>
          {products
            .filter((p) => quantities[p.id] > 0)
            .map((p) => (
              <p key={p.id}>
                <span>
                  {p.name} × {quantities[p.id]}
                </span>
                <b>{money(p.price * quantities[p.id])}</b>
              </p>
            ))}
          <p className="total">
            <span>Total estimado</span>
            <b>{money(total)}</b>
          </p>
        </div>
        <p className="muted">
          Pago en el establecimiento. La barbería confirma tu cita.
        </p>
        <button
          className="primary"
          disabled={busy || !(manualTime ? clock : start) || (user && user.role !== "Client")}
        >
          {busy
            ? "Reservando…"
            : user
              ? "Reservar cita"
              : "Iniciar sesión para reservar"}
        </button>
        {user && user.role !== "Client" && (
          <p className="muted">Usa una cuenta de cliente para reservar.</p>
        )}
      </form>
    </aside>
  );
  return (
    <>
      <button className="text-button" onClick={back}>
        ← Todas las barberías
      </button>
      <section className="profile-heading">
        <p className="eyebrow">TU ESTILO TIENE UN LUGAR</p>
        <h1>{shop.name}</h1>
        <p>{shop.description}</p>
        <span>
          Ubicación: {shop.address} · {shop.phone}
        </span>
      </section>
      <div className="detail-layout">
        {mobile ? <>{bookingCard}{locationCard}</> : (
          <>
            <div>
              {locationCard}
              <section className="panel">
                <p className="eyebrow">PARA LLEVAR TU ESTILO CONTIGO</p>
                <h2>Productos del establecimiento</h2>
                {productFields}
              </section>
            </div>
            {bookingCard}
          </>
        )}

      </div>
    </>
  );
}

export default ShopDetail;

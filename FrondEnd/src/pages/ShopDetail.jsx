import { useEffect, useState } from "react";
import { api, money } from "../api";
import Field from "../components/Field";
function ShopDetail({ id, user, login, back, notify, booked }) {
  const [data, setData] = useState(null);
  const [offerId, setOfferId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [start, setStart] = useState("");
  const [quantities, setQuantities] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/shops/${id}`)
      .then(setData)
      .catch((e) => notify(e.message));
  }, [id, notify]);
  useEffect(() => {
    if (!offerId || !date) return;
    let cancelled = false;
    api(`/offerings/${offerId}/slots?date=${date}`)
      .then((value) => {
        if (!cancelled) setSlots(value);
      })
      .catch((e) => {
        if (!cancelled) notify(e.message);
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
  function changeSlot(field, value) {
    setStart("");
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
      const result = await api("/bookings", {
        method: "POST",
        body: {
          offeringId: Number(offerId),
          start,
          items: products
            .filter((p) => quantities[p.id] > 0)
            .map((p) => ({
              productId: p.id,
              quantity: Number(quantities[p.id]),
            })),
        },
      });
      notify(
        `Cita #${result.id} registrada. Total: ${money(result.total)}. Puedes consultar su estado en Mis citas.`,
      );
      booked();
    } catch (e) {
      notify(e.message);
      setStart("");
      setSlots([]);
      if (offerId && date)
        api(`/offerings/${offerId}/slots?date=${date}`)
          .then(setSlots)
          .catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const lat = shop.latitude,
    lon = shop.longitude;
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
        <div>
          <section className="panel">
            <p className="eyebrow">CONOCE EL ESPACIO</p>
            <h2>El lugar de tu próximo corte</h2>
            {photos.length > 0 ? (
              <div className="gallery">
                {photos.map((p) => (
                  <figure key={p.id}>
                    <img src={p.url} alt={`${p.kind} de ${shop.name}`} />
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
          </section>
          <section className="panel">
            <p className="eyebrow">PARA LLEVAR TU ESTILO CONTIGO</p>
            <h2>Productos del establecimiento</h2>
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
          </section>
        </div>
        <aside className="panel booking-panel">
          <p className="eyebrow">HAZ UN ESPACIO PARA TI</p>
          <h2>Reserva tu cita</h2>
          <form onSubmit={reserve}>
            <Field label="Corte y barbero">
              <select
                required
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
            <Field label={`Fecha · horario de ${shop.timeZone}`}>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => changeSlot(setDate, e.target.value)}
              />
            </Field>
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
            {offerId && date && !loadingSlots && slots.length === 0 && (
              <p className="muted">
                No hay horarios disponibles. Prueba otro día.
              </p>
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
              disabled={busy || !start || (user && user.role !== "Client")}
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
      </div>
    </>
  );
}

export default ShopDetail;

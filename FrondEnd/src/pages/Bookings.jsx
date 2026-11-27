import Field from "../components/Field";
import ReviewForm from "../components/ReviewForm";
import ReviewList from "../components/ReviewList";
import { useCallback, useEffect, useState } from "react";
import { api, money, states, dateLabel } from "../api";
function Bookings({ user, notify, shopId = null, reviewsOnly = false }) {
  const [items, setItems] = useState(null);
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewBooking, setReviewBooking] = useState(null);
  const [reviewCustomer, setReviewCustomer] = useState(null);
  const load = useCallback(
    () =>
      api("/bookings" + (shopId ? `?shopId=${shopId}` : ""))
        .then(setItems)
        .catch((e) => notify(e.message)),
    [notify, shopId],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function change(id, status) {
    setBusy(true);
    try {
      await api(`/bookings/${id}/status`, { method: "PUT", body: { status } });
      await load();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  const visible = items?.filter(
    (b) =>
      (!reviewsOnly || b.status === "Completed") && (!day ||
      new Intl.DateTimeFormat("en-CA", {
        timeZone: b.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(b.start)) === day),
  );
  return (
    <section>
      <p className="eyebrow">CADA CITA, EN SU MOMENTO</p>
      <div className="section-head">
        <h1>{reviewsOnly ? "Clientes de citas completadas" : user.role === "Barber" ? "Tu agenda" : "Mis citas"}</h1>
        <Field label="Filtrar día (zona de cada barbería)">
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </Field>
        <button className="outline" onClick={() => setDay("")}>
          Ver todas
        </button>
      </div>
      {user.role === "Client" && <ReviewList endpoint="/me/reviews" title="Calificaciones que recibiste" />}
      {user.role === "Barber" && !reviewsOnly && (
        <MonthCalendar items={items || []} choose={setDay} />
      )}
      {items === null ? (
        <p className="empty">Cargando agenda…</p>
      ) : !visible.length ? (
        <p className="empty">No hay citas para mostrar.</p>
      ) : (
        <div className="agenda">
          {visible.map((b) => (
            <article key={b.id} className="panel appointment">
              <div>
                <span className={"status " + b.status}>{states[b.status]}</span>
                <h3>{dateLabel(b.start, b.timeZone)}</h3>
                <p>
                  {b.shop} · {b.barber}
                </p>
                <small>
                  {b.timeZone} · Cita #{b.id}
                </small>
              </div>
              <div>
                <h3>{b.haircutName}</h3>
                <p>Cliente: {b.customer}</p>
                <p>Servicio: {money(b.servicePrice)}</p>
                {b.items.map((p, i) => (
                  <p key={i}>
                    {p.name} × {p.quantity} · {money(p.quantity * p.unitPrice)}
                  </p>
                ))}
                <strong>Total: {money(b.total)}</strong>
              </div>
              <div className="actions">
                {b.status === "Completed" && <>
                  {(user.role === "Client" ? b.clientReviewId : b.shopReviewId)
                    ? <span className="chip">Reseña publicada</span>
                    : <button className="outline small" onClick={() => setReviewBooking(b)}>
                      {user.role === "Client" ? "Calificar barbería" : "Calificar cliente"}
                    </button>}
                  {user.role === "Barber" && <button className="text-button" onClick={() => setReviewCustomer(b)}>Ver calificaciones del cliente</button>}
                </>}
                {["Pending", "Confirmed"].includes(b.status) && (
                  <>
                    {user.role === "Barber" && b.status === "Pending" && (
                      <button
                        disabled={busy}
                        className="primary small"
                        onClick={() => change(b.id, "Confirmed")}
                      >
                        Confirmar
                      </button>
                    )}
                    {user.role === "Barber" &&
                      b.status === "Confirmed" &&
                      new Date(b.end) <= new Date() && (
                        <button
                          disabled={busy}
                          className="outline small"
                          onClick={() => change(b.id, "Completed")}
                        >
                          Completar
                        </button>
                      )}
                    {(user.role === "Barber" ||
                      new Date(b.start) > new Date()) && (
                      <button
                        disabled={busy}
                        className="danger small"
                        onClick={() => change(b.id, "Cancelled")}
                      >
                        Cancelar cita
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {reviewCustomer && <div className="panel">
        <button className="text-button" onClick={() => setReviewCustomer(null)}>Cerrar calificaciones del cliente</button>
        <ReviewList key={`${reviewCustomer.shopId}-${reviewCustomer.customerId}`}
          endpoint={`/manage/shops/${reviewCustomer.shopId}/customers/${reviewCustomer.customerId}/reviews`}
          title={`Calificaciones de ${reviewCustomer.customer} en esta sucursal`} />
      </div>}
      {reviewBooking && <ReviewForm bookingId={reviewBooking.id}
        target={user.role === "Client" ? reviewBooking.shop : reviewBooking.customer}
        close={() => setReviewBooking(null)} saved={async () => {
          setReviewBooking(null);
          notify("Reseña publicada. Gracias por compartir tu experiencia.");
          await load();
        }} />}
    </section>
  );
}
function MonthCalendar({ items, choose }) {
  const [month, setMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [year, mon] = month.split("-").map(Number);
  const offset = new Date(year, mon - 1, 1).getDay();
  const days = new Date(year, mon, 0).getDate();
  return (
    <div className="panel calendar">
      <Field label="Calendario mensual">
        <input
          type="month"
          value={month}
          onChange={(e) => {
            if (e.target.value) setMonth(e.target.value);
          }}
        />
      </Field>
      <div className="calendar-grid">
        {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
          <b key={d}>{d}</b>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={"empty" + i} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const count = items.filter(
            (b) =>
              b.status !== "Cancelled" &&
              new Intl.DateTimeFormat("en-CA", {
                timeZone: b.timeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date(b.start)) === date,
          ).length;
          return (
            <button
              key={date}
              onClick={() => choose(date)}
              className={count ? "has-citas" : ""}
            >
              {i + 1}
              <small>
                {count ? `${count} cita${count > 1 ? "s" : ""}` : "—"}
              </small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default Bookings;

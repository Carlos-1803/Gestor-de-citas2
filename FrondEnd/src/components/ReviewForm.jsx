import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api";

export default function ReviewForm({ bookingId, target, saved, close }) {
  const id = useId();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  function keyboard(event) {
    if (event.key === "Escape" && !busy) close();
    if (event.key !== "Tab") return;
    const fields = [...dialog.current.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)")];
    const first = fields[0], last = fields.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/reviews", { method: "POST", body: { bookingId, rating, comment } });
      await saved();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <div className="overlay">
    <section ref={dialog} tabIndex={-1} onKeyDown={keyboard} className="modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <button type="button" className="close" onClick={close} disabled={busy} aria-label="Cerrar reseña">×</button>
      <p className="eyebrow">CITA #{bookingId} · COMPLETADA</p>
      <h2 id={`${id}-title`}>Calificar a {target}</h2>
      <form onSubmit={submit}>
        <fieldset className="review-rating"><legend>Puntuación</legend>
          <div className="rating-options">{[1, 2, 3, 4, 5].map((star) => <label key={star} className={star <= rating ? "selected" : ""}>
            <input type="radio" required name={`${id}-rating`} value={star} checked={rating === star}
              onChange={() => setRating(star)} aria-label={`${star} ${star === 1 ? "estrella" : "estrellas"}`} />
            <span aria-hidden="true">★</span>
          </label>)}</div>
          <small>{rating ? `${rating} de 5 estrellas` : "Elige de 1 a 5 estrellas"}</small>
        </fieldset>
        <label className="field">Comentario (opcional)
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} rows={4}
            placeholder="Comparte tu experiencia con respeto." />
        </label>
        <small>{comment.length}/2000 caracteres. La reseña se publica una sola vez por cita.</small>
        {error && <p role="alert" className="review-error">{error}</p>}
        <div className="actions">
          <button className="primary" disabled={busy || !rating}>{busy ? "Publicando…" : "Publicar reseña"}</button>
          <button type="button" className="outline" onClick={close} disabled={busy}>Cancelar</button>
        </div>
      </form>
    </section>
  </div>;
}

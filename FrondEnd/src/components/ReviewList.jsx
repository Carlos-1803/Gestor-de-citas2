import { useEffect, useState } from "react";
import { api, dateLabel } from "../api";

export default function ReviewList({ endpoint, title = "Reseñas y calificaciones" }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api(`${endpoint}?page=${page}`)
      .then((value) => { if (!cancelled) { setResult(value); setError(""); } })
      .catch((failure) => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [endpoint, page, attempt]);

  function changePage(value) { setResult(null); setError(""); setPage(value); }
  return <section className="panel review-list" aria-label={title}>
    <h2>{title}</h2>
    {error ? <div role="alert"><p>{error}</p><button className="outline" onClick={() => setAttempt(attempt + 1)}>Reintentar reseñas</button></div>
      : !result ? <p role="status">Cargando reseñas…</p> : <>
        <div className="review-summary">
          <span className="review-stars" aria-label={result.count ? `${result.average} de 5 estrellas` : "Sin calificaciones"}>
            <span aria-hidden="true">{"★".repeat(Math.round(result.average || 0))}{"☆".repeat(5 - Math.round(result.average || 0))}</span>
          </span>
          <strong>{result.count ? `${result.average.toLocaleString("es-MX")} / 5` : "Sin reseñas todavía"}</strong>
          <span>{result.count} {result.count === 1 ? "reseña" : "reseñas"}</span>
        </div>
        {result.items.map((review) => <article className="review-item" key={review.id}>
          <div className="section-head">
            <strong>{review.direction === "ShopToClient" ? review.shopName : review.authorName}</strong>
            <span className="review-stars" aria-label={`${review.rating} de 5 estrellas`}><span aria-hidden="true">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></span>
          </div>
          <p className="review-comment">{review.comment || "Sin comentario."}</p>
          <small>{dateLabel(review.createdAt)} · Cita verificada</small>
        </article>)}
        {result.count > result.pageSize && <div className="actions">
          <button className="outline small" disabled={page <= 1} onClick={() => changePage(page - 1)}>Reseñas anteriores</button>
          <span>Página {page} de {Math.ceil(result.count / result.pageSize)}</span>
          <button className="outline small" disabled={page * result.pageSize >= result.count} onClick={() => changePage(page + 1)}>Más reseñas</button>
        </div>}
      </>}
  </section>;
}

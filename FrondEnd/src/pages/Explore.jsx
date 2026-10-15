import { useEffect, useState } from "react";
import { api } from "../api";
function Explore({ open, notify }) {
  const [shops, setShops] = useState(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    api("/shops")
      .then(setShops)
      .catch((e) => {
        notify(e.message);
        setShops([]);
      });
  }, [notify]);
  const visible = shops?.filter((s) =>
    (s.name + " " + s.address).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">BUEN ESTILO. SIN ESPERAS.</p>
          <h1>
            Tu próximo corte
            <br />
            empieza <em>aquí.</em>
          </h1>
          <p>
            Encuentra tu barbería, elige a tu barbero y reserva un espacio para
            ti.
          </p>
          <a href="#barberias" className="primary link-button">
            Encuentra tu barbería ↗
          </a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="ring" />
          <span className="scissors">✂</span>
          <span className="art-label">
            EL DETALLE
            <br />
            HACE EL ESTILO.
          </span>
          <span className="art-number">01 / TU MOMENTO</span>
        </div>
      </section>
      <section id="barberias">
        <div className="section-head">
          <div>
            <p className="eyebrow">DESCUBRE TU PRÓXIMO LUGAR</p>
            <h2>Barberías para ti</h2>
          </div>
          <input
            aria-label="Buscar barbería o dirección"
            className="search"
            placeholder="Buscar nombre o dirección…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {!shops ? (
          <p className="empty">Cargando barberías…</p>
        ) : visible.length ? (
          <div className="shop-grid">
            {visible.map((s, i) => (
              <button
                className="shop-card"
                key={s.id}
                onClick={() => open(s.id)}
              >
                <div className="shop-cover">
                  {s.photo ? (
                    <img src={s.photo} alt={`Instalaciones de ${s.name}`} />
                  ) : (
                    <div className="cover-placeholder">
                      <span>✂</span>
                      <small>DESCUBRE TU ESTILO</small>
                    </div>
                  )}
                  <span className="number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="card-body">
                  <h3>
                    {s.name}
                    <span>↗</span>
                  </h3>
                  <p>{s.address}</p>
                  <span className="chip">Ver cortes y horarios</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty">
            <h3>
              {query
                ? "No encontramos coincidencias"
                : "Las próximas barberías estarán aquí"}
            </h3>
            <p>
              {query
                ? "Prueba con otra dirección o nombre."
                : "¿Tienes una barbería? Crea una cuenta de barbero y publica tu establecimiento."}
            </p>
          </div>
        )}
      </section>
      <section className="steps">
        <div>
          <b>01</b>
          <h3>Encuentra tu lugar</h3>
          <p>Consulta servicios, ubicación e instalaciones.</p>
        </div>
        <div>
          <b>02</b>
          <h3>Elige tu estilo</h3>
          <p>Selecciona corte, barbero y productos.</p>
        </div>
        <div>
          <b>03</b>
          <h3>Reserva tu momento</h3>
          <p>Elige un horario disponible y revisa tu total.</p>
        </div>
      </section>
    </>
  );
}

export default Explore;

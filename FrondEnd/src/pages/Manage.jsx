import { useCallback, useEffect, useState } from "react";
import { api, money, dateLabel } from "../api";
import Field from "../components/Field";
const initialShop = {
  name: "",
  description: "",
  address: "",
  phone: "",
  latitude: 20.9674,
  longitude: -89.5926,
  timeZone: "America/Merida",
};
function Manage({ open, notify }) {
  const [shops, setShops] = useState([]);
  const [selected, setSelected] = useState("");
  const [shop, setShop] = useState(initialShop);
  const [team, setTeam] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [cuts, setCuts] = useState([]);
  const [barberId, setBarberId] = useState("");
  const [tab, setTab] = useState("profile");
  const [busy, setBusy] = useState(false);
  const loadShops = useCallback(
    () =>
      api("/manage/shops")
        .then(setShops)
        .catch((e) => notify(e.message)),
    [notify],
  );
  const loadTeam = useCallback(
    () =>
      selected
        ? Promise.all([
            api(`/manage/shops/${selected}/team`),
            api(`/shops/${selected}`),
          ])
            .then(([t, p]) => {
              setTeam(t);
              setPhotos(p.photos);
            })
            .catch((e) => notify(e.message))
        : Promise.resolve(),
    [selected, notify],
  );
  useEffect(() => {
    loadShops();
    api("/haircuts")
      .then(setCuts)
      .catch((e) => notify(e.message));
  }, [loadShops, notify]);
  useEffect(() => {
    loadTeam();
  }, [loadTeam]);
  async function action(fn) {
    setBusy(true);
    try {
      await fn();
      notify("Cambios guardados.");
      await loadTeam();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  function selectShop(id) {
    setSelected(id);
    setShop(shops.find((s) => s.id === Number(id)) || initialShop);
    setTeam(null);
    setBarberId("");
  }
  async function saveShop(e) {
    e.preventDefault();
    await action(async () => {
      const result = await api(
        "/manage/shops" + (selected ? `/${selected}` : ""),
        { method: selected ? "PUT" : "POST", body: shop },
      );
      await loadShops();
      if (result?.id) setSelected(String(result.id));
    });
  }
  const barber = team?.barbers.find((b) => b.id === Number(barberId));
  return (
    <section>
      <p className="eyebrow">TU NEGOCIO, A TU MANERA</p>
      <div className="section-head">
        <h1>Mi barbería</h1>
        {selected && (
          <button className="outline" onClick={() => open(Number(selected))}>
            Ver perfil público ↗
          </button>
        )}
      </div>
      <div className="toolbar">
        <Field label="Establecimiento">
          <select value={selected} onChange={(e) => selectShop(e.target.value)}>
            <option value="">+ Registrar nueva barbería</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="tabs">
          {[
            ["profile", "Perfil y fotos"],
            ["team", "Barberos y horarios"],
            ["products", "Productos"],
          ].map(([key, label]) => (
            <button
              className={tab === key ? "active" : ""}
              key={key}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === "profile" && (
        <div className="manage-columns">
          <form className="panel" onSubmit={saveShop}>
            <h2>
              {selected ? "Datos del establecimiento" : "Publica tu barbería"}
            </h2>
            {[
              ["name", "Nombre", 120],
              ["description", "Descripción", 2000],
              ["address", "Dirección completa", 500],
              ["phone", "Teléfono", 30],
              ["timeZone", "Zona horaria (IANA)", 100],
            ].map(([key, label, max]) => (
              <Field label={label} key={key}>
                <input
                  required
                  maxLength={max}
                  value={shop[key]}
                  onChange={(e) => setShop({ ...shop, [key]: e.target.value })}
                />
              </Field>
            ))}
            <div className="form-row">
              {[
                ["latitude", "Latitud", -90, 90],
                ["longitude", "Longitud", -180, 180],
              ].map(([key, label, min, max]) => (
                <Field label={label} key={key}>
                  <input
                    type="number"
                    step="any"
                    min={min}
                    max={max}
                    required
                    value={shop[key]}
                    onChange={(e) =>
                      setShop({ ...shop, [key]: Number(e.target.value) })
                    }
                  />
                </Field>
              ))}
            </div>
            <p className="muted">
              Indica las coordenadas exactas de tu local. Sus horarios usan la
              zona horaria indicada.
            </p>
            <button className="primary" disabled={busy}>
              {busy
                ? "Guardando…"
                : selected
                  ? "Guardar perfil"
                  : "Registrar barbería"}
            </button>
          </form>
          <section className="panel">
            <h2>Fotografías del local</h2>
            <p className="muted">
              Opcionales. Añade fotos del exterior y del interior. JPEG, PNG o
              WebP; hasta 5 MB por foto.
            </p>
            {selected ? (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const body = new FormData(form);
                    action(async () => {
                      await api(`/manage/shops/${selected}/photos`, {
                        method: "POST",
                        body,
                      });
                      form.reset();
                    });
                  }}
                >
                  <Field label="Tipo de fotografía">
                    <select name="kind">
                      <option>Exterior</option>
                      <option>Interior</option>
                    </select>
                  </Field>
                  <Field label="Fotografía">
                    <input
                      name="photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      required
                    />
                  </Field>
                  <button className="outline" disabled={busy}>
                    Subir foto
                  </button>
                </form>
                <div className="gallery">
                  {photos.map((p) => (
                    <figure key={p.id}>
                      <img src={p.url} alt={p.kind} />
                      <figcaption>
                        {p.kind}{" "}
                        <button
                          disabled={busy}
                          className="text-button"
                          onClick={() =>
                            action(() =>
                              api(`/manage/photos/${p.id}`, {
                                method: "DELETE",
                              }),
                            )
                          }
                        >
                          Quitar
                        </button>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </>
            ) : (
              <p>Primero registra la barbería.</p>
            )}
          </section>
        </div>
      )}
      {tab === "team" &&
        (!selected ? (
          <p className="empty">
            Registra primero tu barbería en Perfil y fotos.
          </p>
        ) : !team ? (
          <p className="empty">Cargando equipo…</p>
        ) : (
          <>
            <div className="manage-columns">
              <section className="panel">
                <h2>Tu equipo</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget;
                    const name = new FormData(f).get("name");
                    action(async () => {
                      const b = await api(`/manage/shops/${selected}/barbers`, {
                        method: "POST",
                        body: { name, active: true },
                      });
                      setBarberId(String(b.id));
                      f.reset();
                    });
                  }}
                >
                  <Field label="Nombre del barbero">
                    <input name="name" required maxLength="120" />
                  </Field>
                  <button className="primary" disabled={busy}>
                    Añadir barbero
                  </button>
                </form>
                <Field label="Barbero a configurar">
                  <select
                    value={barberId}
                    onChange={(e) => setBarberId(e.target.value)}
                  >
                    <option value="">Selecciona un barbero</option>
                    {team.barbers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                        {b.active ? "" : " (inactivo)"}
                      </option>
                    ))}
                  </select>
                </Field>
                {barber && (
                  <form
                    key={barber.id}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      action(() =>
                        api(`/manage/barbers/${barber.id}`, {
                          method: "PUT",
                          body: {
                            name: f.get("name"),
                            active: f.get("active") === "on",
                          },
                        }),
                      );
                    }}
                  >
                    <Field label="Nombre visible">
                      <input
                        name="name"
                        required
                        maxLength="120"
                        defaultValue={barber.name}
                      />
                    </Field>
                    <label className="checkbox">
                      <input
                        name="active"
                        type="checkbox"
                        defaultChecked={barber.active}
                      />{" "}
                      Disponible para nuevas reservas
                    </label>
                    <button disabled={busy} className="outline">
                      Guardar barbero
                    </button>
                  </form>
                )}
              </section>
              {barber ? (
                <section className="panel">
                  <h2>Cortes que realiza {barber.name}</h2>
                  <p className="muted">
                    Selecciona un corte compartido y define precio y duración.
                    Guardar un corte existente actualiza su oferta.
                  </p>
                  <form
                    key={barber.id}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      action(() =>
                        api(`/manage/barbers/${barber.id}/offerings`, {
                          method: "POST",
                          body: {
                            haircutId: Number(f.get("haircutId")),
                            price: Number(f.get("price")),
                            minutes: Number(f.get("minutes")),
                            active: true,
                          },
                        }),
                      );
                    }}
                  >
                    <Field label="Corte del catálogo">
                      <select required name="haircutId">
                        {cuts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="form-row">
                      <Field label="Precio MXN">
                        <input
                          name="price"
                          type="number"
                          required
                          min="0"
                          max="9999999"
                          step="0.01"
                        />
                      </Field>
                      <Field label="Duración (minutos)">
                        <input
                          name="minutes"
                          type="number"
                          required
                          min="5"
                          max="480"
                          defaultValue="30"
                        />
                      </Field>
                    </div>
                    <button className="primary" disabled={busy}>
                      Guardar servicio
                    </button>
                  </form>
                  {team.offerings
                    .filter((o) => o.barberId === barber.id)
                    .map((o) => (
                      <div key={o.id} className="list-row">
                        <span>
                          {cuts.find((c) => c.id === o.haircutId)?.name ||
                            "Corte desactivado"}
                          <small>
                            {money(o.price)} · {o.minutes} min ·{" "}
                            {o.active ? "Activo" : "Inactivo"}
                          </small>
                        </span>
                        <button
                          disabled={busy}
                          className="outline small"
                          onClick={() =>
                            action(() =>
                              api(`/manage/barbers/${barber.id}/offerings`, {
                                method: "POST",
                                body: { ...o, active: !o.active },
                              }),
                            )
                          }
                        >
                          {o.active ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    ))}
                </section>
              ) : (
                <section className="empty">
                  Selecciona un barbero para configurar sus servicios y
                  horarios.
                </section>
              )}
            </div>
            {barber && (
              <div className="manage-columns">
                <Schedule
                  key={`${barber.id}-${JSON.stringify(team.periods)}`}
                  barber={barber}
                  periods={team.periods.filter((p) => p.barberId === barber.id)}
                  zone={shop.timeZone}
                  busy={busy}
                  save={(periods) =>
                    action(() =>
                      api(`/manage/barbers/${barber.id}/periods`, {
                        method: "PUT",
                        body: periods,
                      }),
                    )
                  }
                />
                <section className="panel">
                  <h2>Descansos y bloqueos</h2>
                  <p className="muted">
                    Fechas en la zona de tu navegador:{" "}
                    {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      action(() =>
                        api(`/manage/barbers/${barber.id}/blocks`, {
                          method: "POST",
                          body: {
                            start: new Date(f.get("start")).toISOString(),
                            end: new Date(f.get("end")).toISOString(),
                          },
                        }),
                      );
                    }}
                  >
                    <Field label="Desde">
                      <input name="start" type="datetime-local" required />
                    </Field>
                    <Field label="Hasta">
                      <input name="end" type="datetime-local" required />
                    </Field>
                    <button className="outline" disabled={busy}>
                      Bloquear periodo
                    </button>
                  </form>
                  {team.blocks
                    .filter((b) => b.barberId === barber.id)
                    .map((b) => (
                      <div className="list-row" key={b.id}>
                        <span>
                          {dateLabel(b.startUtc + "Z", shop.timeZone)}
                          <small>
                            Hasta {dateLabel(b.endUtc + "Z", shop.timeZone)}
                          </small>
                        </span>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            action(() =>
                              api(`/manage/blocks/${b.id}`, {
                                method: "DELETE",
                              }),
                            )
                          }
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                </section>
              </div>
            )}
          </>
        ))}
      {tab === "products" &&
        (!selected ? (
          <p className="empty">Registra primero una barbería.</p>
        ) : (
          <section className="panel">
            <h2>Productos y existencias</h2>
            <p className="muted">
              Indica las unidades disponibles, descontando los encargos activos.
              Cancelar una cita devuelve sus unidades automáticamente.
            </p>
            <ProductEditor
              key={selected}
              busy={busy}
              save={(p) =>
                action(() =>
                  api(`/manage/shops/${selected}/products`, {
                    method: "POST",
                    body: p,
                  }),
                )
              }
            />
            {team?.products.map((p) => (
              <ProductEditor
                key={JSON.stringify(p)}
                product={p}
                busy={busy}
                save={(r) =>
                  action(() =>
                    api(`/manage/products/${p.id}`, { method: "PUT", body: r }),
                  )
                }
              />
            ))}
          </section>
        ))}
    </section>
  );
}
function Schedule({ barber, periods, zone, save, busy }) {
  const [rows, setRows] = useState(
    periods.map((p) => ({
      day: p.day,
      startMinute: p.startMinute,
      endMinute: p.endMinute,
    })),
  );
  const format = (value) =>
    `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  const parse = (value) => {
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };
  function update(i, field, value) {
    setRows(rows.map((r, j) => (j === i ? { ...r, [field]: value } : r)));
  }
  return (
    <section className="panel">
      <h2>Horario de {barber.name}</h2>
      <p className="muted">
        Zona: {zone}. Usa dos periodos en un día para dejar un descanso entre
        ellos. Los cambios aplican a nuevas reservas; las citas existentes
        conservan su horario.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(rows);
        }}
      >
        {rows.map((r, i) => (
          <div className="schedule-row" key={i}>
            <select
              aria-label="Día de la semana"
              value={r.day}
              onChange={(e) => update(i, "day", Number(e.target.value))}
            >
              {[
                "Domingo",
                "Lunes",
                "Martes",
                "Miércoles",
                "Jueves",
                "Viernes",
                "Sábado",
              ].map((d, v) => (
                <option key={v} value={v}>
                  {d}
                </option>
              ))}
            </select>
            <input
              aria-label="Hora de inicio"
              type="time"
              required
              value={format(r.startMinute)}
              onChange={(e) => update(i, "startMinute", parse(e.target.value))}
            />
            <input
              aria-label="Hora de fin"
              type="time"
              required
              value={format(r.endMinute)}
              onChange={(e) => update(i, "endMinute", parse(e.target.value))}
            />
            <button
              type="button"
              aria-label="Eliminar periodo"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <div className="actions">
          <button
            type="button"
            className="outline"
            onClick={() =>
              setRows([...rows, { day: 1, startMinute: 540, endMinute: 1080 }])
            }
          >
            + Periodo
          </button>
          <button disabled={busy} className="primary">
            Guardar horario
          </button>
        </div>
      </form>
    </section>
  );
}
function ProductEditor({ product, save, busy }) {
  return (
    <form
      className="product-editor"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save({
          name: f.get("name"),
          description: f.get("description"),
          price: Number(f.get("price")),
          stock: Number(f.get("stock")),
          active: f.get("active") === "on",
        });
      }}
    >
      <h3>{product ? product.name : "Nuevo producto"}</h3>
      <div className="form-row">
        <Field label="Nombre">
          <input
            name="name"
            required
            maxLength="120"
            defaultValue={product?.name}
          />
        </Field>
        <Field label="Descripción">
          <input
            name="description"
            required
            maxLength="1000"
            defaultValue={product?.description}
          />
        </Field>
        <Field label="Precio MXN">
          <input
            name="price"
            required
            type="number"
            min="0"
            max="9999999"
            step="0.01"
            defaultValue={product?.price}
          />
        </Field>
        <Field label="Unidades disponibles">
          <input
            name="stock"
            required
            type="number"
            min="0"
            max="1000000"
            defaultValue={product?.stock || 0}
          />
        </Field>
      </div>
      <div className="actions">
        <label className="checkbox">
          <input
            type="checkbox"
            name="active"
            defaultChecked={product?.active ?? true}
          />{" "}
          Publicado
        </label>
        <button className="outline small" disabled={busy}>
          {product ? "Actualizar producto" : "Añadir producto"}
        </button>
      </div>
    </form>
  );
}

export default Manage;

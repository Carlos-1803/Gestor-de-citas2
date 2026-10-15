import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import Field from "../components/Field";
function Catalog({ notify }) {
  const [cuts, setCuts] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api("/haircuts")
        .then(setCuts)
        .catch((e) => notify(e.message)),
    [notify],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function save(e, id) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("/admin/haircuts" + (id ? `/${id}` : ""), {
        method: id ? "PUT" : "POST",
        body: {
          name: f.get("name"),
          description: f.get("description"),
          active: f.get("active") === "on",
        },
      });
      await load();
      notify("Catálogo guardado.");
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <p className="eyebrow">ADMINISTRACIÓN</p>
      <h1>Catálogo compartido</h1>
      <p>
        Estos cortes se reutilizan en todas las barberías. Cada barbero define
        su precio y duración.
      </p>
      {[null, ...cuts].map((c) => (
        <form
          className="panel"
          key={c?.id || "new"}
          onSubmit={(e) => save(e, c?.id)}
        >
          <h3>{c ? c.name : "Añadir corte"}</h3>
          <div className="form-row">
            <Field label="Nombre">
              <input
                name="name"
                required
                maxLength="120"
                defaultValue={c?.name}
              />
            </Field>
            <Field label="Descripción">
              <input
                name="description"
                required
                maxLength="1000"
                defaultValue={c?.description}
              />
            </Field>
          </div>
          <div className="actions">
            <label className="checkbox">
              <input
                name="active"
                type="checkbox"
                defaultChecked={c?.active ?? true}
              />{" "}
              Disponible en el catálogo
            </label>
            <button disabled={busy} className="outline">
              Guardar
            </button>
          </div>
        </form>
      ))}
    </section>
  );
}

export default Catalog;

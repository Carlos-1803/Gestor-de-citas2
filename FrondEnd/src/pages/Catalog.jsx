import { useCallback, useEffect, useState } from "react";
import { accountList, cutFields } from "../pwa/cuentas";
import { addAccountChange, agendaEvent, localRequests, reviseCut, watchQueue } from "../pwa/reservas";
import LocalBookings from "../pwa/LocalBookings";
import { api } from "../api";
import Field from "../components/Field";
function Catalog({ owner, notify }) {
  const [cuts, setCuts] = useState([]);
  const [pending,setPending] = useState(() => localRequests(owner,"Admin"));
  useEffect(() => watchQueue(() => setPending(localRequests(owner,"Admin"))),[owner]);
  const changes = pending.filter(r => r.state === "pendiente" && ["createCut","catalog"].includes(r.kind));
  const visibleCuts = cuts.map(c => ({...c,...changes.find(r => r.kind === "catalog" && r.target === c.id)?.body}));
  for (const row of changes) if (row.kind === "createCut") visibleCuts.push({id:row.target,...row.body});
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => accountList(owner, "catalog", "Admin").then(setCuts).catch(e => notify(e.message)), [owner, notify]);
  useEffect(() => {
    load();
    window.addEventListener(agendaEvent, load);
    window.addEventListener("online", load);
    return () => {
      window.removeEventListener(agendaEvent, load);
      window.removeEventListener("online", load);
    };
  }, [load]);
  async function save(e, id) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    try {
      const body = cutFields({ name: f.get("name"), description: f.get("description"), active: f.has("active") });
      const pendingCut = changes.find(r => r.target === id);
      if (pendingCut) {
        await reviseCut(pendingCut,body);
        return;
      }
      const base = id ? cutFields(cuts.find(c => c.id === id)) : null;
      if (id && JSON.stringify(base) === JSON.stringify(body)) return;
      if (!navigator.locks) {
        if (!navigator.onLine) throw Error("Abre la PWA mediante HTTPS para guardar cambios sin conexión.");
        await api("/admin/haircuts" + (id ? "/" + id : ""), {method: id ? "PUT" : "POST", body});
        if (!id) form.reset();
        await load();
        notify("Catálogo guardado.");
        return;
      }
      await addAccountChange(owner, id ? "catalog" : "createCut", id || crypto.randomUUID(),
        base, body, (id ? "Editar corte · " : "Crear corte · ") + body.name, "Admin");
      if (!id) form.reset();
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
      <LocalBookings owner={owner} role="Admin" />
      {[null, ...visibleCuts].map((c) => (
        <form
          className="panel"
          key={c ? JSON.stringify(c) : "new"}
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

import { useState } from "react";
import { api } from "../api";
import Field from "../components/Field";
function Auth({ close, done }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      done(
        await api("/auth/" + (register ? "register" : "login"), {
          method: "POST",
          body: data,
        }),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="overlay">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <button className="close" onClick={close} aria-label="Cerrar">
          ×
        </button>
        <p className="eyebrow">BIENVENIDO A ENTRECORTES</p>
        <h2 id="auth-title">
          {register ? "Crea tu cuenta" : "Qué gusto verte"}
        </h2>
        <form onSubmit={submit}>
          {register && (
            <Field label="Nombre completo">
              <input name="name" autoComplete="name" required maxLength="120" />
            </Field>
          )}
          <Field label="Correo electrónico">
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength="254"
            />
          </Field>
          <Field label="Contraseña">
            <input
              name="password"
              type="password"
              minLength={register ? 10 : 1}
              maxLength="128"
              autoComplete={register ? "new-password" : "current-password"}
              required
            />
          </Field>
          {register && (
            <Field label="Quiero">
              <select name="role">
                <option value="Client">Reservar citas como cliente</option>
                <option value="Barber">Administrar mi barbería</option>
              </select>
            </Field>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Procesando…" : register ? "Registrarme" : "Iniciar sesión"}
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register ? "Ya tengo cuenta" : "Crear una cuenta nueva"}
        </button>
      </section>
    </div>
  );
}

export default Auth;

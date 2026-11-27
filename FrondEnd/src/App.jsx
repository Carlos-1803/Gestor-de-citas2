import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { syncRequests, queueEvent, localRequests } from "./pwa/reservas";
import { identityKey, rememberAccount, offlineAccount } from "./pwa/cuentas";
import InstallMenu from "./components/InstallMenu";
import ConnectionNotice from "./components/ConnectionNotice";
import { serverOnline, watchConnection } from "./pwa/red";
import { leaveDevice, finishLogout, logoutKey } from "./pwa/sesion";
import "./App.css";
import Auth from "./pages/Auth";
import Explore from "./pages/Explore";
import ShopDetail from "./pages/ShopDetail";
import Bookings from "./pages/Bookings";
import Manage from "./pages/Manage";
import Catalog from "./pages/Catalog";
// Importación del componente de Realidad Aumentada (RA)
import { SimulacionView } from "./components/Simulacion/SimulacionView";

function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState("explore");
  const [shopId, setShopId] = useState(null);
  const [message, setMessage] = useState("");
  const [auth, setAuth] = useState(false);
  const sessionVersion = useRef(0);

  useEffect(() => {
    let active = true;
    async function refresh() {
      const current = ++sessionVersion.current;
      try {
        await finishLogout();
        const account = await api("/auth/me");
        if (!active || current !== sessionVersion.current) return;
        const previous = offlineAccount();
        if (!account && previous && localRequests(previous.id, previous.role).length) {
          setMessage("Inicia sesión con la misma cuenta para enviar los cambios guardados.");
        }
        rememberAccount(account);
        setUser(account);
      } catch (error) {
        if (!active || current !== sessionVersion.current) return;
        if (error instanceof TypeError) setUser(localStorage.getItem(logoutKey) ? null : offlineAccount());
        else setMessage(error.message);
      } finally {
        if (active && current === sessionVersion.current) setReady(true);
      }
    }
    function accountChanged(event) {
      if (event.key === identityKey || event.key === logoutKey || event.key === null) {
        ++sessionVersion.current;
        setUser(localStorage.getItem(logoutKey) ? null : offlineAccount());
        setPage("explore");
        refresh();
      }
    }
    refresh();
    window.addEventListener("storage", accountChanged);
    const stopWatching = watchConnection(() => { if (serverOnline()) refresh(); });
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("storage", accountChanged);
      stopWatching();
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const role = user?.role;
  const owner = ["Client", "Barber", "Admin"].includes(role) ? user.id : null;
  useEffect(() => {
    if (!owner) return;
    const sync = () => syncRequests(owner, role).catch(error => {
      if (!(error instanceof TypeError)) setMessage(error.message);
    });
    sync();
    const onVisible = () => { if (document.visibilityState === "visible") sync(); };
    document.addEventListener("visibilitychange",onVisible);
    const stopWatching = watchConnection(() => { if (serverOnline()) sync(); });
    window.addEventListener(queueEvent, sync);
    const timer = window.setInterval(sync, 20000);
    return () => {
      document.removeEventListener("visibilitychange",onVisible);
      stopWatching();
      window.removeEventListener(queueEvent, sync);
      window.clearInterval(timer);
    };
  }, [owner, role]);

  useEffect(() => {
    if (message !== "Sesión iniciada." || !window.matchMedia("(max-width: 650px)").matches) return;
    const timer = window.setTimeout(() => setMessage(""), 2200);
    return () => window.clearTimeout(timer);
  }, [message]);

  function openShop(id) {
    setShopId(id);
    setPage("explore");
  }

  return (
    <>
      <ConnectionNotice key={role + ":" + owner} owner={owner} role={role} sessionReady={ready} />
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            setShopId(null);
            setPage("explore");
          }}
        >
          ✂{" "}
          <span>
            Entre<span className="gold">Cortes</span>
            <small>BARBERÍAS · CITAS · ESTILO</small>
          </span>
        </button>
        <nav aria-label="Navegación principal">
          <button
            className={page === "explore" ? "nav active" : "nav"}
              aria-current={page === "explore" ? "page" : undefined}
            onClick={() => {
              setPage("explore");
              setShopId(null);
            }}
          >
            Explorar
          </button>

          {/* Botón de navegación para acceder a la previsualización por Realidad Aumentada (RF-09, RF-12) */}
          <button
            className={page === "simulacion" ? "nav active" : "nav"}
              aria-current={page === "simulacion" ? "page" : undefined}
            onClick={() => {
              setPage("simulacion");
              setShopId(null);
            }}
          >
            Simulador RA
          </button>

          {user && (
            <button
              className={page === "bookings" ? "nav active" : "nav"}
              aria-current={page === "bookings" ? "page" : undefined}
              onClick={() => setPage("bookings")}
            >
              Mis citas
            </button>
          )}
          {user?.role === "Barber" && (
            <button
              className={page === "manage" ? "nav active" : "nav"}
              aria-current={page === "manage" ? "page" : undefined}
              onClick={() => setPage("manage")}
            >
              Mi barbería
            </button>
          )}
          {user?.role === "Admin" && (
            <button className="nav" aria-current={page === "admin" ? "page" : undefined} onClick={() => setPage("admin")}>
              Catálogo
            </button>
          )}
        </nav>
        {user ? (
          <div className="account">
            <span>{user.name}</span>
            <button
              className="outline small"
              onClick={async () => {
                try {
                  ++sessionVersion.current;
                  leaveDevice(user);
                  setUser(null);
                  setPage("explore");
                  setShopId(null);
                  setMessage("");
                  if (navigator.onLine) await finishLogout();
                } catch (e) {
                  if (!(e instanceof TypeError)) setMessage(e.message);
                }
              }}
            >
              Salir
            </button>
          </div>
        ) : (
          <button
            className="primary small"
            disabled={!ready}
            onClick={() => navigator.onLine ? setAuth(true) : setMessage("Conéctate para iniciar sesión.")}
          >
            Entrar / Registrarme
          </button>
        )}
        <InstallMenu />
      </header>
      {message && (
        <div role="alert" className="notice">
          <span>{message}</span>
          <button aria-label="Cerrar aviso" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      <main className={page === "simulacion" ? "simulador-pagina" : "pwa-flow"}>
        {page === "explore" &&
          (shopId ? (
            <ShopDetail
              key={shopId}
              id={shopId}
              user={user}
              login={() => setAuth(true)}
              back={() => setShopId(null)}
              notify={setMessage}
              booked={() => setPage("bookings")}
            />
          ) : (
            <Explore open={openShop} notify={setMessage} />
          ))}

        {/* Renderizado condicional de la vista de Realidad Aumentada */}
        {page === "simulacion" && <SimulacionView key={role + ":" + owner} user={user} />}

        {page === "bookings" && user && (
          <Bookings key={role + user.id} user={user} notify={setMessage} />
        )}
        {page === "manage" && user?.role === "Barber" && (
          <Manage key={user.id} owner={user.id} open={openShop} notify={setMessage} />
        )}
        {page === "admin" && user?.role === "Admin" && (
          <Catalog key={user.id} owner={user.id} notify={setMessage} />
        )}
      </main>
      <footer>
        EntreCortes <span>Tu próximo corte, a tu tiempo.</span>
        <small>Precios en MXN · Pago en el establecimiento</small>
      </footer>
      {auth && (
        <Auth
          close={() => setAuth(false)}
          done={(u) => {
            ++sessionVersion.current;
            rememberAccount(u);
            setUser(u);
            setAuth(false);
            setMessage("Sesión iniciada.");
            if (u.role === "Barber") setPage("manage");
          }}
        />
      )}
    </>
  );
}

export default App;

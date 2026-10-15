import { useEffect, useState } from "react";
import { api } from "./api";
import "./App.css";
import Auth from "./pages/Auth";
import Explore from "./pages/Explore";
import ShopDetail from "./pages/ShopDetail";
import Bookings from "./pages/Bookings";
import Manage from "./pages/Manage";
import Catalog from "./pages/Catalog";
function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState("explore");
  const [shopId, setShopId] = useState(null);
  const [message, setMessage] = useState("");
  const [auth, setAuth] = useState(false);
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch((e) => setMessage(e.message))
      .finally(() => setReady(true));
  }, []);
  function openShop(id) {
    setShopId(id);
    setPage("explore");
  }
  return (
    <>
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
            onClick={() => {
              setPage("explore");
              setShopId(null);
            }}
          >
            Explorar
          </button>
          {user && (
            <button
              className={page === "bookings" ? "nav active" : "nav"}
              onClick={() => setPage("bookings")}
            >
              Mis citas
            </button>
          )}
          {user?.role === "Barber" && (
            <button
              className={page === "manage" ? "nav active" : "nav"}
              onClick={() => setPage("manage")}
            >
              Mi barbería
            </button>
          )}
          {user?.role === "Admin" && (
            <button className="nav" onClick={() => setPage("admin")}>
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
                  await api("/auth/logout", { method: "POST" });
                  setUser(null);
                  setPage("explore");
                  setShopId(null);
                } catch (e) {
                  setMessage(e.message);
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
            onClick={() => setAuth(true)}
          >
            Entrar / Registrarme
          </button>
        )}
      </header>
      {message && (
        <div role="alert" className="notice">
          <span>{message}</span>
          <button aria-label="Cerrar aviso" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      <main>
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
        {page === "bookings" && user && (
          <Bookings user={user} notify={setMessage} />
        )}
        {page === "manage" && user?.role === "Barber" && (
          <Manage open={openShop} notify={setMessage} />
        )}
        {page === "admin" && user?.role === "Admin" && (
          <Catalog notify={setMessage} />
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

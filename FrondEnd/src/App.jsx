import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import "./App.css";
import Auth from "./pages/Auth";
import Explore from "./pages/Explore";
import ShopDetail from "./pages/ShopDetail";
import Bookings from "./pages/Bookings";
import Manage from "./pages/Manage";
import Catalog from "./pages/Catalog";
import Branches from "./pages/Branches";
import useBranches from "./branches/useBranches";
import OfflineMaps from "./maps/OfflineMaps";
// Importación del componente de Realidad Aumentada (RA)
import { SimulacionView } from "./components/Simulacion/SimulacionView";

function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState("explore");
  const [shopId, setShopId] = useState(null);
  const [message, setMessage] = useState("");
  const [auth, setAuth] = useState(false);

  const branches = useBranches();
  const loadBranches = branches.load;
  const activeShop = branches.shops.find((shop) => shop.id === branches.activeShopId);

  const enterSession = useCallback(async (value, restore = false) => {
    setUser(value);
    if (value?.role !== "Barber") return;
    setPage("branches");
    try {
      const destination = await loadBranches(value, null, restore);
      if (destination) setPage(destination.page);
    } catch (error) { setMessage(error.message); }
  }, [loadBranches]);

  useEffect(() => {
    let cancelled = false;
    api("/auth/me")
      .then((value) => { if (!cancelled) return enterSession(value, true); })
      .catch((error) => { if (!cancelled) setMessage(error.message); })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [enterSession]);

  function chooseShop(id) {
    if (branches.select(id)) setPage("manage");
  }
  function manageShop() {
    if (branches.loading || branches.error) setPage("branches");
    else if (!branches.shops.length) setPage("createBranch");
    else setPage(activeShop ? "manage" : "branches");
  }
  async function savedShop(id) {
    setPage("branches");
    const destination = await loadBranches(user, id, true);
    if (destination) setPage(destination.page);
  }

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
            K'iin <span className="gold">BARBER</span>
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

          {/* Botón de navegación para acceder a la previsualización por Realidad Aumentada (RF-09, RF-12) */}
          <button
            className={page === "simulacion" ? "nav active" : "nav"}
            onClick={() => {
              setPage("simulacion");
              setShopId(null);
            }}
          >
            Simulador RA
          </button>

          <button className={page === "offlineMaps" ? "nav active" : "nav"} onClick={() => setPage("offlineMaps")}>Mapa offline</button>
          {user && (
            <button
              className={page === "bookings" ? "nav active" : "nav"}
              onClick={() => user.role === "Barber" && !activeShop ? manageShop() : setPage("bookings")}
            >
              Mis citas
            </button>
          )}
          {user?.role === "Barber" && (
            <button
              className={["manage", "branches", "createBranch"].includes(page) ? "nav active" : "nav"}
              onClick={manageShop}
            >
              Mis sucursales
            </button>
          )}
          {user?.role === "Admin" && (
            <button className="nav" onClick={() => setPage("admin")}>
              Catálogo
            </button>
          )}
        </nav>
        {user?.role === "Barber" && branches.shops.length > 0 && (
          <label className="branch-nav">Sucursal activa
            <select aria-label="Sucursal activa" value={branches.activeShopId || ""}
              onChange={(event) => event.target.value ? chooseShop(event.target.value) : setPage("branches")}>
              <option value="">Seleccionar sucursal</option>
              {branches.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
            </select>
          </label>
        )}
        {user ? (
          <div className="account">
            <span className="account-name">{user.name}</span>
            <button
              className="outline small"
              onClick={async () => {
                try {
                  await api("/auth/logout", { method: "POST" });
                  branches.clear();
                  setUser(null);
                  setMessage("");
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
        {page === "offlineMaps" && <OfflineMaps />}
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
        {page === "simulacion" && <SimulacionView user={user} />}

        {page === "bookings" && user && (
          <Bookings key={branches.activeShopId || "all"} user={user} shopId={user.role === "Barber" ? branches.activeShopId : null} notify={setMessage} />
        )}
        {page === "branches" && user?.role === "Barber" && (
          <Branches branches={branches} choose={chooseShop} add={() => setPage("createBranch")}
            retry={() => enterSession(user, true)} />
        )}
        {(page === "createBranch" || (page === "manage" && activeShop && !branches.loading)) && user?.role === "Barber" && (
          <Manage key={page === "createBranch" ? "new" : activeShop?.id}
            selectedShop={page === "manage" ? activeShop : null}
            open={openShop} notify={setMessage} onSaved={savedShop}
            onAddBranch={() => setPage("createBranch")} onChooseBranches={() => setPage("branches")} />
        )}
        {page === "admin" && user?.role === "Admin" && (
          <Catalog notify={setMessage} />
        )}
      </main>
      <footer>
        K'iin BARBER <span>No importa el lugar, solo importa el talento y el buen servicio.</span>
        <small>Precios en MXN · Pago en el establecimiento</small>
      </footer>
      {auth && (
        <Auth
          close={() => setAuth(false)}
          done={(u) => {
            enterSession(u);
            setAuth(false);
            setMessage("Sesión iniciada.");

          }}
        />
      )}
    </>
  );
}

export default App;

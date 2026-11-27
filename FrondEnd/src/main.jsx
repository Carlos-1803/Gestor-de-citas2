import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import ConnectionNotice from "./components/ConnectionNotice.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ConnectionNotice />
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD && window.isSecureContext && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((error) => {
    console.warn("K'iin BARBER no pudo preparar el modo sin conexión.", error);
  });
}

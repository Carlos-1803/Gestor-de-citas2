import { useSyncExternalStore } from "react";
import "./ConnectionNotice.css";

function subscribe(notify) {
  window.addEventListener("offline", notify);
  window.addEventListener("online", notify);
  return () => {
    window.removeEventListener("offline", notify);
    window.removeEventListener("online", notify);
  };
}

export default function ConnectionNotice() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine);
  return (
    <div role="status" className="connection-notice">
      {online ? "" : "Sin conexión. Vuelve a conectarte para consultar horarios y reservar."}
    </div>
  );
}

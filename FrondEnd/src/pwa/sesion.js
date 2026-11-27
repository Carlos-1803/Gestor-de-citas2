import { api } from "../api.js";
import { rememberAccount } from "./cuentas.js";

export const logoutKey = "entrecortes:salida";

export function leaveDevice(user) {
  // Las operaciones pendientes se conservan para cuando su dueño inicie sesión otra vez.
  localStorage.setItem(logoutKey,JSON.stringify({id:user.id,role:user.role}));
  rememberAccount(null);
}

export async function finishLogout() {
  if (!localStorage.getItem(logoutKey)) return;
  async function finish() {
    const raw = localStorage.getItem(logoutKey);
    if (!raw) return;
    const wanted = JSON.parse(raw);
    const actual = await api("/auth/me");
    if (actual?.id === wanted.id && actual.role === wanted.role) {
      await api("/auth/logout",{method:"POST"});
    }
    if (localStorage.getItem(logoutKey) === raw) localStorage.removeItem(logoutKey);
  }
  return navigator.locks ? navigator.locks.request(logoutKey,finish) : finish();
}

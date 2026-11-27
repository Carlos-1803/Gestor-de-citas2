import { useCallback, useRef, useState } from "react";
import { api } from "../api";
import { branchKey, chooseBranch } from "./branchSelection";

function remember(userId, id) {
  try {
    if (id) localStorage.setItem(branchKey(userId), String(id));
    else localStorage.removeItem(branchKey(userId));
  } catch { /* Storage can be disabled; the in-memory selection still works. */ }
}

export default function useBranches() {
  const [state, setState] = useState({ userId: null, shops: [], activeShopId: null, loading: false, error: "" });
  const requestId = useRef(0);
  const load = useCallback(async (user, preferredId = null, restore = false) => {
    const currentRequest = ++requestId.current;
    setState({ userId: user.id, shops: [], activeShopId: null, loading: true, error: "" });
    try {
      const shops = await api("/manage/shops");
      if (currentRequest !== requestId.current) return null;
      if (restore && !preferredId) {
        try { preferredId = localStorage.getItem(branchKey(user.id)); } catch { /* Optional storage. */ }
      }
      const selection = chooseBranch(shops, preferredId);
      remember(user.id, selection.activeShopId);
      setState({ userId: user.id, shops, activeShopId: selection.activeShopId, loading: false, error: "" });
      return selection;
    } catch (error) {
      if (currentRequest !== requestId.current) return null;
      setState({ userId: user.id, shops: [], activeShopId: null, loading: false, error: error.message });
      throw error;
    }
  }, []);

  const select = (id) => {
    const branch = state.shops.find((shop) => shop.id === Number(id));
    if (!branch) return false;
    remember(state.userId, branch.id);
    setState({ ...state, activeShopId: branch.id });
    return true;
  };
  const clear = () => {
    requestId.current++;
    if (state.userId) remember(state.userId, null);
    setState({ userId: null, shops: [], activeShopId: null, loading: false, error: "" });
  };
  return { ...state, load, select, clear };
}

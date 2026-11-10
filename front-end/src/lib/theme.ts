import { writable } from "svelte/store";

export type Theme = "system" | "light" | "dark";
const KEY = "rtchat-theme";

function read(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* storage bloqueado: segue o tema do sistema */ }
  return "system";
}

export const theme = writable<Theme>("system");

export function apply(value: Theme) {
  if (value === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = value;
  try {
    if (value === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch { /* sem persistência, mas o tema continua valendo na sessão */ }
  theme.set(value);
}

export function initTheme() {
  theme.set(read());
}

const order: Theme[] = ["system", "light", "dark"];
export function cycleTheme(current: Theme) {
  apply(order[(order.indexOf(current) + 1) % order.length]);
}

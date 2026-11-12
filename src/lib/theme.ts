/** Tema claro/escuro: salvo no navegador; na primeira visita segue o sistema. */
const KEY = "agendapro:tema";
export type Theme = "light" | "dark";

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* ignora */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#0a1020" : "#2563eb");
}

export function setTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignora */
  }
  applyTheme(t);
  window.dispatchEvent(new Event("agendapro:tema"));
}

import { useEffect, useState } from "react";
import { getTheme, setTheme, type Theme } from "../lib/theme";
import { cx } from "./ui";

/**
 * Botão de tema: mostra a LUA no modo claro (clique = escuro)
 * e o SOL no modo escuro (clique = claro).
 * variant "glass" é para fundos coloridos/escuros (cabeçalhos).
 */
export function ThemeToggle({ variant = "default", className }: { variant?: "default" | "glass"; className?: string }) {
  const [theme, setT] = useState<Theme>(getTheme);
  useEffect(() => {
    const sync = () => setT(getTheme());
    window.addEventListener("agendapro:tema", sync);
    return () => window.removeEventListener("agendapro:tema", sync);
  }, []);
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      title={dark ? "Tema claro" : "Tema escuro"}
      className={cx(
        "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition active:scale-90",
        variant === "glass"
          ? "bg-white/15 text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/25"
          : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100",
        className,
      )}
    >
      {dark ? (
        // Sol
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" fill="currentColor" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
        </svg>
      ) : (
        // Lua
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
          <path d="M20.3 14.6A8.5 8.5 0 0 1 9.4 3.7a.6.6 0 0 0-.8-.7A9.5 9.5 0 1 0 21 15.4a.6.6 0 0 0-.7-.8Z" />
        </svg>
      )}
    </button>
  );
}

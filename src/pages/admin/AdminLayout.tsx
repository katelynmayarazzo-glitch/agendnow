import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { publicUrl } from "../../lib/format";
import { SEGMENTS, type Terms } from "../../lib/segments";
import type { Business, Subscription } from "../../lib/types";
import { api } from "../../lib/api";
import { resetDemo } from "../../lib/api/local";
import { Logo, PageLoader, cx } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { ThemeToggle } from "../../components/ThemeToggle";

const RESTRICTED = ["/painel/configuracoes", "/painel/usuarios", "/painel/plano"];

export interface AdminCtx {
  business: Business;
  terms: Terms;
  setBusiness: (b: Business) => void;
}
export const useAdmin = () => useOutletContext<AdminCtx>();

const I = {
  home: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  cal: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
  users: "M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.87M16 3.13a3.5 3.5 0 010 6.75",
  tag: "M20 12l-8 8-9-9V3h8l9 9zM7.5 7.5h.01",
  team: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 0112 0v1",
  card: "M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 10h18M7 15h4",
  help: "M12 22a10 10 0 100-20 10 10 0 000 20zM9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  key: "M15 7a3 3 0 11-6 0 3 3 0 016 0zM4 21v-1a6 6 0 0112 0v1M19 8v6M22 11h-6",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
};

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("h-5 w-5", className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function AdminLayout() {
  const { user, business, role, loading, setBusiness, signOut } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [more, setMore] = useState(false);
  const [topMore, setTopMore] = useState(false);
  const [topUser, setTopUser] = useState(false);
  const { pathname } = useLocation();
  const [sub, setSub] = useState<Subscription | null>(null);
  useEffect(() => {
    if (business) api.getSubscription(business.id).then(setSub).catch(() => setSub(null));
  }, [business, pathname]);

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/entrar" replace />;
  if (!business) return <Navigate to="/criar-conta" replace />;

  const terms = SEGMENTS[business.segment];
  const isAdmin = role === "owner" || role === "admin";
  // Equipe não acessa Ajustes, Usuários nem Meu plano
  if (role === "equipe" && RESTRICTED.some((r) => pathname.startsWith(r))) return <Navigate to="/painel" replace />;
  const link = publicUrl(business.slug);
  const items = [
    { to: "/painel", end: true, label: "Início", icon: I.home },
    { to: "/painel/agenda", label: "Agenda", icon: I.cal },
    { to: "/painel/clientes", label: terms.clients, icon: I.users },
    { to: "/painel/servicos", label: "Serviços", icon: I.tag },
    { to: "/painel/equipe", label: terms.pros, icon: I.team },
    { to: "/painel/configuracoes", label: "Ajustes", icon: I.gear },
  ].filter((it) => isAdmin || !RESTRICTED.includes(it.to));
  const extras = [
    { to: "/painel/usuarios", label: "Usuários", icon: I.key },
    { to: "/painel/plano", label: "Meu plano", icon: I.card },
    { to: "/painel/suporte", label: "Suporte", icon: I.help },
  ].filter((it) => isAdmin || !RESTRICTED.includes(it.to));
  const mobileMain = items.slice(0, 5);
  const mobileMore = [...items.slice(5), ...extras];
  const moreActive = mobileMore.some((it) => pathname.startsWith(it.to));

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copiado! Cole no Instagram ou WhatsApp.");
    } catch {
      toast(link);
    }
  }

  return (
    <div className="admin-bg min-h-screen">
      {/* Menu superior (desktop) */}
      <header className="admin-bar topnav">
        <div className="topnav-in">
          <Link to="/painel" className="topnav-logo" title="Ir para o painel"><Logo light className="text-white" /></Link>
          <nav className="topnav-nav">
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                onClick={() => { setTopMore(false); setTopUser(false); }}
                className={({ isActive }) => cx("tn-link", isActive && "active")}
              >
                <Icon d={it.icon} className="tn-icon" />
                {it.label}
              </NavLink>
            ))}
            {extras.length > 0 && (
              <div className="tn-wrap">
                <button
                  onClick={() => { setTopMore(!topMore); setTopUser(false); }}
                  className={cx("tn-link", (topMore || extras.some((it) => pathname.startsWith(it.to))) && "active")}
                >
                  <Icon d={I.more} className="tn-icon" />
                  Mais ▾
                </button>
                {topMore && (
                  <>
                    <div className="tn-backdrop" onClick={() => setTopMore(false)} />
                    <div className="tn-menu tn-menu-left">
                      {extras.map((it) => (
                        <NavLink
                          key={it.to}
                          to={it.to}
                          onClick={() => setTopMore(false)}
                          className={({ isActive }) => cx("tn-menu-item", isActive && "active")}
                        >
                          <Icon d={it.icon} className="tn-icon" />
                          {it.label}
                        </NavLink>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </nav>
          <div className="topnav-right">
            <ThemeToggle variant="glass" />
            <div className="tn-wrap">
              <button onClick={() => { setTopUser(!topUser); setTopMore(false); }} className="tn-account">
                <span className="tn-avatar">{business.name.charAt(0).toUpperCase()}</span>
                <span className="tn-account-name">{business.name.split(" ")[0]}</span>
                ▾
              </button>
              {topUser && (
                <>
                  <div className="tn-backdrop" onClick={() => setTopUser(false)} />
                  <div className="tn-menu" onClick={() => setTopUser(false)}>
                    <Link to="/painel" className="tn-menu-head block hover:opacity-80">
                      <p className="tn-menu-name">{business.name}</p>
                      <p className="tn-menu-sub">{user.email}</p>
                      <p className="tn-menu-role">{role === "owner" ? "Dono" : role === "admin" ? "Administrador" : "Equipe"}</p>
                    </Link>
                    <div className="tn-menu-sep" />
                    <a href={link} target="_blank" rel="noreferrer" className="tn-menu-item">Ver minha página</a>
                    <button onClick={copyLink} className="tn-menu-item">Copiar link</button>
                    <button onClick={async () => { await signOut(); nav("/"); }} className="tn-menu-item tn-menu-danger">Sair</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Topo (mobile) */}
      <header className="admin-bar sticky top-0 z-30 flex items-center justify-between px-4 py-3 text-white shadow-sm lg:hidden">
        <Link to="/painel" title="Ir para o painel"><Logo light className="text-base text-white" /></Link>
        <div className="relative flex items-center gap-2">
          <ThemeToggle variant="glass" />
          <button onClick={() => setMenu(!menu)} className="rounded-lg bg-white/15 px-2.5 py-1.5 text-sm font-semibold ring-1 ring-white/25">
            {business.name.split(" ")[0]} ▾
          </button>
          {menu && (
            <div className="absolute top-full right-0 mt-2 w-52 rounded-xl bg-white p-1 text-zinc-800 shadow-lg ring-1 ring-zinc-200" onClick={() => setMenu(false)}>
              <Link to="/painel" className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-zinc-100">{business.name}</Link>
              <a href={link} target="_blank" rel="noreferrer" className="block rounded-lg px-3 py-2 text-sm hover:bg-zinc-100">Ver minha página</a>
              <button onClick={copyLink} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100">Copiar link</button>
              <button onClick={async () => { await signOut(); nav("/"); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-zinc-100">Sair</button>
            </div>
          )}
        </div>
      </header>

      {api.mode === "demo" && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 bg-blue-600/10 px-4 py-2 text-center text-xs text-brand-700">
          <span>Versão local: os dados ficam salvos neste navegador, neste computador.</span>
          <button
            className="font-semibold underline"
            onClick={async () => {
              if (!confirm("Apagar TODOS os dados (contas, clientes e agendamentos) deste navegador?")) return;
              resetDemo();
              await signOut();
              nav("/");
            }}
          >
            Apagar tudo e recomeçar
          </button>
        </div>
      )}

      {isAdmin && sub && (sub.status === "pending" || sub.status === "overdue" || (sub.status === "trial" && new Date(sub.trial_ends_at).getTime() - Date.now() < 5 * 86400000)) && !pathname.endsWith("/plano") && (
        <div className={cx("flex flex-wrap items-center justify-center gap-x-3 px-4 py-2 text-center text-sm font-medium text-white", sub.status === "overdue" ? "bg-rose-600" : "bg-amber-500")}>
          <span>
            {sub.status === "trial"
              ? `Seu teste grátis termina em ${Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000))} dia(s).`
              : sub.status === "overdue"
                ? "Pagamento da assinatura atrasado."
                : "Assinatura com pagamento pendente."}
          </span>
          <Link to="/painel/plano" className="font-bold underline">Ver meu plano →</Link>
        </div>
      )}

      <main
        className={cx(
          "mx-auto px-4 pt-6 pb-28 lg:px-8 lg:pb-12",
          // agenda das clínicas (estilo Google Agenda) usa a largura toda
          SEGMENTS[business.segment].clinical && pathname.endsWith("/agenda") ? "max-w-none" : "max-w-5xl",
        )}
      >
        <Outlet context={{ business, terms, setBusiness } satisfies AdminCtx} />
      </main>

      {/* Navegação inferior (mobile): 5 atalhos + "Mais" */}
      {more && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-x-3 bottom-[76px] rounded-2xl bg-white p-2 shadow-2xl ring-1 ring-zinc-200" onClick={(e) => e.stopPropagation()}>
            {mobileMore.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                onClick={() => setMore(false)}
                className={({ isActive }) => cx("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold", isActive ? "bg-brand-50 text-brand-700" : "text-zinc-700 hover:bg-zinc-100")}
              >
                <Icon d={it.icon} /> {it.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
      <nav className="admin-bar fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 shadow-[0_-4px_16px_rgba(30,58,138,0.25)] pb-[env(safe-area-inset-bottom)] lg:hidden">
        {mobileMain.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            onClick={() => setMore(false)}
            className={({ isActive }) => cx("flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium", isActive && !more ? "text-white" : "text-white/60")}
          >
            <Icon d={it.icon} className="h-5 w-5" />
            <span className="max-w-full truncate px-0.5">{it.label}</span>
          </NavLink>
        ))}
        <button onClick={() => setMore(!more)} className={cx("flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium", more || moreActive ? "text-white" : "text-white/60")}>
          <Icon d={I.more} className="h-5 w-5" />
          <span>Mais</span>
        </button>
      </nav>
    </div>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-zinc-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

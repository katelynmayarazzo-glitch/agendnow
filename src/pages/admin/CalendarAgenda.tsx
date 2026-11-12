/**
 * Agenda (todos os tipos de negócio) no estilo Google Agenda:
 * grade de horários (Dia por especialista / Semana / Mês), cores por especialista,
 * linha do "agora", minicalendário e detalhes do agendamento.
 * Em clínicas mostra também convênio, CPF e atalho para o prontuário.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type ClientWithStats } from "../../lib/api";
import type { AppointmentView, Professional, Status } from "../../lib/types";
import { addDays, brl, hm, insuranceLabel, maskCpf, maskPhone, sameDay, startOfDay, toMin, whatsappLink } from "../../lib/format";
import { STATUS_LABEL, WEEKDAYS_SHORT, type Terms } from "../../lib/segments";
import { hoursFor } from "../../lib/slots";
import { Button, Modal, Spinner, StatusBadge, cx } from "../../components/ui";
import { errMsg, useToast } from "../../components/Toast";
import { useAdmin } from "./AdminLayout";
import { NewAppointmentModal, OnlinePayBadge, PaidModal, paidLabel, paidOnlineMethod } from "./shared";
import type { Business } from "../../lib/types";

type View = "dia" | "semana" | "mes";
type Column = { key: string; date: Date; pro: Professional | null; label: string; sub?: string };

/** Cores das agendas (uma por especialista), como no Google Agenda. */
export const PRO_COLORS = ["#2563eb", "#0d9488", "#7c3aed", "#0891b2", "#4f46e5", "#059669", "#d97706", "#475569"];
const HOUR_PX = 76;
const PX_MIN = HOUR_PX / 60;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const weekStart = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)); // segunda-feira
const monthGridStart = (d: Date) => weekStart(new Date(d.getFullYear(), d.getMonth(), 1));
const minutesOfDay = (iso: string | Date) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};
const pad = (n: number) => String(n).padStart(2, "0");
const toHHMM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

function age(birth: string | null) {
  if (!birth) return null;
  const b = new Date(`${birth}T12:00:00`), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

/** Distribui consultas sobrepostas lado a lado (faixas), como o Google faz. */
function layoutLanes(items: AppointmentView[]) {
  const evs = items
    .map((a) => ({ a, s: minutesOfDay(a.starts_at), e: Math.max(minutesOfDay(a.ends_at), minutesOfDay(a.starts_at) + 10), lane: 0, lanes: 1 }))
    .sort((x, y) => x.s - y.s || y.e - x.e);
  const out: typeof evs = [];
  let cluster: typeof evs = [];
  let end = -1;
  const flush = () => {
    const lanes: number[] = [];
    for (const ev of cluster) {
      let i = lanes.findIndex((le) => le <= ev.s);
      if (i < 0) {
        i = lanes.length;
        lanes.push(0);
      }
      lanes[i] = ev.e;
      ev.lane = i;
    }
    cluster.forEach((ev) => (ev.lanes = lanes.length));
    out.push(...cluster);
    cluster = [];
  };
  for (const ev of evs) {
    if (cluster.length && ev.s >= end) flush();
    cluster.push(ev);
    end = Math.max(end, ev.e);
  }
  flush();
  return out;
}

export default function CalendarAgenda() {
  const { business, terms } = useAdmin();
  const nav = useNavigate();
  const [view, setView] = useState<View>(() => (window.innerWidth < 768 ? "dia" : "semana"));
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [pros, setPros] = useState<Professional[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [clients, setClients] = useState<Map<string, ClientWithStats>>(new Map());
  const [list, setList] = useState<AppointmentView[] | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [selected, setSelected] = useState<AppointmentView | null>(null);
  const [create, setCreate] = useState<{ date: Date; time?: string; proId?: string } | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const range = useMemo(() => {
    if (view === "dia") return [cursor, addDays(cursor, 1)] as const;
    if (view === "semana") return [weekStart(cursor), addDays(weekStart(cursor), 7)] as const;
    const s = monthGridStart(cursor);
    return [s, addDays(s, 42)] as const;
  }, [view, cursor]);

  const load = useCallback(async () => {
    const [a, c] = await Promise.all([api.listAppointments(business.id, range[0], range[1]), api.listClients(business.id)]);
    setList(a);
    setClients(new Map(c.map((x) => [x.id, x])));
  }, [business.id, range]);

  useEffect(() => {
    setList(null);
    load();
  }, [load]);
  useEffect(() => {
    api.listProfessionals(business.id).then((p) => setPros(p.filter((x) => x.active)));
  }, [business.id]);

  const colorOf = useCallback((proId: string) => {
    const i = pros.findIndex((p) => p.id === proId);
    return PRO_COLORS[(i < 0 ? 0 : i) % PRO_COLORS.length];
  }, [pros]);

  const visiblePros = pros.filter((p) => !hidden.has(p.id));
  const appts = (list ?? []).filter((a) => !hidden.has(a.professional_id) && (showCancelled || a.status !== "cancelled"));

  // ----- colunas da grade -----
  const columns: Column[] = useMemo(() => {
    if (view === "dia") {
      if (visiblePros.length <= 1)
        return [{ key: "d", date: cursor, pro: visiblePros[0] ?? null, label: visiblePros[0]?.name ?? "", sub: visiblePros[0]?.role }];
      return visiblePros.map((p) => ({ key: p.id, date: cursor, pro: p, label: p.name, sub: p.role }));
    }
    const ws = weekStart(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i))
      .filter((d) => {
        // esconde o dia se ninguém atende e não há consultas (ex.: domingo)
        const open = hoursFor(business, null, d) || pros.some((p) => hoursFor(business, p, d));
        return open || appts.some((a) => sameDay(new Date(a.starts_at), d));
      })
      .map((d) => ({ key: String(+d), date: d, pro: null, label: WEEKDAYS_SHORT[d.getDay()], sub: String(d.getDate()) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cursor, pros, hidden, list, business]);

  // ----- faixa de horas exibida -----
  const [startH, endH] = useMemo(() => {
    let mn = 24 * 60, mx = 0;
    const consider = (h: { open: string; close: string } | null) => {
      if (!h) return;
      mn = Math.min(mn, toMin(h.open));
      mx = Math.max(mx, toMin(h.close));
    };
    for (let i = 0; i < 7; i++) {
      consider(business.hours[i] ?? null);
      pros.forEach((p) => p.hours && consider(p.hours[i] ?? null));
    }
    appts.forEach((a) => {
      mn = Math.min(mn, minutesOfDay(a.starts_at));
      mx = Math.max(mx, minutesOfDay(a.ends_at));
    });
    if (mn >= mx) return [8, 18];
    return [Math.max(0, Math.floor(mn / 60) - 1), Math.min(24, Math.ceil(mx / 60) + 1)];
  }, [business, pros, appts]);
  const totalH = (endH - startH) * HOUR_PX;

  // rola até perto do horário atual (ou da abertura)
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!scroller.current || view === "mes") return;
    // abre no início do expediente (a 1ª hora da grade é folga antes da abertura)
    scroller.current.scrollTop = HOUR_PX - 8;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, list === null]);

  const apptsFor = (col: Column) => appts.filter((a) => sameDay(new Date(a.starts_at), col.date) && (!col.pro || a.professional_id === col.pro.id));

  function onGridClick(e: MouseEvent<HTMLDivElement>, col: Column) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mins = startH * 60 + (e.clientY - rect.top) / PX_MIN;
    const step = business.slot_interval || 30;
    const m = Math.floor(mins / step) * step;
    setCreate({ date: col.date, time: toHHMM(m), proId: col.pro?.id });
  }

  const move = (dir: 1 | -1) => {
    if (view === "dia") setCursor(addDays(cursor, dir));
    else if (view === "semana") setCursor(addDays(cursor, 7 * dir));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
  };

  const title =
    view === "dia"
      ? cursor.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : view === "semana"
        ? (() => {
            const a = weekStart(cursor), b = addDays(a, 6);
            return a.getMonth() === b.getMonth()
              ? `${a.getDate()} – ${b.getDate()} de ${MONTHS[a.getMonth()]} de ${a.getFullYear()}`
              : `${a.getDate()} de ${MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()} de ${MONTHS[b.getMonth()].slice(0, 3)} de ${b.getFullYear()}`;
          })()
        : `${MONTHS[cursor.getMonth()]} de ${cursor.getFullYear()}`;

  // resumo do período visível
  const live = appts.filter((a) => a.status !== "cancelled" && a.status !== "no_show");
  const conv = live.filter((a) => a.insurance).length;
  const revenue = live.filter((a) => !a.insurance).reduce((t, a) => t + a.price, 0);

  return (
    <div className="flex gap-6">
      {/* ===== Barra lateral (desktop) ===== */}
      <aside className="hidden w-60 shrink-0 space-y-5 xl:block">
        <button
          onClick={() => setCreate({ date: view === "mes" ? startOfDay(new Date()) : cursor })}
          className="flex items-center gap-3 rounded-2xl bg-white py-3 pr-6 pl-4 font-semibold shadow-md ring-1 ring-zinc-200 transition hover:shadow-lg"
        >
          <span className="bg-grad grid h-8 w-8 place-items-center rounded-full text-xl text-white">+</span> Criar
        </button>

        <MiniMonth cursor={cursor} view={view} appts={list ?? []} onPick={(d) => { setCursor(d); if (view === "mes") setView("dia"); }} />

        <div>
          <p className="mb-2 text-xs font-bold tracking-wide text-zinc-500 uppercase">{terms.pros}</p>
          <ul className="space-y-1">
            {pros.map((p) => {
              const on = !hidden.has(p.id);
              const c = colorOf(p.id);
              return (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 text-sm hover:bg-zinc-100">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() => {
                        const n = new Set(hidden);
                        if (on) n.add(p.id);
                        else n.delete(p.id);
                        setHidden(n);
                      }}
                    />
                    <span className="grid h-4 w-4 place-items-center rounded text-[10px] text-white" style={{ background: on ? c : "transparent", border: `2px solid ${c}` }}>
                      {on && "✓"}
                    </span>
                    <span className="truncate">{p.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-zinc-200">
          <p className="font-semibold">Neste período</p>
          <p className="mt-2 flex justify-between"><span className="text-zinc-500">{terms.clinical ? "Consultas" : "Agendamentos"}</span><b>{live.length}</b></p>
          {terms.clinical && (
            <>
              <p className="flex justify-between"><span className="text-zinc-500">Convênio</span><b>{conv}</b></p>
              <p className="flex justify-between"><span className="text-zinc-500">Particular</span><b>{live.length - conv}</b></p>
            </>
          )}
          <p className="flex justify-between"><span className="text-zinc-500">Previsto</span><b>{brl(revenue)}</b></p>
          <p className="flex justify-between"><span className="text-zinc-500">Aguardando</span><b>{appts.filter((a) => a.status === "pending").length}</b></p>
        </div>

        <label className="flex items-center gap-2 px-1 text-sm text-zinc-600">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Mostrar cancelados
        </label>
      </aside>

      {/* ===== Calendário ===== */}
      <section className="min-w-0 flex-1">
        {/* Barra de topo, como no Google Agenda */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCursor(startOfDay(new Date()))}>Hoje</Button>
          <div className="flex">
            <button onClick={() => move(-1)} className="grid h-9 w-9 place-items-center rounded-full text-xl text-zinc-600 hover:bg-zinc-100" aria-label="Anterior">‹</button>
            <button onClick={() => move(1)} className="grid h-9 w-9 place-items-center rounded-full text-xl text-zinc-600 hover:bg-zinc-100" aria-label="Próximo">›</button>
          </div>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold first-letter:uppercase sm:text-xl">
            <span className="hidden sm:inline">{title}</span>
            <span className="sm:hidden">
              {view === "mes"
                ? `${MONTHS[cursor.getMonth()].slice(0, 3)} ${cursor.getFullYear()}`
                : view === "dia"
                  ? cursor.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "")
                  : `${weekStart(cursor).getDate()}–${addDays(weekStart(cursor), 6).getDate()} ${MONTHS[addDays(weekStart(cursor), 6).getMonth()].slice(0, 3)}`}
            </span>
          </h1>
          <Button size="sm" className="xl:hidden" onClick={() => setCreate({ date: cursor })}>+ Criar</Button>
          <div className="flex rounded-xl bg-zinc-100 p-1 text-sm font-semibold">
            {(["dia", "semana", "mes"] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cx("rounded-lg px-3 py-1", view === v ? "bg-white shadow-sm" : "text-zinc-500")}>
                {v === "mes" ? "Mês" : v === "dia" ? "Dia" : "Semana"}
              </button>
            ))}
          </div>
        </div>

        {/* filtro de especialistas no celular/tablet */}
        {pros.length > 1 && (
          <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 xl:hidden">
            {pros.map((p) => {
              const on = !hidden.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    const n = new Set(hidden);
                    if (on) n.add(p.id);
                    else n.delete(p.id);
                    setHidden(n);
                  }}
                  className={cx("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1", on ? "bg-white ring-zinc-300" : "text-zinc-400 ring-zinc-200")}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? colorOf(p.id) : "transparent", border: `2px solid ${colorOf(p.id)}` }} />
                  {p.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70">
          {list === null ? (
            <div className="flex justify-center py-24 text-zinc-400"><Spinner className="h-6 w-6" /></div>
          ) : view === "mes" ? (
            <MonthGrid
              cursor={cursor}
              appts={appts}
              colorOf={colorOf}
              onDay={(d) => { setCursor(d); setView("dia"); }}
              onEvent={setSelected}
            />
          ) : (
            <>
              {/* Cabeçalho das colunas */}
              <div className="flex border-b border-[var(--grid-line)]">
                <div className="w-14 shrink-0 sm:w-16" />
                {columns.map((col) => {
                  const today = sameDay(col.date, now);
                  return (
                    <div key={col.key} className="min-w-0 flex-1 border-l border-[var(--grid-line)] px-1 py-2 text-center">
                      {col.pro && view === "dia" ? (
                        <div className="flex items-center justify-center gap-2">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: colorOf(col.pro.id) }}>
                            {col.pro.name.replace(/^(Dra?\.\s*)/, "").charAt(0)}
                          </span>
                          <span className="min-w-0 text-left">
                            <span className="block truncate text-sm font-semibold">{col.label}</span>
                            {col.sub && <span className="block truncate text-[11px] text-zinc-500">{col.sub}</span>}
                          </span>
                        </div>
                      ) : (
                        <button onClick={() => { setCursor(col.date); setView("dia"); }} className="mx-auto flex flex-col items-center">
                          <span className={cx("text-[11px] font-semibold uppercase", today ? "text-brand-600" : "text-zinc-500")}>{WEEKDAYS_SHORT[col.date.getDay()]}</span>
                          <span className={cx("mt-0.5 grid h-9 w-9 place-items-center rounded-full text-lg font-semibold", today ? "bg-grad text-white" : "hover:bg-zinc-100")}>
                            {col.date.getDate()}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Grade */}
              <div ref={scroller} className="cal-scroll relative overflow-y-auto" style={{ maxHeight: "calc(100vh - 250px)", minHeight: 420 }}>
                <div className="relative flex" style={{ height: totalH }}>
                  {/* coluna de horas */}
                  <div className="relative w-14 shrink-0 sm:w-16">
                    {Array.from({ length: endH - startH }, (_, i) => (
                      <span key={i} className="absolute right-2 -translate-y-1/2 text-[11px] text-zinc-500" style={{ top: i * HOUR_PX }}>
                        {i === 0 ? "" : `${pad(startH + i)}:00`}
                      </span>
                    ))}
                  </div>

                  {columns.map((col) => {
                    const wh = hoursFor(business, col.pro, col.date);
                    const open = wh ? toMin(wh.open) : null;
                    const close = wh ? toMin(wh.close) : null;
                    const today = sameDay(col.date, now);
                    const nowMin = now.getHours() * 60 + now.getMinutes();
                    return (
                      <div
                        key={col.key}
                        className="relative min-w-0 flex-1 cursor-pointer border-l border-[var(--grid-line)]"
                        onClick={(e) => onGridClick(e, col)}
                        title="Clique para agendar neste horário"
                      >
                        {/* fora do expediente (hachurado) */}
                        {open === null ? (
                          <div className="cal-closed absolute inset-0" />
                        ) : (
                          <>
                            <div className="cal-closed absolute inset-x-0 top-0" style={{ height: Math.max(0, (open - startH * 60) * PX_MIN) }} />
                            <div className="cal-closed absolute inset-x-0 bottom-0" style={{ top: Math.max(0, (close! - startH * 60) * PX_MIN) }} />
                          </>
                        )}
                        {/* linhas de hora e meia hora */}
                        {Array.from({ length: endH - startH }, (_, i) => (
                          <div key={i}>
                            <div className="absolute inset-x-0 border-t border-[var(--grid-line)]" style={{ top: i * HOUR_PX }} />
                            <div className="absolute inset-x-0 border-t border-dashed border-[var(--grid-line)] opacity-60" style={{ top: i * HOUR_PX + HOUR_PX / 2 }} />
                          </div>
                        ))}

                        {/* consultas */}
                        {layoutLanes(apptsFor(col)).map(({ a, s, e, lane, lanes }) => (
                          <EventBlock
                            key={a.id}
                            a={a}
                            clinical={terms.clinical}
                            color={colorOf(a.professional_id)}
                            showPro={!col.pro}
                            style={{
                              top: (s - startH * 60) * PX_MIN + 1,
                              height: Math.max((e - s) * PX_MIN - 2, 18),
                              left: `calc(${(lane / lanes) * 100}% + 2px)`,
                              width: `calc(${100 / lanes}% - 4px)`,
                            }}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelected(a);
                            }}
                          />
                        ))}

                        {/* linha do agora */}
                        {today && nowMin >= startH * 60 && nowMin <= endH * 60 && (
                          <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: (nowMin - startH * 60) * PX_MIN }}>
                            <div className="absolute -top-[5px] -left-[5px] h-2.5 w-2.5 rounded-full bg-rose-500" />
                            <div className="border-t-2 border-rose-500" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* legenda */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span>▮ Confirmado</span>
          <span className="opacity-80">┆ Aguardando (borda tracejada)</span>
          <span>✓ Atendido</span>
          <span className="line-through">Não compareceu</span>
          <span>Área hachurada = fora do expediente · clique num horário vazio para agendar</span>
        </div>
      </section>

      {selected && (
        <EventDetail
          a={selected}
          client={clients.get(selected.client_id) ?? null}
          color={colorOf(selected.professional_id)}
          proLabel={terms.pro}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            load();
          }}
          onOpenClient={(tab) => nav(`/painel/clientes?id=${selected.client_id}${tab === "prontuario" ? "&aba=prontuario" : ""}`)}
          terms={terms}
          business={business}
          businessName={business.name}
        />
      )}

      <NewAppointmentModal
        open={!!create}
        onClose={() => setCreate(null)}
        onSaved={load}
        business={business}
        terms={terms}
        defaultDate={create?.date}
        defaultTime={create?.time}
        defaultProId={create?.proId}
      />
    </div>
  );
}

/** Bloco da consulta na grade. */
function EventBlock({ a, color, style, onClick, showPro, clinical }: { a: AppointmentView; color: string; style: CSSProperties; onClick: (e: MouseEvent) => void; showPro: boolean; clinical: boolean }) {
  const h = typeof style.height === "number" ? style.height : 40;
  const pending = a.status === "pending";
  const done = a.status === "done";
  const off = a.status === "cancelled" || a.status === "no_show";
  const bg = pending || off ? `color-mix(in srgb, ${color} 10%, var(--surface))` : color;
  return (
    <button
      onClick={onClick}
      className={cx(
        "absolute z-10 overflow-hidden rounded-md px-1.5 text-left text-[11px] leading-tight shadow-sm transition hover:z-30 hover:shadow-md",
        pending || off ? "text-zinc-800" : "text-white",
        off && "line-through opacity-60",
        done && "opacity-75",
      )}
      style={{ ...style, background: bg, border: pending ? `1.5px dashed ${color}` : `1px solid ${color}` }}
      title={`${hm(a.starts_at)} – ${hm(a.ends_at)} · ${a.client_name} · ${a.service_name} · ${clinical ? insuranceLabel(a.insurance) : brl(a.price)} · ${STATUS_LABEL[a.status]}${a.payment_status === "paid" ? " · pago online" : ""}`}
    >
      {h < 34 ? (
        <span className="block truncate pt-0.5">
          <b>{a.client_name}</b>, {hm(a.starts_at)}
        </span>
      ) : (
        <span className="block pt-1">
          <span className="block truncate font-bold">{done && "✓ "}{a.client_name}</span>
          <span className="block truncate opacity-90">{hm(a.starts_at)} – {hm(a.ends_at)}</span>
          {h >= 50 && <span className="block truncate opacity-90">{a.service_name}{showPro ? ` · ${a.professional_name}` : ""}</span>}
          {h >= 64 && (
            <span className={cx("mt-1 inline-block max-w-full truncate rounded px-1 py-px text-[10px] font-semibold", pending || off ? "bg-zinc-100" : "bg-white/25")}>
              {clinical ? (a.insurance ? `${a.insurance}` : "Particular") : brl(a.price)}
              {a.payment_status === "paid" ? " · ✓ pago" : a.payment_status === "review" ? " · Pix?" : a.payment_status === "pending" ? " · " : ""}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

/** Visão de mês. */
function MonthGrid({ cursor, appts, colorOf, onDay, onEvent }: {
  cursor: Date; appts: AppointmentView[]; colorOf: (id: string) => string; onDay: (d: Date) => void; onEvent: (a: AppointmentView) => void;
}) {
  const start = monthGridStart(cursor);
  const today = new Date();
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-[var(--grid-line)]">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold text-zinc-500 uppercase">{WEEKDAYS_SHORT[d]}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => {
          const items = appts.filter((a) => sameDay(new Date(a.starts_at), d)).sort((x, y) => x.starts_at.localeCompare(y.starts_at));
          const outside = d.getMonth() !== cursor.getMonth();
          return (
            <div key={+d} onClick={() => onDay(d)} className={cx("min-h-24 cursor-pointer border-b border-l border-[var(--grid-line)] p-1 hover:bg-zinc-50 sm:min-h-28", outside && "opacity-45")}>
              <div className="mb-1 text-center">
                <span className={cx("inline-grid h-6 w-6 place-items-center rounded-full text-xs font-semibold", sameDay(d, today) && "bg-grad text-white")}>{d.getDate()}</span>
              </div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((a) => (
                  <button
                    key={a.id}
                    onClick={(e) => { e.stopPropagation(); onEvent(a); }}
                    className={cx("flex w-full items-center gap-1 truncate rounded px-1 text-left text-[11px] hover:bg-zinc-100", (a.status === "cancelled" || a.status === "no_show") && "line-through opacity-60")}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(a.professional_id) }} />
                    <span className="hidden text-zinc-500 sm:inline">{hm(a.starts_at)}</span>
                    <span className="truncate font-medium">{a.client_name}</span>
                  </button>
                ))}
                {items.length > 3 && <p className="px-1 text-[11px] font-semibold text-zinc-500">+{items.length - 3} mais</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Minicalendário da barra lateral. */
function MiniMonth({ cursor, view, appts, onPick }: { cursor: Date; view: View; appts: AppointmentView[]; onPick: (d: Date) => void }) {
  const [month, setMonth] = useState(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  useEffect(() => setMonth(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), [cursor]);
  const start = monthGridStart(month);
  const ws = weekStart(cursor);
  const today = new Date();
  return (
    <div className="px-1">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold first-letter:uppercase">{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
        <span>
          <button className="rounded-full px-2 text-zinc-500 hover:bg-zinc-100" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
          <button className="rounded-full px-2 text-zinc-500 hover:bg-zinc-100" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
        </span>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-zinc-400">
        {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => <span key={i} className="py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 text-center text-xs">
        {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => {
          const inWeek = view === "semana" && d >= ws && d < addDays(ws, 7);
          const sel = view !== "semana" && sameDay(d, cursor);
          const has = appts.some((a) => sameDay(new Date(a.starts_at), d));
          return (
            <button
              key={+d}
              onClick={() => onPick(d)}
              className={cx(
                "relative mx-auto my-px grid h-7 w-7 place-items-center rounded-full",
                d.getMonth() !== month.getMonth() && "text-zinc-400",
                sameDay(d, today) ? "bg-grad font-bold text-white" : sel ? "bg-brand-100 font-semibold text-brand-700" : inWeek ? "bg-zinc-100" : "hover:bg-zinc-100",
              )}
            >
              {d.getDate()}
              {has && !sameDay(d, today) && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-brand-600" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Detalhes do agendamento (como o cartão de evento do Google). */
export function EventDetail({ a, client, color, proLabel, onClose, onChanged, onOpenClient, businessName, terms, business }: {
  terms: Terms;
  business: Business;
  a: AppointmentView;
  client: ClientWithStats | null;
  color: string;
  proLabel: string;
  onClose: () => void;
  onChanged: () => void;
  onOpenClient: (tab: "ficha" | "prontuario") => void;
  businessName: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<Status | null>(null);
  const [asking, setAsking] = useState(false);
  const past = new Date(a.starts_at) < new Date();
  const active = a.status === "pending" || a.status === "confirmed";
  const years = age(client?.birth_date ?? null);
  const first = a.client_name.split(" ")[0];
  const clinical = terms.clinical;
  const word = clinical ? "consulta" : "horário";
  const when = new Date(a.starts_at).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const set = async (s: Status, pm?: string) => {
    if (s === "done" && pm === undefined) pm = paidOnlineMethod(a); // já pago pelo site
    if (s === "done" && pm === undefined && !a.insurance) return setAsking(true);
    setAsking(false);
    setBusy(s);
    try {
      await api.setAppointmentStatus(a.id, s, pm);
      toast(`Marcado como "${STATUS_LABEL[s]}".`);
      onChanged();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const msg = a.status === "pending"
    ? `Olá, ${first}! Aqui é da ${businessName}. Seu horário de ${a.service_name} em ${when} às ${hm(a.starts_at)} está confirmada.`
    : `Olá, ${first}! Lembrete do seu ${word} de ${a.service_name} na ${businessName}, ${when} às ${hm(a.starts_at)}.${a.insurance ? " Traga a carteirinha do convênio e um documento com foto." : ""}`;

  return (
    <Modal open onClose={onClose} title={clinical ? "Consulta" : "Agendamento"}>
      <div className="flex gap-3">
        <span className="mt-1.5 h-4 w-4 shrink-0 rounded" style={{ background: color }} />
        <div className="min-w-0">
          <h3 className="text-xl font-semibold">{a.service_name}</h3>
          <p className="text-sm text-zinc-500 first-letter:uppercase">{when} · {hm(a.starts_at)} – {hm(a.ends_at)}</p>
          <div className="mt-2"><StatusBadge status={a.status} /></div>
        </div>
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <Info icon="" title={a.client_name}>
          {clinical
            ? [years !== null ? `${years} anos` : null, client?.cpf ? `CPF ${maskCpf(client.cpf)}` : null].filter(Boolean).join(" · ") || "—"
            : client
              ? `${client.visits} visita${client.visits === 1 ? "" : "s"} · ${brl(client.total_spent)} gasto`
              : terms.client}
        </Info>
        {clinical ? (
          <Info icon={a.insurance ? "" : ""} title={a.insurance ? `Convênio ${a.insurance}` : "Particular"}>
            {a.insurance
              ? client?.insurance === a.insurance && client.insurance_number
                ? `Carteirinha nº ${client.insurance_number}`
                : "Carteirinha não informada"
              : a.payment_status
                ? <>Valor: {brl(a.price)} · <OnlinePayBadge a={a} onChange={onChanged} /></>
                : `Valor: ${brl(a.price)}${a.payment_method ? ` · ${a.status === "done" ? "pago com" : "vai pagar com"} ${paidLabel(a)}` : ""}`}
          </Info>
        ) : (
          <Info icon="" title={brl(a.price)}>
            {a.payment_status ? (
              <OnlinePayBadge a={a} onChange={onChanged} />
            ) : a.payment_method ? (
              a.status === "done" ? `Pago com ${paidLabel(a)}` : `Pretende pagar com ${paidLabel(a)}`
            ) : (
              "Valor do serviço"
            )}
          </Info>
        )}
        <Info icon={clinical ? "" : terms.emoji} title={a.professional_name}>{proLabel}</Info>
        <Info icon="" title={maskPhone(a.client_phone)}>
          <a className="font-semibold text-brand-600 hover:underline" href={whatsappLink(a.client_phone, msg)} target="_blank" rel="noreferrer">
            Enviar mensagem no WhatsApp
          </a>
        </Info>
        {a.notes && <Info icon="" title={clinical ? "Motivo da consulta" : "Observação do agendamento"}>{a.notes}</Info>}
        {client?.notes && <Info icon="" title={`Observações do ${terms.client.toLowerCase()}`}>{client.notes}</Info>}
      </dl>

      <div className="mt-6 flex flex-wrap gap-2">
        {a.status === "pending" && <Button size="sm" loading={busy === "confirmed"} onClick={() => set("confirmed")}>Confirmar</Button>}
        {active && past && (
          <>
            <Button size="sm" loading={busy === "done"} onClick={() => set("done")}>✓ Atendido</Button>
            <Button size="sm" variant="secondary" loading={busy === "no_show"} onClick={() => set("no_show")}>Faltou</Button>
          </>
        )}
        {active && !past && (
          <Button size="sm" variant="danger" loading={busy === "cancelled"} onClick={() => confirm(`Cancelar este${clinical ? "a consulta" : " agendamento"}?`) && set("cancelled")}>Cancelar</Button>
        )}
        {!active && <Button size="sm" variant="ghost" onClick={() => set("confirmed")}>↺ Desfazer</Button>}
      </div>
      <div className={cx("mt-3 grid gap-2 border-t border-zinc-100 pt-3", clinical ? "grid-cols-2" : "grid-cols-1")}>
        <Button size="sm" variant="secondary" onClick={() => onOpenClient("ficha")}>Ficha do {terms.client.toLowerCase()}</Button>
        {clinical && <Button size="sm" variant="secondary" onClick={() => onOpenClient("prontuario")}>Prontuário</Button>}
      </div>
      <PaidModal a={asking ? a : null} business={business} onPick={(m) => set("done", m)} onClose={() => setAsking(false)} />
    </Modal>
  );
}

function Info({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3" data-icon={icon || undefined}>
      <div className="min-w-0">
        <dt className="font-semibold">{title}</dt>
        <dd className="text-zinc-500">{children}</dd>
      </div>
    </div>
  );
}

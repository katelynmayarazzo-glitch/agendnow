/**
 * Agenda de BARBEARIAS, SALÕES e ESTÉTICA: linha do tempo do dia.
 * Cartões coloridos por profissional, horários livres entre os atendimentos,
 * marcador do "agora", ações rápidas e visão da semana.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type ClientWithStats } from "../../lib/api";
import type { AppointmentView, Professional, Status } from "../../lib/types";
import { addDays, brl, hm, sameDay, startOfDay, toMin, whatsappLink } from "../../lib/format";
import { WEEKDAYS_SHORT } from "../../lib/segments";
import { hoursFor } from "../../lib/slots";
import { Button, Empty, Spinner, StatusBadge, cx } from "../../components/ui";
import { errMsg, useToast } from "../../components/Toast";
import { useAdmin } from "./AdminLayout";
import { NewAppointmentModal, OnlinePayBadge, PaidModal, PixReview, paidLabel, paidOnlineMethod } from "./shared";
import { EventDetail, PRO_COLORS } from "./CalendarAgenda";

type Mode = "dia" | "semana";
const weekStart = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const minOf = (iso: string | Date) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};
const pad = (n: number) => String(n).padStart(2, "0");
const toHHMM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? pad(m % 60) : ""}` : `${m} min`);

type Item =
  | { kind: "appt"; a: AppointmentView }
  | { kind: "gap"; from: number; to: number }
  | { kind: "now"; at: number };

export default function AgendaTimeline() {
  const { business, terms } = useAdmin();
  const nav = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("dia");
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [pros, setPros] = useState<Professional[]>([]);
  const [proFilter, setProFilter] = useState("");
  const [hideCancelled, setHideCancelled] = useState(true);
  const [week, setWeek] = useState<AppointmentView[] | null>(null); // sempre carrega a semana (para a faixa de dias)
  const [clients, setClients] = useState<Map<string, ClientWithStats>>(new Map());
  const [selected, setSelected] = useState<AppointmentView | null>(null);
  const [create, setCreate] = useState<{ date: Date; time?: string; proId?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [paying, setPaying] = useState<AppointmentView | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const ws = weekStart(day);
  const load = useCallback(async () => {
    const [a, c] = await Promise.all([api.listAppointments(business.id, ws, addDays(ws, 7)), api.listClients(business.id)]);
    setWeek(a);
    setClients(new Map(c.map((x) => [x.id, x])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id, +ws]);
  useEffect(() => {
    setWeek(null);
    load();
  }, [load]);
  useEffect(() => {
    api.listProfessionals(business.id).then((p) => setPros(p.filter((x) => x.active)));
  }, [business.id]);

  const colorOf = useCallback((id: string) => {
    const i = pros.findIndex((p) => p.id === id);
    return PRO_COLORS[(i < 0 ? 0 : i) % PRO_COLORS.length];
  }, [pros]);

  const visible = (week ?? []).filter((a) => (!proFilter || a.professional_id === proFilter) && (!hideCancelled || a.status !== "cancelled"));
  const ofDay = (d: Date) => visible.filter((a) => sameDay(new Date(a.starts_at), d));
  // contagens dos filtros ignoram o profissional selecionado
  const scope = (week ?? []).filter((a) => (mode === "semana" || sameDay(new Date(a.starts_at), day)) && a.status !== "cancelled" && a.status !== "no_show");
  const live = (a: AppointmentView) => a.status !== "cancelled" && a.status !== "no_show";

  const dayItems = ofDay(day);
  const dayLive = dayItems.filter(live);
  const stats = {
    total: dayLive.length,
    confirmed: dayItems.filter((a) => a.status === "confirmed").length,
    pending: dayItems.filter((a) => a.status === "pending").length,
    revenue: dayLive.reduce((t, a) => t + a.price, 0),
  };

  // Linha do tempo: consultas + horários livres (quando há 1 profissional em foco) + "agora"
  const focusPro = proFilter ? pros.find((p) => p.id === proFilter) ?? null : pros.length === 1 ? pros[0] : null;
  const timeline: Item[] = useMemo(() => {
    const sorted = [...dayItems].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const items: Item[] = [];
    const wh = focusPro ? hoursFor(business, focusPro, day) : null;
    const isToday = sameDay(day, now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let cursor = wh ? toMin(wh.open) : null;
    const pushGap = (from: number, to: number) => {
      // só mostra livres a partir de agora (hoje) e com pelo menos 30 min
      const f = isToday ? Math.max(from, Math.ceil(nowMin / 15) * 15) : from;
      if (to - f >= 30 && (!isToday || to > nowMin) && !(day < startOfDay(now))) items.push({ kind: "gap", from: f, to });
    };
    for (const a of sorted) {
      const s = minOf(a.starts_at);
      if (cursor !== null && live(a) && s > cursor) pushGap(cursor, s);
      items.push({ kind: "appt", a });
      if (live(a)) cursor = cursor === null ? null : Math.max(cursor, minOf(a.ends_at));
    }
    if (wh && cursor !== null && cursor < toMin(wh.close)) pushGap(cursor, toMin(wh.close));
    // insere o marcador "agora"
    if (isToday) {
      const idx = items.findIndex((it) => (it.kind === "appt" ? minOf(it.a.starts_at) : it.kind === "gap" ? it.from : it.at) >= nowMin);
      const marker: Item = { kind: "now", at: nowMin };
      if (idx < 0) items.push(marker);
      else items.splice(idx, 0, marker);
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, proFilter, hideCancelled, day, focusPro, now, business]);

  async function setStatus(a: AppointmentView, s: Status, pm?: string) {
    if (s === "done" && pm === undefined) pm = paidOnlineMethod(a); // já pago pelo site
    if (s === "done" && pm === undefined) return setPaying(a); // pergunta como foi pago
    setPaying(null);
    setBusy(a.id + s);
    try {
      await api.setAppointmentStatus(a.id, s, pm);
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  }

  const move = (n: number) => setDay(addDays(day, mode === "dia" ? n : 7 * n));
  const isToday = sameDay(day, now);
  const title =
    mode === "dia"
      ? isToday
        ? "Hoje"
        : day.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
      : `${ws.getDate()} a ${addDays(ws, 6).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}`;

  return (
    <>
      {/* ===== Cabeçalho ===== */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-500">{mode === "dia" ? day.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Semana"}</p>
          <h1 className="text-2xl font-bold tracking-tight first-letter:uppercase">{title}</h1>
        </div>
        <Button onClick={() => setCreate({ date: day })}>+ Novo agendamento</Button>
      </div>

      <div className="mb-4 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-zinc-200/70 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center">
            <button onClick={() => move(-1)} className="grid h-9 w-9 place-items-center rounded-full text-xl text-zinc-600 hover:bg-zinc-100" aria-label="Anterior">‹</button>
            <button onClick={() => move(1)} className="grid h-9 w-9 place-items-center rounded-full text-xl text-zinc-600 hover:bg-zinc-100" aria-label="Próximo">›</button>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setDay(startOfDay(new Date()))}>Hoje</Button>
          <input
            type="date"
            aria-label="Escolher data"
            className="rounded-lg bg-white px-2 py-1 text-sm ring-1 ring-zinc-200"
            value={day.toLocaleDateString("sv-SE")}
            onChange={(e) => e.target.value && setDay(new Date(`${e.target.value}T00:00:00`))}
          />
          <div className="ml-auto flex rounded-xl bg-zinc-100 p-1 text-sm font-semibold">
            {(["dia", "semana"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cx("rounded-lg px-3 py-1", mode === m ? "bg-white shadow-sm" : "text-zinc-500")}>{m === "dia" ? "Dia" : "Semana"}</button>
            ))}
          </div>
        </div>

        {/* faixa da semana com contagem */}
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => {
            const n = ofDay(d).filter(live).length;
            const sel = mode === "dia" && sameDay(d, day);
            const today = sameDay(d, now);
            const closed = !hoursFor(business, null, d) && !pros.some((p) => hoursFor(business, p, d));
            return (
              <button
                key={+d}
                onClick={() => { setDay(d); setMode("dia"); }}
                className={cx(
                  "flex flex-col items-center rounded-2xl py-2 transition",
                  sel ? "bg-grad text-white shadow-sm" : "hover:bg-zinc-100",
                  closed && !sel && "opacity-45",
                )}
              >
                <span className={cx("text-[11px] font-semibold uppercase", !sel && (today ? "text-brand-600" : "text-zinc-500"))}>{WEEKDAYS_SHORT[d.getDay()]}</span>
                <span className="text-lg font-bold">{d.getDate()}</span>
                <span className={cx("mt-0.5 h-5 min-w-5 rounded-full px-1.5 text-[11px] leading-5 font-bold", n ? (sel ? "bg-white/25" : "bg-brand-50 text-brand-700") : "opacity-0")}>{n}</span>
              </button>
            );
          })}
        </div>

        {/* profissionais */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
          <ProChip on={!proFilter} onClick={() => setProFilter("")} label="Todos" count={scope.length} />
          {pros.map((p) => (
            <ProChip
              key={p.id}
              on={proFilter === p.id}
              onClick={() => setProFilter(p.id)}
              label={p.name}
              color={colorOf(p.id)}
              count={scope.filter((a) => a.professional_id === p.id).length}
            />
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500">
            <input type="checkbox" checked={hideCancelled} onChange={(e) => setHideCancelled(e.target.checked)} /> Ocultar cancelados
          </label>
        </div>
      </div>

      {week === null ? (
        <div className="flex justify-center py-16 text-zinc-400"><Spinner className="h-6 w-6" /></div>
      ) : mode === "dia" ? (
        <>
          {/* resumo do dia */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Mini label="Agendamentos" value={String(stats.total)} />
            <Mini label="Confirmados" value={String(stats.confirmed)} tone="text-emerald-600" />
            <Mini label="Aguardando" value={String(stats.pending)} tone="text-amber-600" />
            <Mini label="Previsto" value={brl(stats.revenue)} tone="text-brand-600" />
          </div>

          {dayItems.length === 0 && !timeline.some((t) => t.kind === "gap") ? (
            <Empty title="Nenhum agendamento neste dia">
              <button className="mt-2 font-semibold text-brand-600 hover:underline" onClick={() => setCreate({ date: day, proId: proFilter || undefined })}>+ Agendar um horário</button>
            </Empty>
          ) : (
            <ol className="relative">
              {timeline.map((it, i) =>
                it.kind === "now" ? (
                  <li key={`now${i}`} className="relative my-2 flex items-center gap-3 pl-[76px] sm:pl-[92px]">
                    <span className="absolute left-[66px] h-3 w-3 rounded-full bg-rose-500 ring-4 ring-rose-500/20 sm:left-[82px]" />
                    <span className="h-px flex-1 bg-rose-400" />
                    <span className="text-xs font-bold text-rose-500">Agora · {toHHMM(it.at)}</span>
                  </li>
                ) : it.kind === "gap" ? (
                  <li key={`gap${it.from}`} className="relative flex gap-3 pb-3">
                    <TimeCol start={toHHMM(it.from)} end={toHHMM(it.to)} muted />
                    <Rail color="var(--grid-line)" dashed />
                    <button
                      onClick={() => setCreate({ date: day, time: toHHMM(Math.ceil(it.from / business.slot_interval) * business.slot_interval), proId: focusPro?.id })}
                      className="group flex flex-1 items-center justify-between rounded-2xl border-2 border-dashed border-zinc-200 px-4 py-3 text-left text-sm text-zinc-500 transition hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700"
                    >
                      <span>Livre · {dur(it.to - it.from)}{focusPro && pros.length > 1 ? ` com ${focusPro.name}` : ""}</span>
                      <span className="font-semibold opacity-0 transition group-hover:opacity-100">+ Agendar</span>
                    </button>
                  </li>
                ) : (
                  <li key={it.a.id} className="relative flex gap-3 pb-3">
                    <TimeCol start={hm(it.a.starts_at)} end={hm(it.a.ends_at)} muted={!live(it.a)} />
                    <Rail color={colorOf(it.a.professional_id)} />
                    <ApptCard
                      a={it.a}
                      color={colorOf(it.a.professional_id)}
                      client={clients.get(it.a.client_id) ?? null}
                      past={new Date(it.a.starts_at) < now}
                      busy={busy}
                      businessName={business.name}
                      onStatus={(s) => setStatus(it.a, s)}
                      onOpen={() => setSelected(it.a)}
                      onPayChange={load}
                    />
                  </li>
                ),
              )}
            </ol>
          )}
        </>
      ) : (
        /* ===== Semana ===== */
        <div className="space-y-4">
          {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => {
            const items = ofDay(d).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
            if (!items.length) return null;
            const rev = items.filter(live).reduce((t, a) => t + a.price, 0);
            return (
              <section key={+d} className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200/70">
                <button onClick={() => { setDay(d); setMode("dia"); }} className="flex w-full items-center justify-between bg-zinc-50 px-4 py-3 text-left hover:bg-zinc-100">
                  <span className="flex items-center gap-3">
                    <span className={cx("grid h-10 w-10 place-items-center rounded-xl text-lg font-bold", sameDay(d, now) ? "bg-grad text-white" : "bg-white ring-1 ring-zinc-200")}>{d.getDate()}</span>
                    <span>
                      <span className="block font-semibold first-letter:uppercase">{d.toLocaleDateString("pt-BR", { weekday: "long" })}</span>
                      <span className="block text-xs text-zinc-500">{items.filter(live).length} agendamento(s) · {brl(rev)}</span>
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-brand-600">Ver dia →</span>
                </button>
                <ul className="divide-y divide-zinc-100">
                  {items.map((a) => (
                    <li key={a.id}>
                      <button onClick={() => setSelected(a)} className={cx("flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-50", !live(a) && "opacity-55")}>
                        <span className="w-12 shrink-0 text-sm font-bold">{hm(a.starts_at)}</span>
                        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: colorOf(a.professional_id) }} />
                        <span className="min-w-0 flex-1">
                          <span className={cx("block truncate text-sm font-semibold", a.status === "no_show" && "line-through")}>{a.client_name}</span>
                          <span className="block truncate text-xs text-zinc-500">{a.service_name} · {a.professional_name}</span>
                        </span>
                        <span className="hidden text-sm font-semibold sm:block">{brl(a.price)}</span>
                        <StatusBadge status={a.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {visible.length === 0 && <Empty title="Nenhum agendamento nesta semana" />}
        </div>
      )}

      {selected && (
        <EventDetail
          a={selected}
          client={clients.get(selected.client_id) ?? null}
          color={colorOf(selected.professional_id)}
          proLabel={terms.pro}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); load(); }}
          onOpenClient={() => nav(`/painel/clientes?id=${selected.client_id}`)}
          businessName={business.name}
          terms={terms}
          business={business}
        />
      )}

      <PaidModal a={paying} business={business} onPick={(m) => paying && setStatus(paying, "done", m)} onClose={() => setPaying(null)} />

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
    </>
  );
}

function TimeCol({ start, end, muted }: { start: string; end: string; muted?: boolean }) {
  return (
    <div className={cx("w-14 shrink-0 pt-3 text-right sm:w-[70px]", muted && "opacity-50")}>
      <p className="text-base font-bold leading-tight">{start}</p>
      <p className="text-[11px] text-zinc-400">{end}</p>
    </div>
  );
}

function Rail({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <div className="relative w-3 shrink-0">
      <span className="absolute top-0 bottom-[-12px] left-1/2 -translate-x-1/2 border-l-2" style={{ borderColor: "var(--grid-line)", borderStyle: dashed ? "dashed" : "solid" }} />
      <span className="absolute top-4 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full ring-4 ring-[var(--surface)]" style={{ background: color }} />
    </div>
  );
}

function ApptCard({ a, color, client, past, busy, businessName, onStatus, onOpen, onPayChange }: {
  onPayChange: () => void;
  a: AppointmentView;
  color: string;
  client: ClientWithStats | null;
  past: boolean;
  busy: string | null;
  businessName: string;
  onStatus: (s: Status) => void;
  onOpen: () => void;
}) {
  const active = a.status === "pending" || a.status === "confirmed";
  const off = a.status === "cancelled" || a.status === "no_show";
  const first = a.client_name.split(" ")[0];
  const when = new Date(a.starts_at).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const msg =
    a.status === "pending"
      ? `Olá, ${first}! Aqui é da ${businessName}. Seu horário de ${a.service_name} em ${when} às ${hm(a.starts_at)} está confirmado. Até lá!`
      : `Olá, ${first}! Passando para lembrar do seu horário de ${a.service_name} na ${businessName}, ${when} às ${hm(a.starts_at)}.`;
  const isNew = client && client.visits === 0 && !past;

  return (
    <div
      className={cx("flex-1 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/80 transition hover:shadow-md", off && "opacity-60")}
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <button onClick={onOpen} className="block w-full px-4 pt-3 pb-2 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: color }}>
            {a.client_name.charAt(0).toUpperCase()}
          </span>
          <span className={cx("min-w-0 flex-1 truncate font-semibold", a.status === "no_show" && "line-through")}>{a.client_name}</span>
          {isNew && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-600 ring-1 ring-violet-200">1ª visita</span>}
          <StatusBadge status={a.status} />
        </div>
        <p className="mt-1.5 text-sm text-zinc-600">
          <b className="text-zinc-800">{a.service_name}</b> · <span style={{ color }}>●</span> {a.professional_name} · <b className="text-zinc-800">{brl(a.price)}</b>
          {a.payment_status ? (
            <span className="ml-2">
              <OnlinePayBadge a={a} compact />
            </span>
          ) : a.payment_method && (
            <span className={cx("ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", a.status === "done" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200")}>
              {a.status === "done" ? `Pago · ${paidLabel(a)}` : `Vai pagar · ${paidLabel(a)}`}
            </span>
          )}
        </p>
        {(a.notes || client?.notes) && <p className="mt-1 truncate text-xs text-zinc-500">{a.notes || client?.notes}</p>}
      </button>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-100 px-3 py-2">
        {a.status === "pending" && <Button size="sm" loading={busy === a.id + "confirmed"} onClick={() => onStatus("confirmed")}>Confirmar</Button>}
        {active && past && (
          <>
            <Button size="sm" variant="secondary" loading={busy === a.id + "done"} onClick={() => onStatus("done")}>✓ Atendido</Button>
            <Button size="sm" variant="ghost" loading={busy === a.id + "no_show"} onClick={() => onStatus("no_show")}>Faltou</Button>
          </>
        )}
        {active && (
          <a href={whatsappLink(a.client_phone, msg)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-emerald-600 hover:bg-emerald-50">
            WhatsApp
          </a>
        )}
        {active && !past && (
          <Button size="sm" variant="ghost" className="!text-zinc-400 hover:!text-rose-600" loading={busy === a.id + "cancelled"} onClick={() => confirm("Cancelar este agendamento?") && onStatus("cancelled")}>
            Cancelar
          </Button>
        )}
        {!active && <Button size="sm" variant="ghost" onClick={() => onStatus("confirmed")}>↺ Desfazer</Button>}
        <PixReview a={a} onChange={onPayChange} />
        <button onClick={onOpen} className="ml-auto rounded-lg px-2 py-1.5 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">Detalhes →</button>
      </div>
    </div>
  );
}

function ProChip({ on, onClick, label, count, color }: { on: boolean; onClick: () => void; label: string; count: number; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex items-center gap-1.5 rounded-full py-1 pr-1.5 pl-3 text-xs font-semibold ring-1 transition",
        on ? "bg-grad text-white ring-transparent shadow-sm" : "bg-white ring-zinc-200 hover:bg-zinc-50",
      )}
    >
      {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
      {label}
      <span className={cx("rounded-full px-1.5 text-[10px] leading-4", on ? "bg-white/20" : "bg-zinc-100 text-zinc-500")}>{count}</span>
    </button>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-200/70">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={cx("text-xl font-bold tracking-tight", tone)}>{value}</p>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { AppointmentView } from "../../lib/types";
import { addDays, brl, publicUrl, sameDay, startOfDay } from "../../lib/format";
import { Alert, Button, Card, Empty, PageLoader } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { PageHeader, useAdmin } from "./AdminLayout";
import { AppointmentRow, NewAppointmentModal } from "./shared";
import { paymentLabel } from "../../lib/payments";

export default function Dashboard() {
  const { business, terms } = useAdmin();
  const [qs] = useSearchParams();
  const toast = useToast();
  const [list, setList] = useState<AppointmentView[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    const today = startOfDay(new Date());
    setList(await api.listAppointments(business.id, addDays(today, -30), addDays(today, 8)));
  }, [business.id]);
  useEffect(() => {
    load();
  }, [load]);

  const s = useMemo(() => {
    if (!list) return null;
    const now = new Date();
    const today = list.filter((a) => sameDay(new Date(a.starts_at), now));
    const live = (a: AppointmentView) => a.status !== "cancelled" && a.status !== "no_show";
    const past30 = list.filter((a) => new Date(a.starts_at) < now);
    const done30 = past30.filter((a) => a.status === "done");
    const noShow = past30.filter((a) => a.status === "no_show").length;
    const closed = done30.length + noShow;
    const top = new Map<string, number>();
    done30.forEach((a) => top.set(a.service_name, (top.get(a.service_name) ?? 0) + 1));
    return {
      today: today.filter(live),
      todayRevenue: today.filter(live).reduce((t, a) => t + a.price, 0),
      pending: list.filter((a) => a.status === "pending" && new Date(a.starts_at) > now),
      week: list.filter((a) => live(a) && new Date(a.starts_at) >= now).length,
      revenue30: done30.reduce((t, a) => t + a.price, 0),
      noShowRate: closed ? Math.round((noShow / closed) * 100) : 0,
      top: [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
      online: (() => {
        const paid = list.filter((a) => a.payment_status === "paid" && a.status !== "cancelled");
        return {
          paid: paid.length,
          value: paid.reduce((t, a) => t + a.price, 0),
          review: list.filter((a) => a.payment_status === "review" && a.status !== "cancelled").length,
          waiting: list.filter((a) => a.payment_status === "pending" && a.status !== "cancelled" && new Date(a.starts_at) >= now).length,
        };
      })(),
      byPay: (() => {
        const m = new Map<string, { n: number; v: number }>();
        done30.filter((a) => !a.insurance).forEach((a) => {
          const k = a.payment_method || "?";
          const cur = m.get(k) ?? { n: 0, v: 0 };
          m.set(k, { n: cur.n + 1, v: cur.v + a.price });
        });
        return [...m.entries()].sort((a, b) => b[1].v - a[1].v);
      })(),
      byIns: (() => {
        const m = new Map<string, number>();
        list.filter((a) => live(a) && new Date(a.starts_at) >= now).forEach((a) => m.set(a.insurance || "Particular", (m.get(a.insurance || "Particular") ?? 0) + 1));
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
      })(),
    };
  }, [list]);

  if (!list || !s) return <PageLoader />;

  const link = publicUrl(business.slug);
  const greeting = new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite";

  return (
    <>
      <PageHeader
        title={`${greeting}!`}
        sub={new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        action={<Button onClick={() => setNewOpen(true)}>+ Novo agendamento</Button>}
      />

      {qs.get("bemvindo") && (
        <div className="mb-6">
          <Alert kind="success">
            <b>Sua agenda está no ar! </b> Já criamos serviços de exemplo — revise preços em{" "}
            <Link to="/painel/servicos" className="font-semibold underline">Serviços</Link> e divulgue seu link:{" "}
            <button className="font-semibold underline" onClick={() => navigator.clipboard.writeText(link).then(() => toast("Link copiado!"))}>{link}</button>
          </Alert>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat hero label="Hoje" value={String(s.today.length)} sub={brl(s.todayRevenue) + " previsto"} icon="" />
        <Stat label="Próximos 7 dias" value={String(s.week)} sub="agendamentos" icon="" tone="bg-neutral-900 text-white" />
        <Stat label="Faturado (30 dias)" value={brl(s.revenue30)} sub="atendimentos concluídos" icon="" tone="bg-cyan-50 text-cyan-700" />
        <Stat label="Faltas (30 dias)" value={`${s.noShowRate}%`} sub="dos atendimentos" icon="" tone={s.noShowRate >= 15 ? "bg-amber-500 text-white" : "bg-zinc-100 text-zinc-700"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {s.pending.length > 0 && (
            <Card>
              <h2 className="font-semibold">Aguardando sua confirmação <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">{s.pending.length}</span></h2>
              <div className="mt-1 divide-y divide-zinc-100">
                {s.pending.map((a) => <AppointmentRow key={a.id} a={a} business={business} onChange={load} showDate />)}
              </div>
            </Card>
          )}
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Agenda de hoje</h2>
              <Link to="/painel/agenda" className="text-sm font-semibold text-brand-600 hover:underline">Ver agenda →</Link>
            </div>
            <div className="mt-1 divide-y divide-zinc-100">
              {s.today.length === 0 ? (
                <div className="pt-4"><Empty title="Nenhum horário hoje">Divulgue seu link para receber agendamentos.</Empty></div>
              ) : (
                s.today.map((a) => <AppointmentRow key={a.id} a={a} business={business} onChange={load} />)
              )}
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <h2 className="font-semibold">Seu link de agendamento</h2>
            <p className="mt-1 text-sm text-zinc-500">Coloque na bio do Instagram e no WhatsApp Business.</p>
            <div className="mt-3 truncate rounded-xl bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-200">{link}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(link).then(() => toast("Link copiado!"))}>Copiar</Button>
              <a href={link} target="_blank" rel="noreferrer"><Button variant="secondary" size="sm" className="w-full">Abrir</Button></a>
            </div>
          </Card>
          <Card>
            <h2 className="font-semibold">Mais procurados (30 dias)</h2>
            {s.top.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">Marque atendimentos como "Atendido" para ver aqui.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {s.top.map(([n, c]) => (
                  <li key={n}>
                    <div className="flex justify-between text-sm"><span>{n}</span><span className="font-semibold">{c}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-zinc-100">
                      <div className="bg-grad h-full rounded-full" style={{ width: `${(c / s.top[0][1]) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="font-semibold">Recebido por forma de pagamento</h2>
            <p className="text-xs text-zinc-500">Atendimentos concluídos nos últimos 30 dias</p>
            {(s.online.paid > 0 || s.online.review > 0 || s.online.waiting > 0) && (
              <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
                Pago pelo site: <b>{brl(s.online.value)}</b> ({s.online.paid})
                {s.online.review > 0 && (
                  <Link to="/painel/agenda" className="mt-0.5 block font-semibold text-sky-700 hover:underline">{s.online.review} Pix para conferir →</Link>
                )}
                {s.online.waiting > 0 && <span className="mt-0.5 block text-xs text-amber-700">{s.online.waiting} aguardando pagamento</span>}
              </div>
            )}
            {s.byPay.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">Ao marcar "Atendido", escolha como foi pago para ver aqui.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {s.byPay.map(([k, v]) => (
                  <li key={k}>
                    <div className="flex justify-between text-sm">
                      <span>{k === "?" ? "Não informado" : `${paymentLabel(k)}`} <span className="text-xs text-zinc-400">({v.n})</span></span>
                      <span className="font-semibold">{brl(v.v)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-zinc-100">
                      <div className="bg-grad h-full rounded-full" style={{ width: `${(v.v / Math.max(...s.byPay.map((x) => x[1].v), 1)) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {terms.clinical && (
            <Card>
              <h2 className="font-semibold">Próximos 7 dias por atendimento</h2>
              {s.byIns.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">Nenhum agendamento futuro.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {s.byIns.map(([n, c]) => (
                    <li key={n} className="flex items-center justify-between">
                      <span>{n === "Particular" ? "" : ""} {n}</span>
                      <span className="font-semibold">{c}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <p className="px-1 text-xs text-zinc-400">Atendendo {terms.clients.toLowerCase()} como {terms.label.toLowerCase()}.</p>
        </div>
      </div>

      <NewAppointmentModal open={newOpen} onClose={() => setNewOpen(false)} onSaved={load} business={business} terms={terms} />
    </>
  );
}

function Stat({ label, value, sub, icon, tone, hero }: { label: string; value: string; sub: string; icon: string; tone?: string; hero?: boolean }) {
  if (hero)
    return (
      <div className="bg-grad relative overflow-hidden rounded-2xl p-4 text-white shadow-sm">
        <div className="absolute -top-6 -right-6 h-20 w-20 rounded-full bg-white/20" />
        <p className="text-xs font-medium opacity-90">{label}</p>
        <p className="mt-1 text-3xl font-extrabold tracking-tight">{value}</p>
        <p className="text-xs opacity-85">{sub}</p>
      </div>
    );
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-zinc-400">{sub}</p>
    </div>
  );
}

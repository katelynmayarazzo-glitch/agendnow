import { useEffect, useState, type CSSProperties } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { BookingPublicView } from "../lib/types";
import { brl, dayLong, hm, maskPhone, whatsappLink } from "../lib/format";
import { SEGMENTS } from "../lib/segments";
import { Alert, Button, Logo, PageLoader, StatusBadge } from "../components/ui";
import { errMsg } from "../components/Toast";
import NotFound from "./NotFound";
import { isOnlineMethod, onlineSetup, paymentLabel } from "../lib/payments";
import { PaymentCheckout } from "../components/PaymentCheckout";
import { getProfile } from "../lib/clientDevice";
import { ThemeToggle } from "../components/ThemeToggle";

const gcalDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export default function BookingDetails() {
  const { token = "" } = useParams();
  const [qs] = useSearchParams();
  const isNew = qs.get("novo") === "1";
  const [data, setData] = useState<BookingPublicView | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [wantPay, setWantPay] = useState(qs.get("pagar") === "1");
  const [justPaid, setJustPaid] = useState("");

  const load = () => api.getBooking(token).then(setData).catch(() => setData(null));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Pix/boleto/débito pelo processador: confere a cada 5 s se o banco já confirmou
  const waitingBank = api.mode === "supabase" && data?.appointment.payment_status === "pending";
  useEffect(() => {
    if (!waitingBank) return;
    const t = setInterval(() => api.getBooking(token).then((d) => d && setData(d)).catch(() => null), 5000);
    return () => clearInterval(t);
  }, [waitingBank, token]);

  if (data === undefined) return <PageLoader />;
  if (!data) return <NotFound />;

  const { appointment: a, business: b } = data;
  const terms = SEGMENTS[b.segment];
  const future = new Date(a.starts_at) > new Date();
  const active = a.status === "pending" || a.status === "confirmed";
  const title = `${data.service_name} — ${b.name}`;
  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${gcalDate(a.starts_at)}/${gcalDate(a.ends_at)}&details=${encodeURIComponent(`Com ${data.professional_name}`)}&location=${encodeURIComponent(b.address)}`;
  const setup = onlineSetup(b, api.mode === "demo", a.starts_at);
  const ps = a.payment_status;
  const canPayOnline = active && setup.enabled && !a.insurance && a.price > 0 && ps !== "paid" && ps !== "review";
  const showCheckout = canPayOnline && (ps === "pending" || wantPay);
  const profile = getProfile();
  const msg = `Olá! Sou ${data.client_name}, tenho horário de ${data.service_name} com ${data.professional_name} em ${dayLong(a.starts_at)} às ${hm(a.starts_at)}.`;

  function downloadIcs() {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//AgendNow//PT-BR",
      "BEGIN:VEVENT",
      `UID:${a.token}@agendnow`,
      `DTSTAMP:${gcalDate(new Date().toISOString())}`,
      `DTSTART:${gcalDate(a.starts_at)}`,
      `DTEND:${gcalDate(a.ends_at)}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:Com ${data!.professional_name}${a.insurance ? ` (Convênio ${a.insurance})` : ""}`,
      `LOCATION:${b.address}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT2H",
      "ACTION:DISPLAY",
      "DESCRIPTION:Lembrete do seu horário",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "agendamento.ics";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await api.cancelBooking(token);
      await load();
      setConfirming(false);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ "--accent": "#2563eb" } as CSSProperties} className="admin-bg min-h-screen">
      <div className="relative h-48 overflow-hidden bg-[#071330]">
        <div className="relative mx-auto flex max-w-lg items-center justify-between px-4 pt-4">
          <Link to="/"><Logo light className="text-base text-white" /></Link>
          <ThemeToggle variant="glass" />
        </div>
      </div>
      <main className="relative mx-auto -mt-24 max-w-lg px-4 pb-16">
        <div className="fade-up rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200/70">
          {isNew && active ? (
            <div className="mb-4 text-center">
              <div className="bg-grad mx-auto mb-3 grid h-16 w-16 shadow-sm place-items-center rounded-full text-2xl text-white">✓</div>
              <h1 className="text-xl font-bold">
                {a.status === "confirmed" ? "Agendamento confirmado!" : "Pedido de agendamento enviado!"}
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {a.status === "confirmed"
                  ? `Tudo certo, ${data.client_name.split(" ")[0]}. Te esperamos!`
                  : `${b.name} vai confirmar seu horário em breve.`}
              </p>
            </div>
          ) : (
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-xl font-bold">Seu agendamento</h1>
              <StatusBadge status={a.status} />
            </div>
          )}

          <dl className="divide-y divide-zinc-100 rounded-2xl bg-zinc-50 px-4 text-sm ring-1 ring-zinc-200">
            <Row k="Local" v={b.name} />
            <Row k="Serviço" v={`${data.service_name}${!a.insurance && a.price ? ` · ${brl(a.price)}` : ""}`} />
            {terms.clinical && <Row k="Atendimento" v={a.insurance ? `Convênio ${a.insurance}` : "Particular"} />}
            {ps === "paid" ? (
              <Row k="Pagamento" v={<span className="text-emerald-700">✓ Pago online · {a.payment_info || paymentLabel(a.payment_method)}</span>} />
            ) : ps === "review" ? (
              <Row k="Pagamento" v="Pix informado · aguardando conferência" />
            ) : ps === "pending" ? (
              <Row k="Pagamento" v={<span className="text-amber-700">Aguardando pagamento online</span>} />
            ) : (
              a.payment_method && <Row k="Pagamento" v={`${paymentLabel(a.payment_method)} (no local)`} />
            )}
            <Row k={terms.pro} v={data.professional_name} />
            <Row k="Data" v={dayLong(a.starts_at)} />
            <Row k="Horário" v={`${hm(a.starts_at)} – ${hm(a.ends_at)}`} />
            <Row k={terms.client} v={data.client_name} />
            {isNew && <Row k="Status" v={<StatusBadge status={a.status} />} />}
          </dl>

          {b.address && <p className="mt-3 text-sm text-zinc-500">{b.address}</p>}

          {justPaid && (
            <div className="mt-4">
              <Alert kind="success">✓ Pagamento aprovado — {justPaid}. Você não precisa pagar nada no local.</Alert>
            </div>
          )}
          {ps === "review" && (
            <div className="mt-4">
              <Alert kind="info">Recebemos seu aviso de Pix. {b.name} vai conferir o recebimento e confirmar por aqui.</Alert>
            </div>
          )}

          {showCheckout && (
            <section className="mt-5 rounded-2xl p-4 ring-1 ring-zinc-200">
              <h2 className="font-semibold">{setup.required ? "Pague para garantir seu horário" : "Pagar agora"}</h2>
              <p className="mb-4 text-sm text-zinc-500">{data.service_name} · {b.name}</p>
              <PaymentCheckout
                amount={a.price}
                methods={setup.methods}
                initialMethod={isOnlineMethod(a.payment_method) ? a.payment_method : undefined}
                defaults={{ cpf: profile?.cpf, email: profile?.email }}
                allowSaveCard
                onPay={(req) => api.payBooking(token, req)}
                onPaid={(info) => {
                  setJustPaid(info);
                  setWantPay(false);
                  load();
                }}
                onReport={async () => {
                  await api.reportPixPaid(token);
                  await load();
                }}
                onSimulate={
                  api.simulatePaid
                    ? async () => {
                        await api.simulatePaid!(token);
                        const d = await api.getBooking(token);
                        setJustPaid(d?.appointment.payment_info ?? "Pago");
                        setWantPay(false);
                        setData(d);
                      }
                    : undefined
                }
              />
              {ps === "" && (
                <button onClick={() => setWantPay(false)} className="mt-3 w-full text-center text-sm text-zinc-500 hover:underline">
                  Prefiro pagar no local
                </button>
              )}
            </section>
          )}
          {canPayOnline && !showCheckout && future && (
            <Button className="mt-5 w-full" onClick={() => setWantPay(true)}>Pagar agora pelo site · {brl(a.price)}</Button>
          )}

          {active && future && (
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <a href={gcal} target="_blank" rel="noreferrer">
                <Button variant="secondary" className="w-full">Google Agenda</Button>
              </a>
              <Button variant="secondary" onClick={downloadIcs}>Salvar no calendário</Button>
              {b.phone && (
                <a href={whatsappLink(b.phone, msg)} target="_blank" rel="noreferrer" className="sm:col-span-2">
                  <Button variant="secondary" className="w-full">Falar no WhatsApp {maskPhone(b.phone)}</Button>
                </a>
              )}
            </div>
          )}

          {error && <div className="mt-4"><Alert>{error}</Alert></div>}

          {active && future && (
            <div className="mt-5 border-t border-zinc-100 pt-4">
              {confirming ? (
                <div className="space-y-2">
                  <p className="text-sm text-zinc-600">Tem certeza que deseja cancelar este horário?</p>
                  <div className="flex gap-2">
                    <Button variant="danger" loading={busy} onClick={cancel} className="flex-1">Sim, cancelar</Button>
                    <Button variant="ghost" onClick={() => setConfirming(false)} className="flex-1">Voltar</Button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirming(true)} className="w-full text-sm font-medium text-rose-600 hover:underline">
                  Preciso cancelar
                </button>
              )}
            </div>
          )}

          {a.status === "cancelled" && (
            <div className="mt-4">
              <Alert kind="info">
                Este agendamento foi cancelado.{ps === "paid" && <> Como o pagamento foi feito pelo site, fale com {b.name} para combinar o reembolso.</>}
              </Alert>
            </div>
          )}

          <p className="mt-5 text-center text-xs text-zinc-400">Guarde este link para consultar ou cancelar quando quiser.</p>
        </div>

        <div className="mt-4 text-center">
          <Link to={`/${b.slug}`} className="text-sm font-semibold text-brand-600 hover:underline">
            Fazer outro agendamento
          </Link>
        </div>
      </main>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-zinc-500">{k}</dt>
      <dd className="text-right font-medium capitalize-first">{v}</dd>
    </div>
  );
}

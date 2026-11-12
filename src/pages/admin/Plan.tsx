/**
 * "Meu plano": o dono do negócio escolhe o plano do AgendNow e a forma de pagamento.
 * Com Supabase + Asaas: abre a fatura do Asaas (cartão, Pix ou boleto) — o cartão é
 * digitado na página segura do Asaas, nunca aqui. No modo local, a aprovação é simulada.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Subscription } from "../../lib/types";
import { BILLING_TYPES, PLANS, planById, type BillingType, type PlanId } from "../../lib/plans";
import { brl, maskCpf, onlyDigits, whatsappLink } from "../../lib/format";
import { SUPPORT_PHONE } from "../../lib/config";
import { Alert, Button, Card, Field, Input, Modal, PageLoader, cx } from "../../components/ui";
import { PaymentCheckout } from "../../components/PaymentCheckout";
import { demoCharge, type OnlineMethod } from "../../lib/payments";

const BILLING_TO_METHOD: Record<string, OnlineMethod> = { CREDIT_CARD: "credito", PIX: "pix", BOLETO: "boleto" };
import { errMsg, useToast } from "../../components/Toast";
import { PageHeader, useAdmin } from "./AdminLayout";

function maskDoc(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length <= 11) return maskCpf(d);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

export default function Plan() {
  const { business } = useAdmin();
  const toast = useToast();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [plan, setPlan] = useState<PlanId>("profissional");
  const [billing, setBilling] = useState<BillingType>("CREDIT_CARD");
  const [doc, setDoc] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false); // modo local: tela de pagamento simulada

  const load = useCallback(async () => {
    const s = await api.getSubscription(business.id);
    setSub(s);
    setPlan(s.plan as PlanId);
    if (s.billing_type) setBilling(s.billing_type as BillingType);
  }, [business.id]);
  useEffect(() => {
    load().catch((e) => setError(errMsg(e)));
  }, [load]);

  if (!sub) return error ? <Alert>{error}</Alert> : <PageLoader />;

  const current = planById(sub.plan);
  const chosen = planById(plan);
  const isActive = sub.status === "active";
  const changing = isActive && (plan !== sub.plan || billing !== sub.billing_type);

  async function checkout() {
    setError("");
    if (![11, 14].includes(onlyDigits(doc).length)) return setError("Informe o CPF ou CNPJ de quem vai pagar (vai na nota/fatura).");
    if (api.mode === "demo") return setPaying(true);
    setLoading(true);
    try {
      const r = await api.startCheckout({ business_id: business.id, plan, billing_type: billing, cpf_cnpj: doc });
      if (r.simulated) toast("Assinatura ativada (simulação do modo local).");
      else if (r.invoice_url) {
        window.open(r.invoice_url, "_blank", "noopener");
        toast("Abrimos a página de pagamento em outra aba.");
      }
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  async function activateDemo() {
    await api.startCheckout({ business_id: business.id, plan, billing_type: billing, cpf_cnpj: doc });
    setPaying(false);
    toast("Pagamento aprovado — assinatura ativa (simulação do modo local).");
    await load();
  }

  return (
    <>
      <Modal open={paying} onClose={() => setPaying(false)} title={`Assinar o plano ${chosen.name}`}>
        <PaymentCheckout
          amount={chosen.price}
          methods={[BILLING_TO_METHOD[billing]]}
          defaults={{ cpf: onlyDigits(doc).length === 11 ? doc : "" }}
          payLabel={`Assinar por ${brl(chosen.price)}/mês`}
          onPay={async (req) =>
            demoCharge(req, chosen.price, { key: "pagamentos@agendnow.app", name: "AgendNow", city: "CAMPINAS", txid: "PLANO" + Date.now().toString().slice(-10) })
          }
          onPaid={() => activateDemo()}
          onSimulate={activateDemo}
        />
        <p className="mt-2 text-center text-xs text-sky-700">Versão local: nada é cobrado. Cartão de teste 4242 4242 4242 4242 (final 0002 = recusado).</p>
      </Modal>
      <PageHeader title="Meu plano" sub="Assinatura do AgendNow para o seu negócio." />

      {/* ===== Situação atual ===== */}
      <div className="bg-grad relative mb-6 overflow-hidden rounded-3xl p-6 text-white shadow-sm">
        <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/15" />
        <p className="text-sm font-medium opacity-85">Plano {current.name}</p>
        {sub.status === "trial" && (
          <>
            <h2 className="mt-1 text-2xl font-bold">Teste grátis · {daysLeft(sub.trial_ends_at)} dia(s) restantes</h2>
            <p className="mt-1 text-sm opacity-90">Termina em {fmtDate(sub.trial_ends_at)}. Assine abaixo para não perder o acesso — a 1ª cobrança só acontece no fim do teste.</p>
          </>
        )}
        {sub.status === "active" && (
          <>
            <h2 className="mt-1 text-2xl font-bold">✓ Assinatura ativa</h2>
            <p className="mt-1 text-sm opacity-90">
              {brl(current.price)}/mês · {BILLING_TYPES.find((b) => b.id === sub.billing_type)?.label ?? "—"}
              {sub.current_period_end && <> · próxima cobrança em {fmtDate(sub.current_period_end)}</>}
            </p>
          </>
        )}
        {sub.status === "pending" && (
          <>
            <h2 className="mt-1 text-2xl font-bold">Pagamento pendente</h2>
            <p className="mt-1 text-sm opacity-90">Conclua o pagamento para manter sua agenda no ar.</p>
          </>
        )}
        {sub.status === "overdue" && (
          <>
            <h2 className="mt-1 text-2xl font-bold">Pagamento atrasado</h2>
            <p className="mt-1 text-sm opacity-90">Regularize para evitar a suspensão da sua página de agendamento.</p>
          </>
        )}
        {sub.status === "canceled" && <h2 className="mt-1 text-2xl font-bold">Assinatura cancelada</h2>}
        {sub.invoice_url && sub.status !== "active" && (
          <a href={sub.invoice_url} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-xl bg-neutral-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-white">
            Abrir fatura para pagar →
          </a>
        )}
      </div>

      {/* ===== Escolha do plano ===== */}
      <h3 className="mb-3 font-semibold">1. Escolha o plano</h3>
      <div className="mb-8 grid gap-3 md:grid-cols-3">
        {PLANS.map((p) => {
          const on = plan === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPlan(p.id)}
              className={cx(
                "relative rounded-3xl bg-white p-5 text-left shadow-sm ring-1 transition hover:shadow-md",
                on ? "ring-2 ring-brand-600" : "ring-zinc-200",
              )}
            >
              {p.hot && <span className="bg-grad absolute -top-2.5 right-4 rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white">Mais escolhido</span>}
              {sub.plan === p.id && isActive && <span className="absolute top-4 right-4 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">Atual</span>}
              <div className="flex items-center gap-2">
                <span className={cx("grid h-5 w-5 place-items-center rounded-full ring-2", on ? "bg-brand-600 ring-brand-600" : "ring-zinc-300")}>
                  {on && <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
                <span className="font-bold">{p.name}</span>
              </div>
              <p className="mt-0.5 pl-7 text-xs text-zinc-500">{p.desc}</p>
              <p className="mt-3 pl-7">
                <span className="text-3xl font-extrabold tracking-tight">{brl(p.price)}</span>
                <span className="text-sm text-zinc-500">/mês</span>
              </p>
              <ul className="mt-3 space-y-1 pl-7 text-sm text-zinc-600">
                {p.features.map((f) => <li key={f}>✓ {f}</li>)}
              </ul>
            </button>
          );
        })}
      </div>

      {/* ===== Forma de pagamento ===== */}
      <h3 className="mb-3 font-semibold">2. Forma de pagamento</h3>
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {BILLING_TYPES.map((b) => {
          const on = billing === b.id;
          return (
            <button
              key={b.id}
              onClick={() => setBilling(b.id)}
              className={cx("rounded-2xl bg-white p-4 text-left shadow-sm ring-1 transition", on ? "ring-2 ring-brand-600" : "ring-zinc-200 hover:ring-zinc-300")}
            >
              <p className="flex items-center gap-2 font-semibold">
                {b.label}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{b.hint}</p>
            </button>
          );
        })}
      </div>

      <Card className="mb-6">
        <div className="grid items-end gap-4 md:grid-cols-[1fr_auto]">
          <Field label="CPF ou CNPJ de quem paga" hint="Usado na fatura e na nota fiscal.">
            <Input value={doc} inputMode="numeric" placeholder="000.000.000-00" onChange={(e) => setDoc(maskDoc(e.target.value))} />
          </Field>
          <div className="text-right">
            <p className="text-sm text-zinc-500">Total mensal</p>
            <p className="text-2xl font-extrabold">{brl(chosen.price)}</p>
          </div>
        </div>
        {error && <div className="mt-4"><Alert>{error}</Alert></div>}
        <Button size="lg" className="mt-4 w-full" loading={loading} onClick={checkout} disabled={isActive && !changing}>
          {isActive ? (changing ? "Alterar assinatura" : "Você já está neste plano") : billing === "CREDIT_CARD" ? "Assinar com cartão" : billing === "PIX" ? "Assinar com Pix" : "Assinar com boleto"}
        </Button>
        <p className="mt-3 text-center text-xs text-zinc-500">
          Pagamento processado pelo Asaas. Os dados do cartão são digitados na página segura deles — o AgendNow não armazena cartão.
        </p>
        {api.mode === "demo" && (
          <div className="mt-4">
            <Alert kind="info">
              <b>Versão local:</b> o pagamento é apenas simulado. Para cobrar de verdade, publique com Supabase e configure o Asaas (veja o README).
            </Alert>
          </div>
        )}
      </Card>

      <p className="text-center text-sm text-zinc-500">
        Dúvidas sobre cobrança?{" "}
        <a className="font-semibold text-brand-600 hover:underline" target="_blank" rel="noreferrer" href={whatsappLink(SUPPORT_PHONE, `Olá! Tenho uma dúvida sobre a assinatura do AgendNow (${business.name}).`)}>
          Fale com o suporte
        </a>
      </p>
    </>
  );
}

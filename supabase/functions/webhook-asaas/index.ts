/**
 * Recebe os avisos do ASAAS (webhook) e atualiza a assinatura do negócio.
 * No Asaas: Integrações > Webhooks > URL = https://SEU_PROJETO.supabase.co/functions/v1/webhook-asaas
 * e defina um "token de autenticação"; salve o mesmo aqui:
 *   supabase secrets set ASAAS_WEBHOOK_TOKEN=...
 *
 * Também recebe os avisos das contas Asaas DOS ESTABELECIMENTOS (pagamento online de agendamentos):
 * a URL tem ?b=<id da empresa> e o token é o que a função pagar-agendamento cadastrou ao conectar.
 *
 * Publicar SEM exigir login (o Asaas não tem login no Supabase):
 *   supabase functions deploy webhook-asaas --no-verify-jwt
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const PAID_INFO: Record<string, string> = { PIX: "Pix recebido", BOLETO: "Boleto compensado", CREDIT_CARD: "Cartão de crédito", DEBIT_CARD: "Cartão de débito" };

/** Aviso da conta Asaas de um estabelecimento → atualiza o pagamento do agendamento. */
async function appointmentEvent(req: Request, businessId: string) {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: gw } = await admin.from("business_gateways").select("webhook_token").eq("business_id", businessId).maybeSingle();
  if (!gw || req.headers.get("asaas-access-token") !== gw.webhook_token) return new Response("unauthorized", { status: 401 });

  const ev = await req.json();
  const payment = ev.payment ?? {};
  const ref = String(payment.externalReference ?? "");
  if (!ref.startsWith("agd:")) return new Response("ignored");

  let patch: Record<string, unknown>;
  switch (ev.event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
      patch = { payment_status: "paid", paid_at: new Date().toISOString() };
      if (payment.billingType !== "CREDIT_CARD") patch.payment_info = PAID_INFO[payment.billingType] ?? "Pago online";
      if (payment.billingType === "DEBIT_CARD") patch.payment_method = "debito";
      break;
    case "PAYMENT_REFUNDED":
      patch = { payment_status: "", paid_at: null, payment_info: "Estornado" };
      break;
    case "PAYMENT_DELETED":
      // cobrança substituída (o cliente trocou a forma) — não mexe se já está paga
      return new Response("ignored");
    default:
      return new Response("ignored");
  }
  let q = admin.from("appointments").update(patch).eq("id", ref.slice(4)).eq("business_id", businessId);
  if (ev.event !== "PAYMENT_REFUNDED") q = q.neq("payment_status", "paid"); // aviso repetido: não reescreve
  const { error } = await q;
  if (error) return new Response(error.message, { status: 500 });
  return new Response("ok");
}

Deno.serve(async (req) => {
  const businessId = new URL(req.url).searchParams.get("b");
  if (businessId) return appointmentEvent(req, businessId);
  if (req.headers.get("asaas-access-token") !== Deno.env.get("ASAAS_WEBHOOK_TOKEN")) return new Response("unauthorized", { status: 401 });

  const ev = await req.json();
  const payment = ev.payment ?? {};
  const subId: string | undefined = payment.subscription ?? ev.subscription?.id;
  if (!subId) return new Response("ignored");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  switch (ev.event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED": {
      const end = new Date(payment.dueDate ?? Date.now());
      end.setMonth(end.getMonth() + 1);
      Object.assign(patch, { status: "active", current_period_end: end.toISOString() });
      break;
    }
    case "PAYMENT_CREATED":
    case "PAYMENT_UPDATED":
      if (payment.invoiceUrl) patch.invoice_url = payment.invoiceUrl; // link da fatura do mês
      break;
    case "PAYMENT_OVERDUE":
      Object.assign(patch, { status: "overdue", invoice_url: payment.invoiceUrl ?? null });
      break;
    case "SUBSCRIPTION_DELETED":
    case "SUBSCRIPTION_INACTIVATED":
      patch.status = "canceled";
      break;
    default:
      return new Response("ignored");
  }

  const { error } = await admin.from("subscriptions").update(patch).eq("asaas_subscription_id", subId);
  if (error) return new Response(error.message, { status: 500 });
  return new Response("ok");
});

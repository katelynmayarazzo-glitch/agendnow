/**
 * Cria a assinatura do AgendNow no ASAAS e devolve o link da fatura.
 * O dono do negócio paga na página segura do Asaas (cartão, Pix ou boleto) —
 * o AgendNow NUNCA recebe nem guarda dados de cartão.
 *
 * Segredos:
 *   supabase secrets set ASAAS_API_KEY=... ASAAS_API_URL=https://api-sandbox.asaas.com/v3
 *   (em produção: ASAAS_API_URL=https://api.asaas.com/v3)
 * Publicar:
 *   supabase functions deploy criar-assinatura
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const PRICES: Record<string, number> = { essencial: 49.9, profissional: 89.9, clinica: 149.9 }; // R$ — iguais a src/lib/plans.ts
const NAMES: Record<string, string> = { essencial: "Essencial", profissional: "Profissional", clinica: "Clínica" };
const BILLING = ["CREDIT_CARD", "PIX", "BOLETO"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function asaas(path: string, init: RequestInit = {}) {
  const res = await fetch(`${Deno.env.get("ASAAS_API_URL")}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", access_token: Deno.env.get("ASAAS_API_KEY")!, ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.errors?.[0]?.description ?? `Asaas ${res.status}`);
  return body;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // 1) quem está pedindo? (usa o login do dono)
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "Faça login novamente." }, 401);

    const { business_id, plan, billing_type, cpf_cnpj } = await req.json();
    const doc = String(cpf_cnpj ?? "").replace(/\D/g, "");
    if (!PRICES[plan] || !BILLING.includes(billing_type) || ![11, 14].includes(doc.length)) return json({ error: "Dados inválidos." }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: biz } = await admin.from("businesses").select("id, name, phone, owner_id").eq("id", business_id).single();
    if (!biz || biz.owner_id !== u.user.id) return json({ error: "Sem permissão." }, 403);
    const { data: sub } = await admin.from("subscriptions").select("*").eq("business_id", business_id).single();

    // 2) cliente no Asaas (reaproveita se já existir)
    let customer = sub?.asaas_customer_id as string | null;
    if (!customer) {
      const c = await asaas("/customers", {
        method: "POST",
        body: JSON.stringify({ name: biz.name, cpfCnpj: doc, email: u.user.email, mobilePhone: biz.phone, externalReference: biz.id }),
      });
      customer = c.id;
    }

    // 3) troca de plano/forma: remove a assinatura anterior e cria outra
    if (sub?.asaas_subscription_id) await asaas(`/subscriptions/${sub.asaas_subscription_id}`, { method: "DELETE" }).catch(() => null);

    // primeira cobrança: no fim do teste grátis (ou hoje, se já acabou)
    const trialEnd = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : new Date();
    const due = trialEnd > new Date() ? trialEnd : new Date();
    const created = await asaas("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        customer,
        billingType: billing_type,
        value: PRICES[plan],
        nextDueDate: due.toISOString().slice(0, 10),
        cycle: "MONTHLY",
        description: `AgendNow — Plano ${NAMES[plan]}`,
        externalReference: biz.id,
      }),
    });

    // 4) link da primeira fatura (página de pagamento do Asaas)
    const pays = await asaas(`/subscriptions/${created.id}/payments`);
    const invoice_url = pays?.data?.[0]?.invoiceUrl ?? null;

    await admin.from("subscriptions").upsert({
      business_id,
      plan,
      billing_type,
      status: sub?.status === "active" ? "active" : "pending",
      asaas_customer_id: customer,
      asaas_subscription_id: created.id,
      invoice_url,
      updated_at: new Date().toISOString(),
    });

    return json({ invoice_url });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Erro ao criar assinatura." }, 500);
  }
});

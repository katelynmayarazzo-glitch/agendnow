/**
 * Pagamento online do AGENDAMENTO (cliente final → estabelecimento), pela conta Asaas DO ESTABELECIMENTO.
 * O dinheiro cai direto na conta dele; o AgendNow não guarda número de cartão nem CVV.
 *
 * Ações:
 *   connect    (dono logado)  salva a chave de API do Asaas e cadastra o webhook automaticamente
 *   disconnect (dono logado)  remove a chave
 *   pay        (público)      cobra um agendamento pelo token: Pix (QR), boleto, cartão de crédito
 *                             (aprovação na hora, com parcelas) ou débito (página segura do Asaas)
 *
 * Publicar:
 *   supabase functions deploy pagar-agendamento --no-verify-jwt
 * (sem verificar JWT porque o cliente final não tem login; a ação connect confere o login por conta própria)
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

class Fail extends Error {}

function asaasClient(apiUrl: string, apiKey: string) {
  return async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "User-Agent": "AgendNow", access_token: apiKey, ...(init.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Fail(body?.errors?.[0]?.description ?? `Asaas ${res.status}`);
    return body;
  };
}

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** Dono ou administrador da empresa? (usa o login de quem chamou) */
async function requireAdmin(req: Request, businessId: string) {
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data } = await userClient.rpc("is_admin", { bid: businessId });
  if (data !== true) throw new Fail("Sem permissão.");
}

const ONLINE = ["pix", "credito", "debito", "boleto"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const db = admin();

    // ------------------------------------------------------------ conectar conta Asaas
    if (body.action === "connect") {
      await requireAdmin(req, body.business_id);
      const apiKey = String(body.api_key ?? "").trim();
      if (apiKey.length < 20) throw new Fail("Cole a chave de API do Asaas (Integrações → Chave de API).");
      // chave de sandbox começa com $aact_hmlg_; produção com $aact_prod_ (ou formato antigo)
      const apiUrl = apiKey.includes("_hmlg_") ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
      const asaas = asaasClient(apiUrl, apiKey);
      await asaas("/finance/balance"); // valida a chave

      const webhookToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const { data: biz } = await db.from("businesses").select("id, name, owner_id").eq("id", body.business_id).single();
      const { data: owner } = await db.auth.admin.getUserById(biz!.owner_id);
      await asaas("/webhooks", {
        method: "POST",
        body: JSON.stringify({
          name: `AgendNow — ${biz!.name}`.slice(0, 50),
          url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/webhook-asaas?b=${biz!.id}`,
          email: owner.user?.email,
          enabled: true,
          interrupted: false,
          apiVersion: 3,
          authToken: webhookToken,
          sendType: "SEQUENTIALLY",
          events: ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_REFUNDED", "PAYMENT_DELETED"],
        }),
      });
      await db.from("business_gateways").upsert({
        business_id: biz!.id, provider: "asaas", api_key: apiKey, api_url: apiUrl, webhook_token: webhookToken, updated_at: new Date().toISOString(),
      });
      await db.from("businesses").update({ gateway: "asaas" }).eq("id", biz!.id);
      return json({ ok: true, sandbox: apiUrl.includes("sandbox") });
    }

    if (body.action === "disconnect") {
      await requireAdmin(req, body.business_id);
      await db.from("business_gateways").delete().eq("business_id", body.business_id);
      await db.from("businesses").update({ gateway: "" }).eq("id", body.business_id);
      return json({ ok: true });
    }

    // ------------------------------------------------------------ pagar um agendamento
    if (body.action !== "pay") throw new Fail("Ação inválida.");
    const { data: a } = await db
      .from("appointments")
      .select("*, clients(name, phone, email), services(name), businesses(*)")
      .eq("token", body.token)
      .maybeSingle();
    if (!a) throw new Fail("Agendamento não encontrado.");
    const b = a.businesses;
    const method = String(body.method);
    if (a.status === "cancelled") throw new Fail("Este agendamento foi cancelado.");
    if (a.payment_status === "paid") throw new Fail("Este agendamento já está pago.");
    if (a.insurance || a.price <= 0) throw new Fail("Este agendamento não tem valor a pagar pelo site.");
    if (b.online_payment === "off" || !ONLINE.includes(method) || !b.payment_methods.includes(method)) throw new Fail("Forma de pagamento indisponível.");
    if (method === "boleto" && new Date(a.starts_at).getTime() < Date.now() + 3 * 86400000) throw new Fail("Boleto indisponível: o horário é em menos de 3 dias.");
    const cpf = digits(body.cpf);
    if (cpf.length !== 11) throw new Fail("Informe um CPF válido.");

    const { data: gw } = await db.from("business_gateways").select("*").eq("business_id", b.id).maybeSingle();
    if (!gw) throw new Fail("Este estabelecimento ainda não recebe pagamentos online por cartão/boleto.");
    const asaas = asaasClient(gw.api_url, gw.api_key);

    // cliente no Asaas (pelo CPF)
    const email = String(body.email || a.clients?.email || "").trim();
    const found = await asaas(`/customers?cpfCnpj=${cpf}&limit=1`);
    const customer =
      found?.data?.[0]?.id ??
      (await asaas("/customers", {
        method: "POST",
        body: JSON.stringify({ name: a.clients?.name, cpfCnpj: cpf, email: email || undefined, mobilePhone: a.clients?.phone, notificationDisabled: true }),
      })).id;

    // cobrança anterior pendente deste agendamento (ex.: trocou de Pix para cartão) → apaga
    if (a.asaas_payment_id) await asaas(`/payments/${a.asaas_payment_id}`, { method: "DELETE" }).catch(() => null);

    const value = a.price / 100;
    const today = new Date().toISOString().slice(0, 10);
    const base = {
      customer,
      value,
      dueDate: today,
      description: `${a.services?.name ?? "Agendamento"} — ${b.name}`.slice(0, 500),
      externalReference: `agd:${a.id}`,
    };
    const save = (patch: Record<string, unknown>) => db.from("appointments").update(patch).eq("id", a.id);

    if (method === "pix") {
      const p = await asaas("/payments", { method: "POST", body: JSON.stringify({ ...base, billingType: "PIX" }) });
      const qr = await asaas(`/payments/${p.id}/pixQrCode`);
      await save({ payment_method: "pix", payment_status: "pending", asaas_payment_id: p.id });
      return json({ status: "waiting", pix: { payload: qr.payload, image: qr.encodedImage } });
    }

    if (method === "boleto") {
      const due = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      const p = await asaas("/payments", { method: "POST", body: JSON.stringify({ ...base, dueDate: due, billingType: "BOLETO" }) });
      const f = await asaas(`/payments/${p.id}/identificationField`);
      await save({ payment_method: "boleto", payment_status: "pending", asaas_payment_id: p.id });
      return json({ status: "waiting", boleto: { line: f.identificationField, barcode: f.barCode, due, pdf_url: p.bankSlipUrl } });
    }

    if (method === "debito") {
      // débito online é concluído na página segura do Asaas (autenticação do banco)
      const p = await asaas("/payments", { method: "POST", body: JSON.stringify({ ...base, billingType: "UNDEFINED" }) });
      await save({ payment_method: "debito", payment_status: "pending", asaas_payment_id: p.id });
      return json({ status: "redirect", invoice_url: p.invoiceUrl });
    }

    // crédito: aprovação na hora (cartão novo ou vinculado/tokenizado)
    const n = Math.max(1, Math.min(6, Number(body.installments) || 1));
    const card = body.card ?? {};
    const exp = String(card.expiry ?? "").split("/");
    const payload: Record<string, unknown> = {
      ...base,
      billingType: "CREDIT_CARD",
      remoteIp: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || undefined,
      ...(n > 1 ? { installmentCount: n, totalValue: value, value: undefined } : {}),
    };
    if (body.saved?.token) payload.creditCardToken = body.saved.token;
    else {
      payload.creditCard = { holderName: card.holder, number: digits(card.number), expiryMonth: exp[0], expiryYear: `20${exp[1] ?? ""}`, ccv: digits(card.cvv) };
      payload.creditCardHolderInfo = {
        name: card.holder,
        email: email || `${cpf}@clientes.agendnow.app`,
        cpfCnpj: cpf,
        postalCode: digits(card.postal_code),
        addressNumber: String(card.address_number ?? ""),
        phone: a.clients?.phone,
      };
    }
    const p = await asaas("/payments", { method: "POST", body: JSON.stringify(payload) });
    if (!["CONFIRMED", "RECEIVED"].includes(p.status)) {
      await asaas(`/payments/${p.id}`, { method: "DELETE" }).catch(() => null);
      throw new Fail("Pagamento recusado pelo banco emissor. Tente outro cartão.");
    }
    const brand = p.creditCard?.creditCardBrand ? String(p.creditCard.creditCardBrand).replace(/_/g, " ") : body.saved?.brand ?? "Cartão";
    const last4 = p.creditCard?.creditCardNumber ?? body.saved?.last4 ?? digits(card.number).slice(-4);
    const info = `${brand.charAt(0)}${brand.slice(1).toLowerCase()} crédito final ${last4}${n > 1 ? ` em ${n}x` : ""}`;
    await save({ payment_method: "credito", payment_status: "paid", paid_at: new Date().toISOString(), payment_info: info, asaas_payment_id: p.id });
    return json({
      status: "paid",
      info,
      saved_card:
        body.save_card && p.creditCard?.creditCardToken
          ? { kind: "credito", brand: info.split(" crédito")[0], last4, holder: String(card.holder ?? "").toUpperCase(), token: p.creditCard.creditCardToken }
          : undefined,
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Fail ? e.message : "Não foi possível processar o pagamento." }, e instanceof Fail ? 400 : 500);
  }
});

/**
 * MODELO de integração (Supabase Edge Function): envia lembrete pelo WhatsApp
 * para os agendamentos de amanhã. Ajuste o "enviarWhatsApp" conforme a documentação
 * do provedor que você contratar (Z-API, Twilio, WhatsApp Cloud API da Meta etc.).
 *
 * Segredos (nunca no código nem no front-end):
 *   supabase secrets set WHATSAPP_API_URL=... WHATSAPP_API_TOKEN=...
 * Publicar:
 *   supabase functions deploy lembretes-whatsapp
 * Agendar (todo dia às 18h): Supabase > Integrations > Cron, chamando esta função.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // chave de servidor: ignora RLS, só existe aqui dentro
);

async function enviarWhatsApp(telefone: string, mensagem: string) {
  const res = await fetch(Deno.env.get("WHATSAPP_API_URL")!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("WHATSAPP_API_TOKEN")}`,
    },
    // o formato do corpo muda de provedor para provedor — confira na documentação dele
    body: JSON.stringify({ phone: `55${telefone}`, message: mensagem }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
}

Deno.serve(async () => {
  const inicio = new Date();
  inicio.setDate(inicio.getDate() + 1);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 1);

  const { data, error } = await supabase
    .from("appointments")
    .select("starts_at, insurance, clients(name, phone), services(name), businesses(name)")
    .in("status", ["pending", "confirmed"])
    .gte("starts_at", inicio.toISOString())
    .lt("starts_at", fim.toISOString());
  if (error) return new Response(error.message, { status: 500 });

  let enviados = 0;
  for (const a of data ?? []) {
    // deno-lint-ignore no-explicit-any
    const r = a as any;
    const hora = new Date(r.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    const msg =
      `Olá, ${r.clients.name.split(" ")[0]}! Lembrete: amanhã às ${hora} você tem ${r.services.name} na ${r.businesses.name}.` +
      (r.insurance ? " Traga a carteirinha do convênio e um documento com foto." : "");
    try {
      await enviarWhatsApp(r.clients.phone, msg);
      enviados++;
    } catch (e) {
      console.error(e);
    }
  }
  return Response.json({ enviados });
});

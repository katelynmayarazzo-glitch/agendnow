/**
 * Usuários da equipe:
 *  - action "invite": cria o login e o Supabase envia o e-mail com o link para a pessoa CRIAR A SENHA.
 *  - action "remove": apaga o acesso (login + vínculo com a empresa).
 * Só o dono ou um administrador da empresa pode usar.
 *
 * Publicar:  supabase functions deploy gerenciar-usuarios
 * No Supabase: Authentication > URL Configuration > Redirect URLs → adicione https://SEU_SITE/definir-senha
 * (o texto do e-mail fica em Authentication > Email Templates > "Invite user").
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: me } = await userClient.auth.getUser();
    if (!me.user) return json({ error: "Faça login novamente." }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();

    // quem pede é dono ou administrador da empresa?
    const canManage = async (businessId: string) => {
      const { data: b } = await admin.from("businesses").select("owner_id").eq("id", businessId).single();
      if (b?.owner_id === me.user!.id) return true;
      const { data: m } = await admin.from("business_members").select("role").eq("business_id", businessId).eq("user_id", me.user!.id).maybeSingle();
      return m?.role === "admin";
    };

    if (body.action === "invite") {
      const { business_id, role, redirect_to } = body;
      const name = String(body.name ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!(await canManage(business_id))) return json({ error: "Apenas o dono ou administradores podem criar usuários." }, 403);
      if (name.split(/\s+/).length < 2) return json({ error: "Informe nome e sobrenome." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail inválido." }, 400);
      if (!["admin", "equipe"].includes(role)) return json({ error: "Permissão inválida." }, 400);

      // cria o login e envia o e-mail de convite (link para definir a senha)
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { name }, redirectTo: redirect_to });
      if (error) {
        const exists = /already|registered|exists/i.test(error.message);
        return json({ error: exists ? "Este e-mail já tem acesso ao AgendNow." : error.message }, 400);
      }
      const { error: insErr } = await admin.from("business_members").insert({ business_id, user_id: data.user.id, name, email, role });
      if (insErr) {
        await admin.auth.admin.deleteUser(data.user.id); // desfaz para não deixar login solto
        return json({ error: insErr.message }, 400);
      }
      return json({ ok: true });
    }

    if (body.action === "remove") {
      const { data: m } = await admin.from("business_members").select("business_id, user_id").eq("id", body.member_id).single();
      if (!m) return json({ ok: true });
      if (!(await canManage(m.business_id))) return json({ error: "Sem permissão." }, 403);
      if (m.user_id === me.user.id) return json({ error: "Você não pode remover o seu próprio acesso." }, 400);
      await admin.auth.admin.deleteUser(m.user_id); // apaga o login; o vínculo sai junto (on delete cascade)
      return json({ ok: true });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});

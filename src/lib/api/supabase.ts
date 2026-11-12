/**
 * Adaptador de PRODUÇÃO: Supabase (PostgreSQL + Auth).
 * Rode supabase/schema.sql no seu projeto antes de usar.
 */
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import type { Api, ClientWithStats } from "./types";
import type { Appointment, AppointmentView, Business, Client, ClinicalNote, Member, Professional, Service, Subscription } from "../types";
import { appUrl } from "../format";
import { defaultHours } from "../segments";
import { onlyDigits } from "../format";
import { onlineSetup, pixPayload } from "../payments";

export function createSupabaseApi(url: string, key: string): Api {
  const sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });

  const ok = <T>(r: { data: T; error: PostgrestError | null }): T => {
    if (r.error) throw new Error(friendly(r.error));
    return r.data;
  };

  const viewSelect = "*, clients(name, phone), services(name), professionals(name)";
  type Row = Appointment & {
    clients: { name: string; phone: string } | null;
    services: { name: string } | null;
    professionals: { name: string } | null;
  };
  const toView = (r: Row): AppointmentView => {
    const { clients, services, professionals, ...a } = r;
    return {
      ...a,
      client_name: clients?.name ?? "—",
      client_phone: clients?.phone ?? "",
      service_name: services?.name ?? "—",
      professional_name: professionals?.name ?? "—",
    };
  };

  async function uidOrThrow() {
    const { data } = await sb.auth.getUser();
    if (!data.user) throw new Error("Sessão expirada. Entre novamente.");
    return data.user.id;
  }

  return {
    mode: "supabase",

    async getPublicBusiness(slug) {
      return ok(await sb.rpc("get_public_business", { p_slug: slug })) ?? null;
    },
    async getBusy(professionalId, from, to) {
      return ok(
        await sb.rpc("get_busy", { p_professional: professionalId, p_from: from.toISOString(), p_to: to.toISOString() }),
      ) ?? [];
    },
    async createBooking(i) {
      const token = ok(
        await sb.rpc("create_booking", {
          p_business: i.business_id,
          p_service: i.service_id,
          p_professional: i.professional_id,
          p_starts: i.starts_at,
          p_name: i.name,
          p_phone: onlyDigits(i.phone),
          p_email: i.email,
          p_birth: i.birth_date,
          p_notes: i.notes,
          p_cpf: onlyDigits(i.cpf),
          p_insurance: i.insurance,
          p_insurance_number: i.insurance_number,
          p_payment: i.payment_method,
          p_pay_online: !!i.pay_online,
        }),
      ) as string;
      return { token };
    },
    async getBooking(token) {
      return ok(await sb.rpc("get_booking", { p_token: token })) ?? null;
    },
    async cancelBooking(token) {
      ok(await sb.rpc("cancel_booking", { p_token: token }));
    },
    async isSlugAvailable(slug) {
      return !!ok(await sb.rpc("slug_available", { p_slug: slug }));
    },

    async payBooking(token, req) {
      const bk = (ok(await sb.rpc("get_booking", { p_token: token })) ?? null) as { appointment: Appointment; business: Business } | null;
      if (!bk) throw new Error("Agendamento não encontrado.");
      const { appointment: a, business: b } = bk;
      const setup = onlineSetup(b, false, a.starts_at);
      // Pix direto na chave do estabelecimento (sem processador): o QR é gerado aqui mesmo
      if (req.method === "pix" && setup.directPix) {
        ok(await sb.rpc("start_direct_pix", { p_token: token }));
        const payload = pixPayload({
          key: b.pix_key,
          cents: a.price,
          name: b.pix_name || b.name,
          city: b.pix_city || "BRASIL",
          txid: "AGD" + a.id.replace(/-/g, "").slice(0, 12),
        });
        return { status: "waiting", manual: true, pix: { payload } };
      }
      // Demais casos: Edge Function com a chave do Asaas do estabelecimento (supabase/functions/pagar-agendamento)
      const { data, error } = await sb.functions.invoke("pagar-agendamento", { body: { action: "pay", token, ...req } });
      if (error) throw new Error((await error.context?.json?.().catch(() => null))?.error ?? "Não foi possível processar o pagamento. Tente novamente.");
      if (data?.error) throw new Error(data.error);
      return data;
    },
    async reportPixPaid(token) {
      ok(await sb.rpc("report_pix_paid", { p_token: token }));
    },

    async getUser() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      return u ? { id: u.id, email: u.email ?? "" } : null;
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message.includes("Invalid") ? "E-mail ou senha incorretos." : error.message);
      return { id: data.user.id, email: data.user.email ?? "" };
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw new Error(error.message);
      if (!data.session)
        throw new Error("Conta criada! Confirme pelo link enviado ao seu e-mail e depois faça login.");
      return { id: data.user!.id, email: data.user!.email ?? "" };
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async requestPasswordReset(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: appUrl("/definir-senha") });
      if (error) throw new Error(error.message);
      return {};
    },
    async checkPasswordLink() {
      // o link do e-mail (convite ou redefinição) já cria a sessão ao abrir a página
      for (let i = 0; i < 15; i++) {
        const { data } = await sb.auth.getSession();
        if (data.session) return { ok: true, email: data.session.user.email ?? "", name: data.session.user.user_metadata?.name };
        await new Promise((r) => setTimeout(r, 200));
      }
      return { ok: false };
    },
    async setPasswordFromLink(_token, password) {
      if (password.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
      const { data, error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(error.message.includes("session") ? "Link inválido ou expirado. Peça um novo." : error.message);
      await sb.rpc("accept_membership");
      return { id: data.user.id, email: data.user.email ?? "" };
    },

    async getMyRole(businessId) {
      const { data: s } = await sb.auth.getSession();
      const uidNow = s.session?.user.id;
      const b = ok(await sb.from("businesses").select("owner_id").eq("id", businessId).single()) as { owner_id: string };
      if (b.owner_id === uidNow) return "owner";
      const m = ok(await sb.from("business_members").select("role").eq("business_id", businessId).eq("user_id", uidNow!).single()) as { role: "admin" | "equipe" };
      return m.role;
    },
    async listMembers(businessId) {
      const rows = ok(await sb.from("business_members").select("*").eq("business_id", businessId).order("created_at")) as (Omit<Member, "status"> & { accepted_at: string | null })[];
      return rows.map(({ accepted_at, ...m }) => ({ ...m, status: accepted_at ? "active" : "pending" }) as Member);
    },
    async inviteMember(input) {
      const { data, error } = await sb.functions.invoke("gerenciar-usuarios", {
        body: { action: "invite", ...input, redirect_to: appUrl("/definir-senha") },
      });
      if (error) throw new Error((await error.context?.json?.().catch(() => null))?.error ?? "Não foi possível criar o usuário.");
      if (data?.error) throw new Error(data.error);
      return {};
    },
    async updateMemberRole(id, role) {
      ok(await sb.from("business_members").update({ role }).eq("id", id));
    },
    async removeMember(id) {
      const { data, error } = await sb.functions.invoke("gerenciar-usuarios", { body: { action: "remove", member_id: id } });
      if (error || data?.error) throw new Error(data?.error ?? "Não foi possível remover o usuário.");
    },

    async getMyBusiness() {
      const { data: s } = await sb.auth.getSession();
      if (!s.session) return null;
      let data = ok(await sb.from("businesses").select("*").eq("owner_id", s.session.user.id).maybeSingle());
      if (!data) {
        // não é dono: talvez seja da equipe de alguma empresa
        const m = ok(await sb.from("business_members").select("business_id").eq("user_id", s.session.user.id).maybeSingle()) as { business_id: string } | null;
        if (m) {
          await sb.rpc("accept_membership");
          data = ok(await sb.from("businesses").select("*").eq("id", m.business_id).maybeSingle());
        }
      }
      if (!data) return null;
      const { owner_id: _o, created_at: _c, ...b } = data as Business & { owner_id: string; created_at: string };
      return b as Business;
    },
    async createBusiness(input) {
      const owner_id = await uidOrThrow();
      const data = ok(
        await sb
          .from("businesses")
          .insert({
            owner_id,
            slug: input.slug,
            name: input.name.trim(),
            segment: input.segment,
            phone: onlyDigits(input.phone),
            hours: defaultHours(),
          })
          .select("*")
          .single(),
      );
      return data as Business;
    },
    async updateBusiness(b) {
      const { gateway: _g, ...rest } = b; // processador conectado: só o servidor altera
      ok(await sb.from("businesses").update(rest).eq("id", b.id));
    },

    async listServices(businessId) {
      return ok(await sb.from("services").select("*").eq("business_id", businessId).order("name")) as Service[];
    },
    async saveService(s) {
      const { id, ...rest } = s;
      const q = id
        ? sb.from("services").update(rest).eq("id", id).select("*").single()
        : sb.from("services").insert(rest).select("*").single();
      return ok(await q) as Service;
    },
    async deleteService(id) {
      ok(await sb.from("services").delete().eq("id", id));
    },

    async listProfessionals(businessId) {
      return ok(await sb.from("professionals").select("*").eq("business_id", businessId).order("name")) as Professional[];
    },
    async saveProfessional(p) {
      const { id, ...rest } = p;
      const q = id
        ? sb.from("professionals").update(rest).eq("id", id).select("*").single()
        : sb.from("professionals").insert(rest).select("*").single();
      return ok(await q) as Professional;
    },
    async deleteProfessional(id) {
      ok(await sb.from("professionals").delete().eq("id", id));
    },

    async listAppointments(businessId, from, to) {
      const rows = ok(
        await sb
          .from("appointments")
          .select(viewSelect)
          .eq("business_id", businessId)
          .gte("starts_at", from.toISOString())
          .lt("starts_at", to.toISOString())
          .order("starts_at"),
      ) as unknown as Row[];
      return rows.map(toView);
    },
    async setAppointmentStatus(id, status, payment_method) {
      ok(await sb.from("appointments").update(payment_method === undefined ? { status } : { status, payment_method }).eq("id", id));
    },

    async setPaymentStatus(id, status) {
      const patch: Record<string, unknown> = { payment_status: status, paid_at: status === "paid" ? new Date().toISOString() : null };
      if (status === "paid") patch.payment_info = "Pix conferido pelo estabelecimento";
      else patch.payment_info = "";
      ok(await sb.from("appointments").update(patch).eq("id", id));
    },
    async connectGateway(businessId, apiKey) {
      const { data, error } = await sb.functions.invoke("pagar-agendamento", { body: { action: "connect", business_id: businessId, api_key: apiKey.trim() } });
      if (error) throw new Error((await error.context?.json?.().catch(() => null))?.error ?? "Não foi possível conectar o Asaas.");
      if (data?.error) throw new Error(data.error);
    },
    async disconnectGateway(businessId) {
      const { data, error } = await sb.functions.invoke("pagar-agendamento", { body: { action: "disconnect", business_id: businessId } });
      if (error || data?.error) throw new Error(data?.error ?? "Não foi possível desconectar.");
    },

    async listClients(businessId) {
      const clients = ok(await sb.from("clients").select("*").eq("business_id", businessId).order("name")) as Client[];
      const aps = ok(
        await sb.from("appointments").select("client_id, starts_at, status, price").eq("business_id", businessId),
      ) as Pick<Appointment, "client_id" | "starts_at" | "status" | "price">[];
      const now = new Date();
      return clients.map((c): ClientWithStats => {
        const mine = aps.filter((a) => a.client_id === c.id);
        const done = mine.filter((a) => a.status === "done").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        const fut = mine
          .filter((a) => (a.status === "pending" || a.status === "confirmed") && new Date(a.starts_at) > now)
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        return {
          ...c,
          visits: done.length,
          total_spent: done.reduce((t, a) => t + a.price, 0),
          last_visit: done[done.length - 1]?.starts_at ?? null,
          next_visit: fut[0]?.starts_at ?? null,
        };
      });
    },
    async clientHistory(clientId) {
      const rows = ok(
        await sb.from("appointments").select(viewSelect).eq("client_id", clientId).order("starts_at", { ascending: false }),
      ) as unknown as Row[];
      return rows.map(toView);
    },
    async saveClient(c) {
      const { id, created_at: _c, ...rest } = c;
      const payload = { ...rest, phone: onlyDigits(rest.phone), cpf: onlyDigits(rest.cpf) };
      const q = id
        ? sb.from("clients").update(payload).eq("id", id).select("*").single()
        : sb.from("clients").insert(payload).select("*").single();
      return ok(await q) as Client;
    },
    async deleteClient(id) {
      ok(await sb.from("clients").delete().eq("id", id));
    },

    async listNotes(clientId) {
      return ok(
        await sb.from("clinical_notes").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
      ) as ClinicalNote[];
    },
    async addNote(n) {
      if (!n.text.trim()) throw new Error("Escreva a anotação.");
      return ok(await sb.from("clinical_notes").insert({ ...n, text: n.text.trim() }).select("*").single()) as ClinicalNote;
    },
    async deleteNote(id) {
      ok(await sb.from("clinical_notes").delete().eq("id", id));
    },

    async getSubscription(businessId) {
      const s = ok(await sb.from("subscriptions").select("*").eq("business_id", businessId).maybeSingle()) as
        | (Subscription & Record<string, unknown>)
        | null;
      if (!s) throw new Error("Assinatura não encontrada. Rode o supabase/schema.sql atualizado.");
      const status = s.status === "trial" && new Date(s.trial_ends_at) < new Date() ? "pending" : s.status;
      return {
        business_id: s.business_id,
        plan: s.plan,
        status,
        billing_type: s.billing_type,
        trial_ends_at: s.trial_ends_at,
        current_period_end: s.current_period_end,
        invoice_url: s.invoice_url,
      };
    },
    async startCheckout(input) {
      // Edge Function com a chave secreta do Asaas (supabase/functions/criar-assinatura)
      const { data, error } = await sb.functions.invoke("criar-assinatura", { body: input });
      if (error) throw new Error("Não foi possível iniciar o pagamento. Tente novamente ou fale com o suporte.");
      if (data?.error) throw new Error(data.error);
      return { invoice_url: data?.invoice_url ?? null, simulated: false };
    },
  };
}

function friendly(e: PostgrestError) {
  if (e.code === "23505") {
    if (e.message.includes("cpf")) return "Já existe um cadastro com este CPF.";
    if (e.message.includes("clients")) return "Já existe um cadastro com este telefone.";
    if (e.message.includes("slug")) return "Esse endereço já está em uso.";
    return "Registro duplicado.";
  }
  if (e.code === "23503") return "Este item tem agendamentos no histórico. Desative-o em vez de excluir.";
  if (e.code === "23P01") return "O horário já está ocupado por outro agendamento.";
  return e.message;
}

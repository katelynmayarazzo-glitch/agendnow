/**
 * Adaptador LOCAL: guarda tudo no localStorage do navegador.
 * Serve para usar/apresentar o sistema sem servidor.
 * Em produção, configure o Supabase (.env) e o adaptador supabase.ts é usado.
 */
import type { Api, ClientWithStats } from "./types";
import type {
  Appointment,
  AppointmentView,
  Business,
  Client,
  ClinicalNote,
  Member,
  Professional,
  Service,
  Subscription,
  User,
} from "../types";
import { defaultHours } from "../segments";
import { DEFAULT_PAYMENT_METHODS, demoCharge, isOnlineMethod, onlineSetup } from "../payments";
import { TRIAL_DAYS } from "../plans";
import { isValidCpf, onlyDigits, toMin, uid } from "../format";
import type { Role } from "../types";
import { hoursFor } from "../slots";

interface DB {
  users: { id: string; email: string; password: string; name?: string; reset_token?: string }[];
  members: (Omit<Member, "status"> & { accepted_at: string | null })[];
  session: string | null;
  businesses: (Business & { owner_id: string })[];
  services: Service[];
  professionals: Professional[];
  clients: Client[];
  appointments: Appointment[];
  notes: ClinicalNote[];
  subscriptions: Subscription[];
}

const KEY = "agendapro:dados:v1";

/** Banco começa zerado: o dono cria a conta e cadastra tudo. */
function seed(): DB {
  return { users: [], session: null, businesses: [], services: [], professionals: [], clients: [], appointments: [], notes: [], subscriptions: [], members: [] };
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as DB;
      db.notes ??= [];
      db.subscriptions ??= [];
      db.members ??= [];
      db.businesses.forEach((b) => {
        b.insurances ??= [];
        b.accept_private ??= true;
        b.payment_methods ??= [...DEFAULT_PAYMENT_METHODS];
        b.online_payment ??= "off";
        b.pix_key ??= "";
        b.pix_name ??= "";
        b.pix_city ??= "";
        b.gateway ??= "";
      });
      db.clients.forEach((c) => {
        c.cpf ??= "";
        c.insurance ??= "";
        c.insurance_number ??= "";
      });
      db.appointments.forEach((a) => {
        a.insurance ??= "";
        a.payment_method ??= "";
        a.payment_status ??= "";
        a.paid_at ??= null;
        a.payment_info ??= "";
      });
      return db;
    }
  } catch {
    /* ignora e recria */
  }
  const db = seed();
  save(db);
  return db;
}

function save(db: DB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* armazenamento indisponível: segue em memória */
  }
}

/** Executa uma alteração e persiste. */
function tx<T>(fn: (db: DB) => T): T {
  const db = load();
  const r = fn(db);
  save(db);
  return r;
}

export function resetDemo() {
  localStorage.removeItem(KEY);
}

const strip = ({ owner_id: _o, ...b }: Business & { owner_id: string }): Business => b;

function view(db: DB, a: Appointment): AppointmentView {
  const c = db.clients.find((x) => x.id === a.client_id);
  return {
    ...a,
    client_name: c?.name ?? "—",
    client_phone: c?.phone ?? "",
    service_name: db.services.find((x) => x.id === a.service_id)?.name ?? "—",
    professional_name: db.professionals.find((x) => x.id === a.professional_id)?.name ?? "—",
  };
}

function me(db: DB): User {
  const u = db.users.find((x) => x.id === db.session);
  if (!u) throw new Error("Sessão expirada. Entre novamente.");
  return { id: u.id, email: u.email };
}

/** Empresa do usuário logado: a que ele é dono ou da qual faz parte da equipe. */
function myBiz(db: DB) {
  const u = me(db);
  const own = db.businesses.find((b) => b.owner_id === u.id);
  if (own) return own;
  const m = db.members.find((x) => x.user_id === u.id);
  return m ? db.businesses.find((b) => b.id === m.business_id) ?? null : null;
}

function roleOf(db: DB, businessId: string): Role | null {
  if (!db.session) return null;
  const b = db.businesses.find((x) => x.id === businessId);
  if (b?.owner_id === db.session) return "owner";
  return db.members.find((m) => m.business_id === businessId && m.user_id === db.session)?.role ?? null;
}

function requireAdmin(db: DB, businessId: string) {
  const r = roleOf(db, businessId);
  if (r !== "owner" && r !== "admin") throw new Error("Apenas o dono ou administradores podem fazer isso.");
}

const newToken = () => uid().replace(/-/g, "") + uid().replace(/-/g, "").slice(0, 8);

const occupies = (a: Appointment) => a.status !== "cancelled";

export const localApi: Api = {
  mode: "demo",

  async getPublicBusiness(slug) {
    const db = load();
    const b = db.businesses.find((x) => x.slug === slug);
    if (!b) return null;
    return {
      business: strip(b),
      services: db.services.filter((s) => s.business_id === b.id && s.active),
      professionals: db.professionals.filter((p) => p.business_id === b.id && p.active),
    };
  },

  async getBusy(professionalId, from, to) {
    const db = load();
    return db.appointments
      .filter(
        (a) =>
          a.professional_id === professionalId &&
          occupies(a) &&
          new Date(a.starts_at) < to &&
          new Date(a.ends_at) > from,
      )
      .map((a) => ({ starts_at: a.starts_at, ends_at: a.ends_at }));
  },

  async createBooking(input) {
    return tx((db) => {
      const b = db.businesses.find((x) => x.id === input.business_id);
      const sv = db.services.find((x) => x.id === input.service_id && x.business_id === input.business_id);
      const pro = db.professionals.find((x) => x.id === input.professional_id && x.business_id === input.business_id);
      if (!b || !sv || !pro) throw new Error("Dados do agendamento inválidos.");
      if (pro.service_ids.length && !pro.service_ids.includes(sv.id))
        throw new Error("Este profissional não realiza este serviço.");
      const name = input.name.trim();
      const phone = onlyDigits(input.phone);
      if (name.length < 2) throw new Error("Informe seu nome.");
      if (phone.length < 10 || phone.length > 11) throw new Error("Telefone inválido.");
      const cpf = onlyDigits(input.cpf ?? "");
      const insurance = (input.insurance ?? "").trim();
      if (insurance && !b.insurances.includes(insurance)) throw new Error("Convênio não aceito por este estabelecimento.");
      const payment = (input.payment_method ?? "").trim();
      if (payment && !b.payment_methods.includes(payment)) throw new Error("Forma de pagamento não aceita.");
      if (!insurance && b.insurances.length && !b.accept_private && !isOwnerOf(db, b))
        throw new Error("Este estabelecimento atende apenas por convênio.");

      const start = new Date(input.starts_at);
      const end = new Date(start.getTime() + sv.duration * 60000);
      const isOwner = roleOf(db, b.id) !== null; // dono ou equipe logados podem fazer encaixes

      // pagamento online: só particular, com valor, e numa forma que o estabelecimento recebe pelo site
      const setup = onlineSetup(strip(b), true, start);
      const chargeable = !insurance && sv.price > 0 && setup.enabled;
      const online = chargeable && !!input.pay_online && isOnlineMethod(payment) && setup.methods.includes(payment);
      if (input.pay_online && !online) throw new Error("Esta forma de pagamento online não está disponível.");
      if (chargeable && setup.required && !online && !isOwner) throw new Error("Este estabelecimento pede o pagamento antecipado pelo site.");
      if (!isOwner) {
        if (start.getTime() < Date.now() + b.min_notice * 60000) throw new Error("Esse horário não está mais disponível.");
        const h = hoursFor(b, pro, start);
        const sm = start.getHours() * 60 + start.getMinutes();
        if (!h || sm < toMin(h.open) || sm + sv.duration > toMin(h.close))
          throw new Error("Fora do horário de atendimento.");
      }
      const clash = db.appointments.some(
        (a) => a.professional_id === pro.id && occupies(a) && new Date(a.starts_at) < end && new Date(a.ends_at) > start,
      );
      if (clash) throw new Error("Ops! Alguém acabou de reservar esse horário. Escolha outro.");

      // cria ou atualiza o cadastro do cliente (chave: telefone)
      let c = db.clients.find((x) => x.business_id === b.id && x.phone === phone);
      if (!c) {
        c = {
          id: uid(),
          business_id: b.id,
          name,
          phone,
          email: input.email.trim(),
          birth_date: input.birth_date,
          cpf,
          insurance,
          insurance_number: (input.insurance_number ?? "").trim(),
          notes: "",
          created_at: new Date().toISOString(),
        };
        db.clients.push(c);
      } else {
        c.name = name;
        if (input.email.trim()) c.email = input.email.trim();
        if (input.birth_date) c.birth_date = input.birth_date;
        if (cpf) c.cpf = cpf;
        c.insurance = insurance;
        if (input.insurance_number?.trim()) c.insurance_number = input.insurance_number.trim();
      }

      const a: Appointment = {
        id: uid(),
        business_id: b.id,
        client_id: c.id,
        service_id: sv.id,
        professional_id: pro.id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: b.auto_confirm || isOwner ? "confirmed" : "pending",
        price: sv.price,
        insurance,
        payment_method: insurance ? "" : payment,
        payment_status: online ? "pending" : "",
        paid_at: null,
        payment_info: "",
        notes: input.notes.trim(),
        token: uid(),
        created_at: new Date().toISOString(),
      };
      db.appointments.push(a);
      return { token: a.token };
    });
  },

  async getBooking(token) {
    const db = load();
    const a = db.appointments.find((x) => x.token === token);
    if (!a) return null;
    const b = db.businesses.find((x) => x.id === a.business_id)!;
    const v = view(db, a);
    return {
      appointment: a,
      business: strip(b),
      service_name: v.service_name,
      professional_name: v.professional_name,
      client_name: v.client_name,
    };
  },

  async cancelBooking(token) {
    tx((db) => {
      const a = db.appointments.find((x) => x.token === token);
      if (!a) throw new Error("Agendamento não encontrado.");
      if (new Date(a.starts_at) < new Date()) throw new Error("Não é possível cancelar um horário que já passou.");
      if (a.status === "pending" || a.status === "confirmed") a.status = "cancelled";
    });
  },

  async isSlugAvailable(slug) {
    return !load().businesses.some((b) => b.slug === slug);
  },

  /** Modo local: o "processador" é simulado. Nada de cartão é guardado — só bandeira e final. */
  async payBooking(token, req) {
    return tx((db) => {
      const a = db.appointments.find((x) => x.token === token);
      if (!a) throw new Error("Agendamento não encontrado.");
      const b = db.businesses.find((x) => x.id === a.business_id)!;
      if (a.status === "cancelled") throw new Error("Este agendamento foi cancelado.");
      if (a.payment_status === "paid") throw new Error("Este agendamento já está pago.");
      if (a.insurance || a.price <= 0) throw new Error("Este agendamento não tem valor a pagar pelo site.");
      const setup = onlineSetup(strip(b), true, a.starts_at);
      if (!setup.enabled || !setup.methods.includes(req.method)) throw new Error("Forma de pagamento indisponível.");
      if (!isValidCpf(req.cpf)) throw new Error("Informe um CPF válido.");

      const r = demoCharge(req, a.price, {
        key: setup.directPix ? b.pix_key : "demo@agendnow.app",
        name: b.pix_name || b.name,
        city: b.pix_city || "BRASIL",
        txid: "AGD" + a.id.replace(/-/g, "").slice(0, 12),
        manual: setup.directPix,
      });
      a.payment_method = req.method;
      if (r.status === "paid") {
        a.payment_status = "paid";
        a.paid_at = new Date().toISOString();
        a.payment_info = r.info ?? "";
      } else a.payment_status = "pending";
      return r;
    });
  },

  async reportPixPaid(token) {
    tx((db) => {
      const a = db.appointments.find((x) => x.token === token);
      if (!a) throw new Error("Agendamento não encontrado.");
      if (a.payment_status === "pending" && a.payment_method === "pix") a.payment_status = "review";
    });
  },

  async simulatePaid(token) {
    tx((db) => {
      const a = db.appointments.find((x) => x.token === token);
      if (!a) throw new Error("Agendamento não encontrado.");
      if (a.payment_status === "paid") return;
      a.payment_status = "paid";
      a.paid_at = new Date().toISOString();
      a.payment_info = a.payment_method === "boleto" ? "Boleto compensado" : "Pix recebido";
    });
  },

  async getUser() {
    const db = load();
    const u = db.users.find((x) => x.id === db.session);
    return u ? { id: u.id, email: u.email } : null;
  },

  async signIn(email, password) {
    return tx((db) => {
      const pending = db.users.find((x) => x.email === email.trim().toLowerCase() && !x.password);
      if (pending) throw new Error("Você ainda não criou sua senha. Use o link enviado para o seu e-mail.");
      const u = db.users.find((x) => x.email === email.trim().toLowerCase() && x.password === password);
      if (!u) throw new Error("E-mail ou senha incorretos.");
      db.session = u.id;
      return { id: u.id, email: u.email };
    });
  },

  async signUp(email, password) {
    return tx((db) => {
      const e = email.trim().toLowerCase();
      if (db.users.some((x) => x.email === e)) throw new Error("Já existe uma conta com este e-mail.");
      if (password.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
      const u = { id: uid(), email: e, password };
      db.users.push(u);
      db.session = u.id;
      return { id: u.id, email: u.email };
    });
  },

  async signOut() {
    tx((db) => {
      db.session = null;
    });
  },

  async requestPasswordReset(email) {
    return tx((db) => {
      const u = db.users.find((x) => x.email === email.trim().toLowerCase());
      if (!u) return {}; // não revela se o e-mail existe
      u.reset_token = newToken();
      return { token: u.reset_token };
    });
  },

  async checkPasswordLink(token) {
    const u = token ? load().users.find((x) => x.reset_token === token) : undefined;
    return u ? { ok: true, email: u.email, name: u.name } : { ok: false };
  },

  async setPasswordFromLink(token, password) {
    if (password.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
    return tx((db) => {
      const u = token ? db.users.find((x) => x.reset_token === token) : undefined;
      if (!u) throw new Error("Link inválido ou expirado. Peça um novo.");
      u.password = password;
      delete u.reset_token;
      db.session = u.id;
      db.members.filter((m) => m.user_id === u.id && !m.accepted_at).forEach((m) => (m.accepted_at = new Date().toISOString()));
      return { id: u.id, email: u.email };
    });
  },

  async getMyRole(businessId) {
    const r = roleOf(load(), businessId);
    if (!r) throw new Error("Sem acesso a esta empresa.");
    return r;
  },

  async listMembers(businessId) {
    const db = load();
    return db.members
      .filter((m) => m.business_id === businessId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(({ accepted_at, ...m }) => ({ ...m, status: accepted_at ? "active" : "pending" }) as Member);
  },

  async inviteMember({ business_id, name, email, role }) {
    return tx((db) => {
      requireAdmin(db, business_id);
      const e = email.trim().toLowerCase();
      if (name.trim().split(/\s+/).length < 2) throw new Error("Informe nome e sobrenome.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("E-mail inválido.");
      if (db.users.some((u) => u.email === e)) throw new Error("Este e-mail já tem acesso ao AgendNow.");
      const token = newToken();
      const u = { id: uid(), email: e, password: "", name: name.trim(), reset_token: token };
      db.users.push(u);
      db.members.push({ id: uid(), business_id, user_id: u.id, name: name.trim(), email: e, role, accepted_at: null, created_at: new Date().toISOString() });
      return { token };
    });
  },

  async updateMemberRole(id, role) {
    tx((db) => {
      const m = db.members.find((x) => x.id === id);
      if (!m) throw new Error("Usuário não encontrado.");
      requireAdmin(db, m.business_id);
      if (m.user_id === db.session) throw new Error("Você não pode mudar a sua própria permissão.");
      m.role = role;
    });
  },

  async removeMember(id) {
    tx((db) => {
      const m = db.members.find((x) => x.id === id);
      if (!m) return;
      requireAdmin(db, m.business_id);
      if (m.user_id === db.session) throw new Error("Você não pode remover o seu próprio acesso.");
      db.members = db.members.filter((x) => x.id !== id);
      db.users = db.users.filter((u) => u.id !== m.user_id); // acesso apagado
    });
  },

  async getMyBusiness() {
    const db = load();
    if (!db.session) return null;
    const b = myBiz(db);
    return b ? strip(b) : null;
  },

  async createBusiness(input) {
    return tx((db) => {
      const u = me(db);
      if (db.businesses.some((b) => b.slug === input.slug)) throw new Error("Esse endereço já está em uso.");
      const b = {
        id: uid(),
        owner_id: u.id,
        slug: input.slug,
        name: input.name.trim(),
        segment: input.segment,
        phone: onlyDigits(input.phone),
        address: "",
        about: "",
        color: "#2563eb",
        hours: defaultHours(),
        slot_interval: 30,
        min_notice: 60,
        max_days_ahead: 30,
        auto_confirm: false,
        insurances: [],
        accept_private: true,
        payment_methods: [...DEFAULT_PAYMENT_METHODS],
        online_payment: "off" as const,
        pix_key: "",
        pix_name: "",
        pix_city: "",
        gateway: "",
      };
      db.businesses.push(b);
      db.subscriptions.push(newTrial(b.id, input.segment === "clinica" ? "clinica" : "profissional"));
      return strip(b);
    });
  },

  async updateBusiness(nb) {
    tx((db) => {
      const b = myBiz(db);
      if (!b || b.id !== nb.id) throw new Error("Sem permissão.");
      requireAdmin(db, b.id);
      if (nb.slug !== b.slug && db.businesses.some((x) => x.slug === nb.slug))
        throw new Error("Esse endereço já está em uso.");
      Object.assign(b, nb);
    });
  },

  async listServices(businessId) {
    return load().services.filter((s) => s.business_id === businessId);
  },
  async saveService(s) {
    return tx((db) => {
      const sv = { ...s, id: s.id || uid() };
      const i = db.services.findIndex((x) => x.id === sv.id);
      if (i >= 0) db.services[i] = sv;
      else db.services.push(sv);
      return sv;
    });
  },
  async deleteService(id) {
    tx((db) => {
      if (db.appointments.some((a) => a.service_id === id))
        throw new Error("Este serviço tem agendamentos no histórico. Desative-o em vez de excluir.");
      db.services = db.services.filter((x) => x.id !== id);
      db.professionals.forEach((p) => (p.service_ids = p.service_ids.filter((x) => x !== id)));
    });
  },

  async listProfessionals(businessId) {
    return load().professionals.filter((p) => p.business_id === businessId);
  },
  async saveProfessional(p) {
    return tx((db) => {
      const pr = { ...p, id: p.id || uid() };
      const i = db.professionals.findIndex((x) => x.id === pr.id);
      if (i >= 0) db.professionals[i] = pr;
      else db.professionals.push(pr);
      return pr;
    });
  },
  async deleteProfessional(id) {
    tx((db) => {
      if (db.appointments.some((a) => a.professional_id === id))
        throw new Error("Este profissional tem agendamentos no histórico. Desative-o em vez de excluir.");
      db.professionals = db.professionals.filter((x) => x.id !== id);
    });
  },

  async listAppointments(businessId, from, to) {
    const db = load();
    return db.appointments
      .filter((a) => a.business_id === businessId && new Date(a.starts_at) >= from && new Date(a.starts_at) < to)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map((a) => view(db, a));
  },
  async setAppointmentStatus(id, status, payment_method) {
    tx((db) => {
      const a = db.appointments.find((x) => x.id === id);
      if (!a) throw new Error("Agendamento não encontrado.");
      if (a.status === "cancelled" && status !== "cancelled") {
        const s = new Date(a.starts_at), e = new Date(a.ends_at);
        const clash = db.appointments.some(
          (x) => x.id !== a.id && x.professional_id === a.professional_id && occupies(x) && new Date(x.starts_at) < e && new Date(x.ends_at) > s,
        );
        if (clash) throw new Error("O horário já foi ocupado por outro agendamento.");
      }
      a.status = status;
      if (payment_method !== undefined) a.payment_method = payment_method;
    });
  },

  async setPaymentStatus(id, status) {
    tx((db) => {
      const a = db.appointments.find((x) => x.id === id);
      if (!a) throw new Error("Agendamento não encontrado.");
      if (!roleOf(db, a.business_id)) throw new Error("Sem permissão.");
      a.payment_status = status;
      a.paid_at = status === "paid" ? new Date().toISOString() : null;
      if (status === "paid" && !a.payment_info) a.payment_info = a.payment_method === "pix" ? "Pix conferido pelo estabelecimento" : "Pagamento confirmado";
      if (status !== "paid") a.payment_info = "";
    });
  },

  /** Modo local: só marca como conectado (simulação). */
  async connectGateway(businessId, apiKey) {
    if (apiKey.trim().length < 10) throw new Error("Cole a chave de API do Asaas.");
    tx((db) => {
      requireAdmin(db, businessId);
      db.businesses.find((b) => b.id === businessId)!.gateway = "asaas";
    });
  },
  async disconnectGateway(businessId) {
    tx((db) => {
      requireAdmin(db, businessId);
      db.businesses.find((b) => b.id === businessId)!.gateway = "";
    });
  },

  async listClients(businessId) {
    const db = load();
    const now = new Date();
    return db.clients
      .filter((c) => c.business_id === businessId)
      .map((c): ClientWithStats => {
        const aps = db.appointments.filter((a) => a.client_id === c.id);
        const done = aps.filter((a) => a.status === "done");
        const past = aps.filter((a) => a.status === "done").map((a) => a.starts_at).sort();
        const future = aps
          .filter((a) => (a.status === "pending" || a.status === "confirmed") && new Date(a.starts_at) > now)
          .map((a) => a.starts_at)
          .sort();
        return {
          ...c,
          visits: done.length,
          total_spent: done.reduce((t, a) => t + a.price, 0),
          last_visit: past[past.length - 1] ?? null,
          next_visit: future[0] ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async clientHistory(clientId) {
    const db = load();
    return db.appointments
      .filter((a) => a.client_id === clientId)
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
      .map((a) => view(db, a));
  },
  async saveClient(c) {
    return tx((db) => {
      const phone = onlyDigits(c.phone);
      const cpf = onlyDigits(c.cpf);
      if (cpf) {
        const dupCpf = db.clients.find((x) => x.business_id === c.business_id && x.cpf === cpf && x.id !== c.id);
        if (dupCpf) throw new Error(`Já existe um cadastro com este CPF (${dupCpf.name}).`);
      }
      const dup = db.clients.find((x) => x.business_id === c.business_id && x.phone === phone && x.id !== c.id);
      if (dup) throw new Error(`Já existe um cadastro com este telefone (${dup.name}).`);
      const nc = { ...c, phone, cpf, id: c.id || uid(), created_at: c.created_at || new Date().toISOString() };
      const i = db.clients.findIndex((x) => x.id === nc.id);
      if (i >= 0) db.clients[i] = nc;
      else db.clients.push(nc);
      return nc;
    });
  },
  async deleteClient(id) {
    tx((db) => {
      db.clients = db.clients.filter((x) => x.id !== id);
      db.appointments = db.appointments.filter((a) => a.client_id !== id);
      db.notes = db.notes.filter((n) => n.client_id !== id);
    });
  },

  async listNotes(clientId) {
    return load()
      .notes.filter((n) => n.client_id === clientId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async addNote(n) {
    return tx((db) => {
      const b = myBiz(db);
      if (!b || b.id !== n.business_id) throw new Error("Sem permissão.");
      if (!n.text.trim()) throw new Error("Escreva a anotação.");
      const note: ClinicalNote = { ...n, text: n.text.trim(), id: uid(), created_at: new Date().toISOString() };
      db.notes.push(note);
      return note;
    });
  },
  async deleteNote(id) {
    tx((db) => {
      db.notes = db.notes.filter((n) => n.id !== id);
    });
  },

  async getSubscription(businessId) {
    return tx((db) => {
      let sub = db.subscriptions.find((x) => x.business_id === businessId);
      if (!sub) {
        sub = newTrial(businessId, "profissional");
        db.subscriptions.push(sub);
      }
      // teste grátis vencido sem pagamento → fica "pendente"
      if (sub.status === "trial" && new Date(sub.trial_ends_at) < new Date()) sub.status = "pending";
      return { ...sub };
    });
  },

  /** Modo local: SIMULA a aprovação (não cobra nada). Com Supabase + Asaas a cobrança é real. */
  async startCheckout({ business_id, plan, billing_type, cpf_cnpj }) {
    if (![11, 14].includes(onlyDigits(cpf_cnpj).length)) throw new Error("Informe um CPF ou CNPJ válido.");
    tx((db) => {
      const b = myBiz(db);
      if (!b || b.id !== business_id) throw new Error("Sem permissão.");
      requireAdmin(db, business_id);
      let sub = db.subscriptions.find((x) => x.business_id === business_id);
      if (!sub) {
        sub = newTrial(business_id, plan);
        db.subscriptions.push(sub);
      }
      sub.plan = plan;
      sub.billing_type = billing_type;
      sub.status = "active";
      sub.current_period_end = new Date(Date.now() + 30 * 86400000).toISOString();
      sub.invoice_url = null;
    });
    return { invoice_url: null, simulated: true };
  },
};

function newTrial(business_id: string, plan: string): Subscription {
  return {
    business_id,
    plan,
    status: "trial",
    billing_type: "",
    trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString(),
    current_period_end: null,
    invoice_url: null,
  };
}

function isOwnerOf(db: DB, b: Business & { owner_id: string }) {
  return roleOf(db, b.id) !== null; // dono ou equipe podem fazer encaixes
}

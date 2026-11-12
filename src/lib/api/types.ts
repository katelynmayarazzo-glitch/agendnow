import type {
  AppointmentView,
  BookingInput,
  BookingPublicView,
  Business,
  Client,
  ClinicalNote,
  NewBusinessInput,
  Professional,
  PublicBusiness,
  Service,
  Member,
  Role,
  Status,
  Subscription,
  User,
} from "../types";
import type { Busy } from "../slots";
import type { PayRequest, PayResult, PaymentStatus } from "../payments";

export interface ClientWithStats extends Client {
  visits: number;
  total_spent: number;
  last_visit: string | null;
  next_visit: string | null;
}

/** Contrato único da camada de dados. Existem duas implementações: local (demo) e Supabase. */
export interface Api {
  mode: "demo" | "supabase";

  // ---------- Público (sem login) ----------
  getPublicBusiness(slug: string): Promise<PublicBusiness | null>;
  getBusy(professionalId: string, from: Date, to: Date): Promise<Busy[]>;
  createBooking(input: BookingInput): Promise<{ token: string }>;
  getBooking(token: string): Promise<BookingPublicView | null>;
  cancelBooking(token: string): Promise<void>;
  isSlugAvailable(slug: string): Promise<boolean>;

  // ---------- Pagamento online do agendamento (cliente final) ----------
  /** Inicia/efetua o pagamento: cartão aprova na hora; Pix e boleto ficam aguardando. */
  payBooking(token: string, req: PayRequest): Promise<PayResult>;
  /** Pix direto na chave do estabelecimento: o cliente avisa que pagou (o dono confere). */
  reportPixPaid(token: string): Promise<void>;
  /** Só no modo local: simula a confirmação do banco (Pix/boleto). */
  simulatePaid?(token: string): Promise<void>;

  // ---------- Autenticação ----------
  getUser(): Promise<User | null>;
  signIn(email: string, password: string): Promise<User>;
  signUp(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  /** Envia o link de redefinir senha. No modo local devolve o token para montar o link. */
  requestPasswordReset(email: string): Promise<{ token?: string }>;
  /** Há um link válido aberto (convite/redefinição)? */
  checkPasswordLink(token: string | null): Promise<{ ok: boolean; email?: string; name?: string }>;
  /** Define a senha pelo link recebido e já entra no sistema. */
  setPasswordFromLink(token: string | null, password: string): Promise<User>;

  // ---------- Painel ----------
  getMyBusiness(): Promise<Business | null>;
  createBusiness(input: NewBusinessInput): Promise<Business>;
  updateBusiness(b: Business): Promise<void>;

  listServices(businessId: string): Promise<Service[]>;
  saveService(s: Service): Promise<Service>;
  deleteService(id: string): Promise<void>;

  listProfessionals(businessId: string): Promise<Professional[]>;
  saveProfessional(p: Professional): Promise<Professional>;
  deleteProfessional(id: string): Promise<void>;

  listAppointments(businessId: string, from: Date, to: Date): Promise<AppointmentView[]>;
  /** payment_method: informe ao marcar como atendido ("" limpa). */
  setAppointmentStatus(id: string, status: Status, payment_method?: string): Promise<void>;
  /** Dono confirma (paid) ou recusa (pending) um Pix direto informado pelo cliente. */
  setPaymentStatus(id: string, status: PaymentStatus): Promise<void>;
  /** Conecta a conta Asaas do estabelecimento (cartão, boleto e Pix automático). */
  connectGateway(businessId: string, apiKey: string): Promise<void>;
  disconnectGateway(businessId: string): Promise<void>;

  listClients(businessId: string): Promise<ClientWithStats[]>;
  clientHistory(clientId: string): Promise<AppointmentView[]>;
  saveClient(c: Client): Promise<Client>;
  deleteClient(id: string): Promise<void>;

  // ---------- Prontuário (clínicas) ----------
  listNotes(clientId: string): Promise<ClinicalNote[]>;
  addNote(n: Omit<ClinicalNote, "id" | "created_at">): Promise<ClinicalNote>;
  deleteNote(id: string): Promise<void>;

  // ---------- Usuários (equipe com acesso ao painel) ----------
  getMyRole(businessId: string): Promise<Role>;
  listMembers(businessId: string): Promise<Member[]>;
  /** Cria o acesso e envia o e-mail com o link para definir a senha. Modo local devolve o token. */
  inviteMember(input: { business_id: string; name: string; email: string; role: "admin" | "equipe" }): Promise<{ token?: string }>;
  updateMemberRole(id: string, role: "admin" | "equipe"): Promise<void>;
  removeMember(id: string): Promise<void>;

  // ---------- Assinatura do AgendNow ----------
  getSubscription(businessId: string): Promise<Subscription>;
  /** Cria/atualiza a assinatura no Asaas e devolve o link da fatura (ou simula no modo local). */
  startCheckout(input: { business_id: string; plan: string; billing_type: string; cpf_cnpj: string }): Promise<{ invoice_url: string | null; simulated: boolean }>;
}

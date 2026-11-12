import type { PaymentStatus } from "./payments";
export type Segment = "barbearia" | "salao" | "clinica" | "estetica";

/** Horário de funcionamento por dia da semana (0 = domingo). null = fechado. */
export type WeekHours = Record<number, { open: string; close: string } | null>;

export interface Business {
  id: string;
  slug: string;
  name: string;
  segment: Segment;
  phone: string;
  address: string;
  about: string;
  color: string;
  hours: WeekHours;
  slot_interval: number; // minutos entre os horários oferecidos
  min_notice: number; // antecedência mínima em minutos
  max_days_ahead: number; // até quantos dias à frente aceita agendar
  auto_confirm: boolean; // se true, agendamentos entram como confirmados
  insurances: string[]; // clínicas: convênios aceitos (ex.: "Unimed")
  accept_private: boolean; // clínicas: aceita atendimento particular
  payment_methods: string[]; // formas de pagamento aceitas (ver lib/payments.ts)
  /** Pagamento online pelo site: off = só no local · optional = cliente escolhe · required = antecipado obrigatório */
  online_payment: OnlinePaymentMode;
  pix_key: string; // chave Pix do estabelecimento (Pix direto, sem taxa, conferência manual)
  pix_name: string; // nome do recebedor que aparece no app do banco
  pix_city: string;
  /** Processador conectado ("asaas") para cartão, boleto e Pix com baixa automática. Só o servidor muda. */
  gateway: string;
}

export type OnlinePaymentMode = "off" | "optional" | "required";

export interface Service {
  id: string;
  business_id: string;
  name: string;
  description: string;
  duration: number; // minutos
  price: number; // centavos
  active: boolean;
}

export interface Professional {
  id: string;
  business_id: string;
  name: string;
  role: string;
  service_ids: string[];
  hours: WeekHours | null; // null = usa o horário do estabelecimento
  active: boolean;
}

export interface Client {
  id: string;
  business_id: string;
  name: string;
  phone: string; // apenas dígitos
  email: string;
  birth_date: string | null; // YYYY-MM-DD
  cpf: string; // apenas dígitos ("" se não informado)
  insurance: string; // convênio do paciente ("" = particular)
  insurance_number: string; // nº da carteirinha
  notes: string;
  created_at: string;
}

/** Anotação de atendimento (prontuário) — só clínicas. */
export interface ClinicalNote {
  id: string;
  business_id: string;
  client_id: string;
  professional_id: string | null;
  text: string;
  created_at: string;
}

export type Status = "pending" | "confirmed" | "done" | "cancelled" | "no_show";

export interface Appointment {
  id: string;
  business_id: string;
  client_id: string;
  service_id: string;
  professional_id: string;
  starts_at: string; // ISO
  ends_at: string; // ISO
  status: Status;
  price: number; // centavos, congelado no momento do agendamento
  insurance: string; // "" = particular; senão, nome do convênio
  payment_method: string; // como pagou (ou pretende pagar); "" = não informado
  /** Pagamento online: "" = paga no local · pending = aguardando · review = Pix informado, conferir · paid = pago */
  payment_status: PaymentStatus;
  paid_at: string | null;
  payment_info: string; // ex.: "Visa crédito final 4242 em 2x"
  notes: string;
  token: string; // usado pelo cliente para consultar/cancelar
  created_at: string;
}

/** Visão completa (com nomes) usada no painel e na página do cliente. */
export interface AppointmentView extends Appointment {
  client_name: string;
  client_phone: string;
  service_name: string;
  professional_name: string;
}

export interface PublicBusiness {
  business: Business;
  services: Service[];
  professionals: Professional[];
}

export interface BookingInput {
  business_id: string;
  service_id: string;
  professional_id: string;
  starts_at: string;
  name: string;
  phone: string;
  email: string;
  birth_date: string | null;
  cpf: string;
  insurance: string;
  insurance_number: string;
  payment_method: string;
  /** true = cliente vai pagar pelo site (Pix/cartão/boleto) logo após agendar */
  pay_online?: boolean;
  notes: string;
}

export interface BookingPublicView {
  appointment: Appointment;
  business: Business;
  service_name: string;
  professional_name: string;
  client_name: string;
}

export interface User {
  id: string;
  email: string;
}

export interface NewBusinessInput {
  name: string;
  slug: string;
  segment: Segment;
  phone: string;
}

/** Assinatura do AgendNow (o dono do negócio pagando a plataforma). */
export type SubscriptionStatus = "trial" | "pending" | "active" | "overdue" | "canceled";
export interface Subscription {
  business_id: string;
  plan: string; // PlanId
  status: SubscriptionStatus;
  billing_type: string; // CREDIT_CARD | PIX | BOLETO | ""
  trial_ends_at: string;
  current_period_end: string | null;
  invoice_url: string | null; // link da fatura no Asaas
}

/** Permissão de quem acessa o painel. */
export type Role = "owner" | "admin" | "equipe";
export interface Member {
  id: string;
  business_id: string;
  user_id: string;
  name: string;
  email: string;
  role: "admin" | "equipe";
  status: "pending" | "active"; // pending = ainda não criou a senha
  created_at: string;
}

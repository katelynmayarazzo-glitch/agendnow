/** Planos de assinatura do AgendNow (o que o dono do negócio paga). Ajuste preços aqui. */
export type PlanId = "essencial" | "profissional" | "clinica";

export const PLANS: { id: PlanId; name: string; price: number; desc: string; features: string[]; hot?: boolean }[] = [
  { id: "essencial", name: "Essencial", price: 4990, desc: "Para quem atende sozinho", features: ["1 profissional", "Agendamentos ilimitados", "Cadastro de clientes", "Link personalizado"] },
  { id: "profissional", name: "Profissional", price: 8990, desc: "Para equipes", features: ["Até 6 profissionais", "Tudo do Essencial", "Relatórios do negócio", "Horário individual por profissional"], hot: true },
  { id: "clinica", name: "Clínica", price: 14990, desc: "Para clínicas e redes", features: ["Profissionais ilimitados", "Ficha do paciente com CPF e convênio", "Prontuário de atendimento", "Convênios e particular", "Suporte prioritário"] },
];

export const TRIAL_DAYS = 14;
export const planById = (id: string) => PLANS.find((p) => p.id === id) ?? PLANS[0];

/** Formas de pagamento da ASSINATURA (via Asaas). */
export const BILLING_TYPES = [
  { id: "CREDIT_CARD", label: "Cartão de crédito", icon: "", hint: "Cobrança automática todo mês. Você digita o cartão na página segura do Asaas." },
  { id: "PIX", label: "Pix", icon: "", hint: "Todo mês geramos um Pix (QR Code ou copia e cola). Liberação na hora." },
  { id: "BOLETO", label: "Boleto", icon: "", hint: "Todo mês geramos um boleto. Compensação em até 3 dias úteis." },
] as const;
export type BillingType = (typeof BILLING_TYPES)[number]["id"];

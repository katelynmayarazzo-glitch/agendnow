import { onlyDigits } from "./format";
import type { Business } from "./types";

/** Formas de pagamento que o NEGÓCIO aceita do cliente final. */
export const PAYMENT_METHODS = [
  { id: "pix", label: "Pix", short: "Pix", icon: "" },
  { id: "credito", label: "Cartão de crédito", short: "Crédito", icon: "" },
  { id: "debito", label: "Cartão de débito", short: "Débito", icon: "" },
  { id: "dinheiro", label: "Dinheiro", short: "Dinheiro", icon: "" },
  { id: "boleto", label: "Boleto", short: "Boleto", icon: "" },
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];
export const DEFAULT_PAYMENT_METHODS: string[] = ["pix", "credito", "debito", "dinheiro"];

export const paymentLabel = (id: string) => PAYMENT_METHODS.find((m) => m.id === id)?.label ?? id;
export const paymentShort = (id: string) => PAYMENT_METHODS.find((m) => m.id === id)?.short ?? id;
export const paymentIcon = (id: string) => PAYMENT_METHODS.find((m) => m.id === id)?.icon ?? "";

// ================================================================ pagamento online
/** Formas que podem ser pagas pelo site (dinheiro só no local). */
export const ONLINE_METHODS = ["pix", "credito", "debito", "boleto"] as const;
export type OnlineMethod = (typeof ONLINE_METHODS)[number];
export const isOnlineMethod = (id: string): id is OnlineMethod => (ONLINE_METHODS as readonly string[]).includes(id);

/** Situação do pagamento online de um agendamento. */
export type PaymentStatus = "" | "pending" | "review" | "paid";
export const PAYMENT_STATUS_LABEL: Record<Exclude<PaymentStatus, "">, string> = {
  pending: "Aguardando pagamento",
  review: "Pix informado · conferir",
  paid: "Pago online",
};

/** Dados digitados do cartão (só trafegam até o processador, nunca são salvos). */
export interface CardInput {
  number: string;
  holder: string;
  expiry: string; // MM/AA
  cvv: string;
  postal_code: string;
  address_number: string;
}
/** Cartão vinculado ao aparelho: só bandeira, 4 últimos dígitos e o token do processador. */
export interface SavedCard {
  kind: "credito" | "debito";
  brand: string;
  last4: string;
  holder: string;
  token?: string;
}
export interface PayRequest {
  method: OnlineMethod;
  cpf: string;
  email: string;
  installments: number;
  card?: CardInput;
  saved?: SavedCard & { cvv: string };
  save_card?: boolean;
}
export interface PayResult {
  /** paid = aprovado na hora · waiting = aguardando (Pix/boleto) · redirect = abrir página do processador */
  status: "paid" | "waiting" | "redirect";
  info?: string;
  pix?: { payload: string; image?: string };
  boleto?: { line: string; barcode: string; due: string; pdf_url?: string };
  invoice_url?: string;
  /** Pix direto na chave do estabelecimento: o cliente avisa "já paguei" e o dono confere. */
  manual?: boolean;
  saved_card?: SavedCard;
}

// ---------------------------------------------------------------- cartão
export type CardBrand = "visa" | "mastercard" | "amex" | "elo" | "hipercard" | "diners" | "outro";
export const BRAND_LABEL: Record<CardBrand, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  elo: "Elo",
  hipercard: "Hipercard",
  diners: "Diners",
  outro: "Cartão",
};

const ELO_PREFIXES = ["401178", "401179", "431274", "438935", "451416", "457393", "457631", "457632", "504175", "627780", "636297", "636368"];

export function cardBrand(number: string): CardBrand {
  const d = onlyDigits(number);
  if (/^(606282|3841)/.test(d)) return "hipercard";
  if (ELO_PREFIXES.some((p) => d.startsWith(p)) || /^(5067|4576|4011|5090|6500|6504|6505|6516)/.test(d)) return "elo";
  if (/^3[47]/.test(d)) return "amex";
  if (/^3(0[0-5]|[68])/.test(d)) return "diners";
  if (/^4/.test(d)) return "visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]|7[01]|720))/.test(d)) return "mastercard";
  return "outro";
}

export function maskCardNumber(v: string) {
  const d = onlyDigits(v).slice(0, 19);
  if (/^3[47]/.test(d)) return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(" "); // Amex 4-6-5
  return (d.match(/.{1,4}/g) ?? []).join(" ");
}

export function maskExpiry(v: string) {
  const d = onlyDigits(v).slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
}

export const maskCvv = (v: string) => onlyDigits(v).slice(0, 4);

export function luhn(number: string) {
  const d = onlyDigits(number);
  if (d.length < 13) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export function validExpiry(v: string, now = new Date()) {
  const m = /^(\d{2})\/(\d{2})$/.exec(v);
  if (!m) return false;
  const mo = Number(m[1]);
  const yr = 2000 + Number(m[2]);
  if (mo < 1 || mo > 12) return false;
  // vale até o último dia do mês de validade
  return new Date(yr, mo, 1).getTime() > now.getTime() && yr <= now.getFullYear() + 20;
}

export const validCvv = (v: string, brand: CardBrand) => onlyDigits(v).length === (brand === "amex" ? 4 : 3);

export function maskCep(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Parcelas (sem juros) por valor: mínimo de R$ 5 por parcela, até 6x. */
export function installmentOptions(cents: number, max = 6) {
  const n = Math.max(1, Math.min(max, Math.floor(cents / 500)));
  return Array.from({ length: n }, (_, i) => i + 1);
}

// ------------------------------------------------------------------- Pix
function crc16(s: string) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
const tlv = (id: string, v: string) => `${id}${String(v.length).padStart(2, "0")}${v}`;
const ascii = (s: string, max: number) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .slice(0, max) || "NA";

/** Normaliza a chave Pix: telefone vira +55…, CPF/CNPJ só dígitos, e-mail/aleatória como estão. */
export function normalizePixKey(raw: string) {
  const k = raw.trim();
  if (!k) return "";
  if (k.includes("@")) return k.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return k.toLowerCase();
  const d = onlyDigits(k);
  if (k.startsWith("+")) return `+${d}`;
  if (/[()\s-]/.test(k) && (d.length === 10 || d.length === 11)) return `+55${d}`; // (11) 99999-9999
  return d;
}

/** "Pix copia e cola" no padrão BR Code do Banco Central (valor em centavos). */
export function pixPayload(o: { key: string; cents: number; name: string; city: string; txid: string }) {
  const account = tlv("00", "br.gov.bcb.pix") + tlv("01", normalizePixKey(o.key));
  const body =
    tlv("00", "01") +
    tlv("26", account) +
    tlv("52", "0000") +
    tlv("53", "986") +
    (o.cents > 0 ? tlv("54", (o.cents / 100).toFixed(2)) : "") +
    tlv("58", "BR") +
    tlv("59", ascii(o.name, 25)) +
    tlv("60", ascii(o.city, 15)) +
    tlv("62", tlv("05", o.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***")) +
    "6304";
  return body + crc16(body);
}

// ---------------------------------------------------------------- boleto
const mod10 = (s: string) => {
  let sum = 0;
  let w = 2;
  for (let i = s.length - 1; i >= 0; i--) {
    let n = Number(s[i]) * w;
    if (n > 9) n = Math.floor(n / 10) + (n % 10);
    sum += n;
    w = w === 2 ? 1 : 2;
  }
  return String((10 - (sum % 10)) % 10);
};
const mod11 = (s: string) => {
  let sum = 0;
  let w = 2;
  for (let i = s.length - 1; i >= 0; i--) {
    sum += Number(s[i]) * w;
    w = w === 9 ? 2 : w + 1;
  }
  const dv = 11 - (sum % 11);
  return dv === 0 || dv === 10 || dv === 11 ? "1" : String(dv);
};

/** Fator de vencimento do boleto (dias desde 07/10/1997; reinicia em 1000 após 21/02/2025). */
function dueFactor(due: Date) {
  const base = Date.UTC(1997, 9, 7);
  let days = Math.floor((Date.UTC(due.getFullYear(), due.getMonth(), due.getDate()) - base) / 86400000);
  while (days > 9999) days -= 9000;
  return String(days).padStart(4, "0");
}

/**
 * Boleto de DEMONSTRAÇÃO (banco 000 — não existe, não pode ser pago).
 * Em produção quem emite é o gateway (Asaas).
 */
export function demoBoleto(o: { cents: number; due: Date; seed: string }) {
  const free = (onlyDigits(o.seed) + "0".repeat(25)).slice(0, 25);
  const value = String(o.cents).padStart(10, "0").slice(-10);
  const pre = `0009${dueFactor(o.due)}${value}${free}`; // sem o DV geral
  const bar = pre.slice(0, 4) + mod11(pre) + pre.slice(4); // 44 dígitos
  const c1 = bar.slice(0, 4) + bar.slice(19, 24);
  const c2 = bar.slice(24, 34);
  const c3 = bar.slice(34, 44);
  const line =
    `${c1.slice(0, 5)}.${c1.slice(5)}${mod10(c1)} ` +
    `${c2.slice(0, 5)}.${c2.slice(5)}${mod10(c2)} ` +
    `${c3.slice(0, 5)}.${c3.slice(5)}${mod10(c3)} ` +
    `${bar[4]} ${bar.slice(5, 19)}`;
  return { line, barcode: bar };
}

const ITF: Record<string, string> = {
  "0": "nnwwn", "1": "wnnnw", "2": "nwnnw", "3": "wwnnn", "4": "nnwnw",
  "5": "wnwnn", "6": "nwwnn", "7": "nnnww", "8": "wnnwn", "9": "nwnwn",
};

/** Barras do código ITF-25 (padrão dos boletos). Cada item: largura em módulos e se é barra preta. */
export function itfBars(digits: string) {
  const out: { w: number; bar: boolean }[] = [];
  const add = (p: string, bar: boolean) => out.push({ w: p === "w" ? 3 : 1, bar });
  "nnnn".split("").forEach((p, i) => add(p, i % 2 === 0));
  for (let i = 0; i + 1 < digits.length; i += 2) {
    const a = ITF[digits[i]];
    const b = ITF[digits[i + 1]];
    for (let k = 0; k < 5; k++) {
      add(a[k], true);
      add(b[k], false);
    }
  }
  "wnn".split("").forEach((p, i) => add(p, i % 2 === 0));
  return out;
}

/** Texto curto do pagamento aprovado (ex.: "Visa crédito final 4242 em 2x"). */
export function cardInfo(brand: string, kind: "credito" | "debito", last4: string, installments = 1) {
  return `${brand} ${kind === "credito" ? "crédito" : "débito"} final ${last4}${installments > 1 ? ` em ${installments}x` : ""}`;
}

// ---------------------------------------------------------------- regras do estabelecimento
/**
 * O que o estabelecimento oferece para pagar pelo site.
 * - Cartão e boleto exigem processador conectado (Asaas). No modo local tudo é simulado.
 * - Pix: pelo processador (baixa automática) ou direto na chave do estabelecimento (sem taxa, conferência manual).
 * - Boleto só aparece se o horário estiver a mais de 3 dias (prazo de compensação).
 */
export function onlineSetup(b: Business, demo: boolean, startsAt?: string | Date) {
  const gateway = demo || b.gateway === "asaas";
  const directPix = !!normalizePixKey(b.pix_key ?? "") && b.gateway !== "asaas";
  const farEnough = !startsAt || new Date(startsAt).getTime() > Date.now() + 3 * 86400000;
  const methods = ONLINE_METHODS.filter(
    (m) => b.payment_methods.includes(m) && (m === "pix" ? gateway || directPix : gateway) && (m !== "boleto" || farEnough),
  );
  const mode = b.online_payment ?? "off";
  return { enabled: mode !== "off" && methods.length > 0, required: mode === "required" && methods.length > 0, methods, directPix, gateway };
}

/**
 * "Processador" SIMULADO (modo local e demonstrações): valida como um gateway faria e devolve
 * o resultado. Cartão terminado em 0002 é recusado. Nada é guardado além de bandeira e final.
 */
export function demoCharge(req: PayRequest, cents: number, pix: { key: string; name: string; city: string; txid: string; manual?: boolean }): PayResult {
  if (onlyDigits(req.cpf).length !== 11) throw new Error("Informe um CPF válido.");
  if (req.method === "pix") {
    return { status: "waiting", manual: !!pix.manual, pix: { payload: pixPayload({ ...pix, cents }) } };
  }
  if (req.method === "boleto") {
    const due = new Date(Date.now() + 3 * 86400000);
    const b = demoBoleto({ cents, due, seed: String(Date.now()) });
    return { status: "waiting", boleto: { line: b.line, barcode: b.barcode, due: due.toISOString() } };
  }
  const kind = req.method;
  let brand: string, last4: string, holder: string;
  if (req.saved) {
    ({ brand, last4, holder } = req.saved);
    if (!/^\d{3,4}$/.test(req.saved.cvv)) throw new Error("CVV inválido.");
  } else {
    const c = req.card;
    if (!c) throw new Error("Informe os dados do cartão.");
    const num = onlyDigits(c.number);
    const br = cardBrand(num);
    if (!luhn(num)) throw new Error("Número do cartão inválido.");
    if (c.holder.trim().length < 3) throw new Error("Informe o nome como está no cartão.");
    if (!validExpiry(c.expiry)) throw new Error("Validade inválida ou cartão vencido.");
    if (!validCvv(c.cvv, br)) throw new Error("CVV inválido.");
    if (kind === "credito" && (onlyDigits(c.postal_code).length !== 8 || !c.address_number.trim()))
      throw new Error("Informe CEP e número do endereço da fatura.");
    brand = BRAND_LABEL[br];
    last4 = num.slice(-4);
    holder = c.holder.trim().toUpperCase();
  }
  if (last4 === "0002") throw new Error("Pagamento recusado pelo banco emissor. Tente outro cartão.");
  const n = kind === "credito" ? Math.max(1, Math.min(6, req.installments || 1)) : 1;
  return {
    status: "paid",
    info: cardInfo(brand, kind, last4, n),
    saved_card: req.save_card && !req.saved ? { kind, brand, last4, holder } : undefined,
  };
}

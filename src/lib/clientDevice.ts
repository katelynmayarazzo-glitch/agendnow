import type { SavedCard } from "./payments";
/**
 * Dados que o CLIENTE FINAL escolhe guardar no próprio aparelho:
 * nome/telefone para não digitar de novo e os links dos agendamentos feitos.
 */
export interface SavedProfile {
  name: string;
  phone: string;
  email: string;
  birth_date: string | null;
  cpf?: string;
  insurance?: string;
  insurance_number?: string;
}

const PKEY = "agendapro:perfil";
const BKEY = "agendapro:meus-agendamentos";

function read<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignora */
  }
}

export const getProfile = () => read<SavedProfile | null>(PKEY, null);
export const saveProfile = (p: SavedProfile) => write(PKEY, p);
export const forgetProfile = () => localStorage.removeItem(PKEY);

export interface SavedBooking {
  token: string;
  slug: string;
  starts_at: string;
}
export const getSavedBookings = (slug?: string) =>
  read<SavedBooking[]>(BKEY, []).filter((b) => !slug || b.slug === slug);
export const addSavedBooking = (b: SavedBooking) => {
  const all = read<SavedBooking[]>(BKEY, []).filter((x) => x.token !== b.token);
  // guarda só os últimos 20
  write(BKEY, [b, ...all].slice(0, 20));
};

// ---------------------------------------------------------------- cartões vinculados
/**
 * Cartão vinculado NESTE aparelho (escolha do cliente): só bandeira, 4 últimos dígitos,
 * nome e o token do processador (Asaas). Número completo e CVV nunca são guardados.
 */
const CKEY = "agendapro:cartoes";
export const getSavedCards = () => read<SavedCard[]>(CKEY, []);
export const getSavedCard = (kind: SavedCard["kind"]) => getSavedCards().find((c) => c.kind === kind) ?? null;
export const saveCard = (c: SavedCard) => write(CKEY, [c, ...getSavedCards().filter((x) => x.kind !== c.kind)]);
export const removeSavedCard = (kind: SavedCard["kind"]) => write(CKEY, getSavedCards().filter((x) => x.kind !== kind));

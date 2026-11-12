import type { Segment, WeekHours } from "./types";

/** Vocabulário que muda conforme o tipo de negócio. */
export interface Terms {
  label: string;
  client: string;
  clients: string;
  pro: string;
  pros: string;
  emoji: string;
  askBirth: boolean; // clínicas costumam precisar da data de nascimento
  notesLabel: string;
  clinical: boolean; // ficha com CPF/convênio + prontuário
}

export const SEGMENTS: Record<Segment, Terms> = {
  barbearia: {
    label: "Barbearia",
    client: "Cliente",
    clients: "Clientes",
    pro: "Barbeiro",
    pros: "Barbeiros",
    emoji: "",
    askBirth: false,
    notesLabel: "Alguma observação? (opcional)",
    clinical: false,
  },
  salao: {
    label: "Salão de beleza",
    client: "Cliente",
    clients: "Clientes",
    pro: "Profissional",
    pros: "Profissionais",
    emoji: "",
    askBirth: false,
    notesLabel: "Alguma observação? (opcional)",
    clinical: false,
  },
  estetica: {
    label: "Estética",
    client: "Cliente",
    clients: "Clientes",
    pro: "Esteticista",
    pros: "Esteticistas",
    emoji: "",
    askBirth: true,
    notesLabel: "Alergias ou observações (opcional)",
    clinical: false,
  },
  clinica: {
    label: "Clínica / Consultório",
    client: "Paciente",
    clients: "Pacientes",
    pro: "Especialista",
    pros: "Especialistas",
    emoji: "",
    askBirth: true,
    notesLabel: "Motivo da consulta (opcional)",
    clinical: true,
  },
};

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function defaultHours(): WeekHours {
  return {
    0: null,
    1: { open: "09:00", close: "19:00" },
    2: { open: "09:00", close: "19:00" },
    3: { open: "09:00", close: "19:00" },
    4: { open: "09:00", close: "19:00" },
    5: { open: "09:00", close: "19:00" },
    6: { open: "09:00", close: "14:00" },
  };
}

export const STATUS_LABEL = {
  pending: "Aguardando",
  confirmed: "Confirmado",
  done: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
} as const;

export const STATUS_STYLE = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  done: "bg-sky-50 text-sky-700 ring-sky-200",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
  no_show: "bg-zinc-100 text-zinc-600 ring-zinc-200",
} as const;

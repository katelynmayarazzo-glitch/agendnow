import type { Segment } from "./types";

/** Serviços sugeridos ao criar a conta — o dono edita depois. */
export const TEMPLATE_SERVICES: Record<Segment, { name: string; duration: number; price: number; description: string }[]> = {
  barbearia: [
    { name: "Corte masculino", duration: 40, price: 4000, description: "Máquina e tesoura, com acabamento." },
    { name: "Barba", duration: 30, price: 3000, description: "Toalha quente e navalha." },
    { name: "Corte + barba", duration: 70, price: 6500, description: "O combo completo." },
    { name: "Sobrancelha", duration: 20, price: 1500, description: "" },
  ],
  salao: [
    { name: "Corte feminino", duration: 60, price: 9000, description: "Lavagem, corte e finalização." },
    { name: "Escova", duration: 45, price: 6000, description: "" },
    { name: "Coloração", duration: 120, price: 18000, description: "Valor a partir de." },
    { name: "Manicure", duration: 45, price: 3500, description: "" },
  ],
  estetica: [
    { name: "Limpeza de pele", duration: 60, price: 15000, description: "" },
    { name: "Design de sobrancelha", duration: 30, price: 4500, description: "" },
    { name: "Drenagem linfática", duration: 60, price: 12000, description: "" },
  ],
  clinica: [
    { name: "Consulta", duration: 30, price: 25000, description: "Primeira consulta ou retorno." },
    { name: "Retorno", duration: 20, price: 0, description: "Até 30 dias após a consulta." },
    { name: "Avaliação", duration: 45, price: 18000, description: "" },
  ],
};

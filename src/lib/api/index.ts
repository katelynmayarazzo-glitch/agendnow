import { localApi } from "./local";
import { createSupabaseApi } from "./supabase";
import type { Api } from "./types";
import type { NewBusinessInput } from "../types";
import { TEMPLATE_SERVICES } from "../templates";
import { SEGMENTS } from "../segments";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Com .env preenchido usa Supabase; sem ele, roda em modo demonstração. */
export const api: Api = url && key ? createSupabaseApi(url, key) : localApi;

export type { ClientWithStats } from "./types";

/** Cria a empresa já com serviços de exemplo e um primeiro profissional. */
export async function onboardBusiness(input: NewBusinessInput, ownerName: string) {
  const b = await api.createBusiness(input);
  const ids: string[] = [];
  for (const t of TEMPLATE_SERVICES[input.segment]) {
    const s = await api.saveService({ id: "", business_id: b.id, active: true, ...t });
    ids.push(s.id);
  }
  await api.saveProfessional({
    id: "",
    business_id: b.id,
    name: ownerName.trim() || "Profissional 1",
    role: SEGMENTS[input.segment].pro,
    service_ids: ids,
    hours: null,
    active: true,
  });
  return b;
}

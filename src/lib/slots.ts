import type { Business, Professional } from "./types";
import { addDays, startOfDay, toMin } from "./format";

export interface Busy {
  starts_at: string;
  ends_at: string;
}

/** Horário de trabalho do profissional naquele dia (ou do estabelecimento). */
export function hoursFor(business: Business, pro: Professional | null, day: Date) {
  const wd = day.getDay();
  const src = pro?.hours ?? business.hours;
  return src[wd] ?? null;
}

/** Dias que aparecem para o cliente escolher. */
export function bookableDays(business: Business, pro: Professional | null) {
  const out: Date[] = [];
  const today = startOfDay(new Date());
  for (let i = 0; i <= business.max_days_ahead; i++) {
    const d = addDays(today, i);
    if (hoursFor(business, pro, d)) out.push(d);
  }
  return out;
}

/** Calcula os horários livres de um profissional num dia. */
export function freeSlots(opts: {
  business: Business;
  pro: Professional;
  day: Date;
  duration: number;
  busy: Busy[];
  now?: Date;
}) {
  const { business, pro, day, duration, busy } = opts;
  const now = opts.now ?? new Date();
  const h = hoursFor(business, pro, day);
  if (!h) return [];
  const open = toMin(h.open);
  const close = toMin(h.close);
  const earliest = now.getTime() + business.min_notice * 60000;
  const ranges = busy.map((b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()]);
  const out: Date[] = [];
  for (let m = open; m + duration <= close; m += business.slot_interval) {
    const a = new Date(day);
    a.setHours(0, m, 0, 0);
    const s = a.getTime();
    const e = s + duration * 60000;
    if (s < earliest) continue;
    if (ranges.some(([bs, be]) => bs < e && be > s)) continue;
    out.push(a);
  }
  return out;
}

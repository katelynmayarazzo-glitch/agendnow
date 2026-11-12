import type { WeekHours } from "../lib/types";
import { WEEKDAYS } from "../lib/segments";
import { Toggle } from "./ui";

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HoursEditor({ value, onChange }: { value: WeekHours; onChange: (v: WeekHours) => void }) {
  return (
    <div className="divide-y divide-zinc-100">
      {ORDER.map((wd) => {
        const h = value[wd];
        return (
          <div key={wd} className="flex flex-wrap items-center gap-3 py-2">
            <div className="w-28">
              <Toggle checked={!!h} onChange={(on) => onChange({ ...value, [wd]: on ? { open: "09:00", close: "18:00" } : null })} label={WEEKDAYS[wd]} />
            </div>
            {h ? (
              <div className="flex items-center gap-2 text-sm">
                <input type="time" className="rounded-lg px-2 py-1 ring-1 ring-zinc-300" value={h.open} onChange={(e) => onChange({ ...value, [wd]: { ...h, open: e.target.value } })} />
                <span className="text-zinc-400">até</span>
                <input type="time" className="rounded-lg px-2 py-1 ring-1 ring-zinc-300" value={h.close} onChange={(e) => onChange({ ...value, [wd]: { ...h, close: e.target.value } })} />
              </div>
            ) : (
              <span className="text-sm text-zinc-400">Fechado</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function hoursValid(h: WeekHours) {
  return Object.values(h).every((d) => !d || d.open < d.close);
}

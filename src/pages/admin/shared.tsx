import { useEffect, useMemo, useState } from "react";
import { api, type ClientWithStats } from "../../lib/api";
import type { AppointmentView, Business, Professional, Service, Status } from "../../lib/types";
import { brl, dayLong, hm, insuranceLabel, isValidPhone, maskPhone, startOfDay, addDays, whatsappLink } from "../../lib/format";
import { freeSlots } from "../../lib/slots";
import { SEGMENTS, type Terms } from "../../lib/segments";
import { Alert, Button, Field, Input, Modal, Select, StatusBadge, Textarea, cx } from "../../components/ui";
import { errMsg, useToast } from "../../components/Toast";
import { PAYMENT_METHODS, paymentShort } from "../../lib/payments";

/** Pergunta "Como foi pago?" ao marcar um atendimento como concluído. */
export function PaidModal({ a, business, onPick, onClose }: { a: AppointmentView | null; business: Business; onPick: (method: string) => void; onClose: () => void }) {
  if (!a) return null;
  const methods = PAYMENT_METHODS.filter((m) => business.payment_methods.includes(m.id));
  return (
    <Modal open onClose={onClose} title="Como foi pago?">
      <p className="mb-4 text-sm text-zinc-500">
        {a.client_name} · {a.service_name} · <b className="text-zinc-800">{brl(a.price)}</b>
        {a.payment_method && <> · indicou <b>{paymentShort(a.payment_method)}</b> no agendamento</>}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {methods.map((m) => (
          <button
            key={m.id}
            onClick={() => onPick(m.id)}
            className={cx(
              "flex items-center gap-2 rounded-2xl px-4 py-3.5 text-left font-semibold ring-1 transition hover:bg-brand-50 hover:ring-brand-500",
              a.payment_method === m.id ? "bg-brand-50 ring-2 ring-brand-600" : "bg-white ring-zinc-200",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <button onClick={() => onPick("")} className="mt-4 w-full text-center text-sm text-zinc-500 hover:underline">Marcar como atendido sem informar</button>
    </Modal>
  );
}

/**
 * Situação do pagamento ONLINE (feito pelo site). No Pix direto o cliente avisa que pagou
 * e o dono confere no extrato: aqui ele confirma ou recusa.
 */
export function OnlinePayBadge({ a, onChange, compact }: { a: AppointmentView; onChange?: () => void; compact?: boolean }) {
  if (!a.payment_status) return null;
  const style =
    a.payment_status === "paid"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : a.payment_status === "review"
        ? "bg-sky-50 text-sky-700 ring-sky-200"
        : "bg-amber-50 text-amber-700 ring-amber-200";
  const text =
    a.payment_status === "paid"
      ? `✓ Pago online${!compact && a.payment_info ? ` · ${a.payment_info}` : ""}`
      : a.payment_status === "review"
        ? "Cliente informou Pix"
        : `Aguardando pagamento${a.payment_method ? ` (${paymentShort(a.payment_method)})` : ""}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", style)} title={a.payment_info || undefined}>{text}</span>
      {onChange && <PixReview a={a} onChange={onChange} />}
    </span>
  );
}

/** Botões "Confirmar Pix" / "Não recebi" para o Pix direto informado pelo cliente. */
export function PixReview({ a, onChange }: { a: AppointmentView; onChange: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState("");
  if (a.payment_status !== "review") return null;
  async function set(st: "paid" | "pending") {
    setBusy(st);
    try {
      await api.setPaymentStatus(a.id, st);
      toast(st === "paid" ? "Pix confirmado." : "Marcado como não recebido.");
      onChange();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <Button size="sm" loading={busy === "paid"} onClick={() => set("paid")}>✓ Confirmar Pix</Button>
      <Button size="sm" variant="ghost" loading={busy === "pending"} onClick={() => set("pending")}>Não recebi</Button>
    </>
  );
}

/** Ao marcar "Atendido": se já foi pago pelo site, não pergunta de novo como foi pago. */
export const paidOnlineMethod = (a: AppointmentView) => (a.payment_status === "paid" ? a.payment_method : undefined);

/** Rótulo curto do pagamento (ex.: "Pix"). */
export const paidLabel = (a: AppointmentView) => (a.payment_method ? `${paymentShort(a.payment_method)}` : "");

/** Linha de agendamento com ações rápidas. */
export function AppointmentRow({ a, business, onChange, showDate }: { a: AppointmentView; business: Business; onChange: () => void; showDate?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<Status | null>(null);
  const [asking, setAsking] = useState(false);
  const past = new Date(a.starts_at) < new Date();
  const set = async (s: Status, pm?: string) => {
    if (s === "done" && pm === undefined) pm = paidOnlineMethod(a);
    if (s === "done" && pm === undefined && !a.insurance) return setAsking(true);
    setAsking(false);
    setBusy(s);
    try {
      await api.setAppointmentStatus(a.id, s, pm);
      onChange();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  };
  const first = a.client_name.split(" ")[0];
  const wa =
    a.status === "pending"
      ? `Olá, ${first}! Aqui é da ${business.name}. Seu horário de ${a.service_name} em ${dayLong(a.starts_at)} às ${hm(a.starts_at)} está confirmado. Até lá!`
      : `Olá, ${first}! Passando para lembrar do seu horário de ${a.service_name} na ${business.name}, ${dayLong(a.starts_at)} às ${hm(a.starts_at)}.`;

  return (
    <div className={cx("flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center", a.status === "cancelled" && "opacity-55")}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="w-14 shrink-0 text-center">
          <p className="text-base font-bold">{hm(a.starts_at)}</p>
          <p className="text-[11px] text-zinc-400">{hm(a.ends_at)}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{a.client_name}</p>
          <p className="truncate text-sm text-zinc-500">
            {showDate && <>{new Date(a.starts_at).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })} · </>}
            {a.service_name} · {a.professional_name} · {a.insurance ? `Convênio ${a.insurance}` : brl(a.price)}
            {a.status === "done" && a.payment_method && <> · {paidLabel(a)}</>}
          </p>
          {a.payment_status && <div className="mt-1"><OnlinePayBadge a={a} onChange={onChange} /></div>}
          {a.notes && <p className="mt-0.5 truncate text-xs text-zinc-400">“{a.notes}”</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-[68px] sm:pl-0">
        {SEGMENTS[business.segment].clinical && (
          <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold ring-1", a.insurance ? "bg-sky-50 text-sky-700 ring-sky-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200")}>
            {insuranceLabel(a.insurance)}
          </span>
        )}
        <StatusBadge status={a.status} />
        {a.status === "pending" && (
          <Button size="sm" loading={busy === "confirmed"} onClick={() => set("confirmed")}>Confirmar</Button>
        )}
        {(a.status === "confirmed" || a.status === "pending") && past && (
          <>
            <Button size="sm" variant="secondary" loading={busy === "done"} onClick={() => set("done")}>Atendido</Button>
            <Button size="sm" variant="ghost" loading={busy === "no_show"} onClick={() => set("no_show")}>Faltou</Button>
          </>
        )}
        {(a.status === "confirmed" || a.status === "pending") && (
          <>
            <a href={whatsappLink(a.client_phone, wa)} target="_blank" rel="noreferrer" title="WhatsApp" className="rounded-lg px-2 py-1.5 text-sm ring-1 ring-zinc-200 font-semibold text-emerald-700 hover:bg-zinc-50">WhatsApp</a>
            {!past && (
              <Button size="sm" variant="ghost" loading={busy === "cancelled"} onClick={() => confirm("Cancelar este agendamento?") && set("cancelled")}>
                Cancelar
              </Button>
            )}
          </>
        )}
        {(a.status === "cancelled" || a.status === "no_show" || a.status === "done") && (
          <Button size="sm" variant="ghost" onClick={() => set("confirmed")} title="Desfazer">↺</Button>
        )}
      </div>
      <PaidModal a={asking ? a : null} business={business} onPick={(m) => set("done", m)} onClose={() => setAsking(false)} />
    </div>
  );
}

/** Modal para o dono lançar um agendamento (telefone, balcão, encaixe). */
export function NewAppointmentModal({
  open,
  onClose,
  onSaved,
  business,
  terms,
  defaultDate,
  defaultTime,
  defaultProId,
  presetClient,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  business: Business;
  terms: Terms;
  defaultDate?: Date;
  defaultTime?: string; // "HH:MM" (clique num horário da grade)
  defaultProId?: string;
  presetClient?: ClientWithStats | null;
}) {
  const toast = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [pros, setPros] = useState<Professional[]>([]);
  const [clients, setClients] = useState<ClientWithStats[]>([]);
  const [f, setF] = useState({ clientId: "", name: "", phone: "", serviceId: "", proId: "", date: "", time: "", notes: "", insurance: "" });
  const [suggest, setSuggest] = useState<Date[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    const d = defaultDate ?? new Date();
    setF({
      clientId: presetClient?.id ?? "",
      name: presetClient?.name ?? "",
      phone: presetClient ? maskPhone(presetClient.phone) : "",
      serviceId: "",
      proId: "",
      date: d.toLocaleDateString("sv-SE"),
      time: "",
      notes: "",
      insurance: presetClient?.insurance && business.insurances.includes(presetClient.insurance) ? presetClient.insurance : "",
    });
    Promise.all([api.listServices(business.id), api.listProfessionals(business.id), api.listClients(business.id)]).then(([s, p, c]) => {
      const sa = s.filter((x) => x.active), pa = p.filter((x) => x.active);
      setServices(sa);
      setPros(pa);
      setClients(c);
      const pro = pa.find((p) => p.id === defaultProId) ?? pa[0];
      const sv = sa.find((x) => !pro || !pro.service_ids.length || pro.service_ids.includes(x.id)) ?? sa[0];
      setF((x) => ({ ...x, serviceId: sv?.id ?? "", proId: pro?.id ?? "", time: defaultTime ?? "" }));
    });
  }, [open, business.id, defaultDate, presetClient, defaultTime, defaultProId]);

  const service = services.find((s) => s.id === f.serviceId);
  const pro = pros.find((p) => p.id === f.proId);
  const prosForService = useMemo(() => pros.filter((p) => !service || !p.service_ids.length || p.service_ids.includes(service.id)), [pros, service]);

  useEffect(() => {
    if (!service || !pro || !f.date) return setSuggest([]);
    const day = new Date(`${f.date}T00:00:00`);
    api.getBusy(pro.id, startOfDay(day), addDays(startOfDay(day), 1)).then((busy) =>
      setSuggest(freeSlots({ business: { ...business, min_notice: 0 }, pro, day, duration: service.duration, busy })),
    );
  }, [service, pro, f.date, business]);

  async function save() {
    setError("");
    const name = f.clientId ? clients.find((c) => c.id === f.clientId)?.name ?? "" : f.name;
    const phone = f.clientId ? clients.find((c) => c.id === f.clientId)?.phone ?? "" : f.phone;
    if (!name.trim() || !isValidPhone(phone)) return setError(`Informe nome e celular do ${terms.client.toLowerCase()}.`);
    if (!service || !pro) return setError("Escolha serviço e profissional.");
    if (!f.date || !f.time) return setError("Escolha data e horário.");
    setSaving(true);
    try {
      await api.createBooking({
        business_id: business.id,
        service_id: service.id,
        professional_id: pro.id,
        starts_at: new Date(`${f.date}T${f.time}:00`).toISOString(),
        name,
        phone,
        email: "",
        birth_date: null,
        cpf: "",
        insurance: terms.clinical ? f.insurance : "",
        insurance_number: "",
        payment_method: "",
        notes: f.notes,
      });
      toast("Agendamento criado!");
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo agendamento"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={save}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={terms.client}>
          <Select
            value={f.clientId}
            onChange={(e) => {
              const c = clients.find((x) => x.id === e.target.value);
              setF({ ...f, clientId: e.target.value, insurance: c && business.insurances.includes(c.insurance) ? c.insurance : f.insurance });
            }}
          >
            <option value="">+ Novo cadastro</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name} — {maskPhone(c.phone)}</option>
            ))}
          </Select>
        </Field>
        {!f.clientId && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Celular"><Input value={f.phone} inputMode="tel" onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} /></Field>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Serviço">
            <Select value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value, time: "" })}>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.duration} min)</option>)}
            </Select>
          </Field>
          <Field label={terms.pro}>
            <Select value={f.proId} onChange={(e) => setF({ ...f, proId: e.target.value, time: "" })}>
              {prosForService.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Data"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, time: "" })} /></Field>
          <Field label="Horário" hint="Pode digitar um encaixe fora da grade">
            <Input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          </Field>
        </div>
        {suggest.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-500">Horários livres</p>
            <div className="flex flex-wrap gap-1.5">
              {suggest.map((s) => {
                const t = hm(s);
                return (
                  <button key={t} type="button" onClick={() => setF({ ...f, time: t })}
                    className={cx("rounded-lg px-2.5 py-1 text-xs font-semibold ring-1", f.time === t ? "bg-brand-600 text-white ring-brand-600" : "ring-zinc-200 hover:bg-zinc-50")}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {terms.clinical && business.insurances.length > 0 && (
          <Field label="Forma de atendimento">
            <Select value={f.insurance} onChange={(e) => setF({ ...f, insurance: e.target.value })}>
              <option value="">Particular</option>
              {business.insurances.map((i) => <option key={i} value={i}>Convênio {i}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Observação"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}

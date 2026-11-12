import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Professional, PublicBusiness, Service } from "../lib/types";
import { SEGMENTS, WEEKDAYS_SHORT } from "../lib/segments";
import { addDays, brl, hm, isValidCpf, isValidEmail, isValidPhone, maskCpf, maskPhone, onlyDigits, sameDay, startOfDay, whatsappLink } from "../lib/format";
import { bookableDays, freeSlots } from "../lib/slots";
import { addSavedBooking, getProfile, getSavedBookings, saveProfile, forgetProfile } from "../lib/clientDevice";
import { Alert, Field, Logo, Input, PageLoader, Spinner, Textarea, cx } from "../components/ui";
import { errMsg } from "../components/Toast";
import NotFound from "./NotFound";
import { ThemeToggle } from "../components/ThemeToggle";
import { PAYMENT_METHODS, onlineSetup, type OnlineMethod } from "../lib/payments";

const ANY = "__any__";

export default function Booking() {
  const { slug = "" } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<PublicBusiness | null | undefined>(undefined);

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [proId, setProId] = useState<string | null>(null);
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<{ at: Date; proId: string } | null>(null);
  const [slots, setSlots] = useState<{ at: Date; proId: string }[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [reload, setReload] = useState(0);

  const saved = useMemo(getProfile, []);
  const [form, setForm] = useState({
    name: saved?.name ?? "",
    phone: saved ? maskPhone(saved.phone) : "",
    email: saved?.email ?? "",
    birth_date: saved?.birth_date ?? "",
    cpf: saved?.cpf ? maskCpf(saved.cpf) : "",
    insurance: saved?.insurance ?? "",
    insurance_number: saved?.insurance_number ?? "",
    payment_method: "",
    notes: "",
  });
  const [payWhen, setPayWhen] = useState<"online" | "local">("online");
  const [onlineMethod, setOnlineMethod] = useState<OnlineMethod | "">("");
  const [remember, setRemember] = useState(true);
  const [consent, setConsent] = useState(!!saved);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getPublicBusiness(slug).then(setData).catch(() => setData(null));
  }, [slug]);

  const b = data?.business;
  const terms = b ? SEGMENTS[b.segment] : SEGMENTS.barbearia;
  // Clínica: formas de atendimento ("" = particular)
  const payOptions = b && terms.clinical && b.insurances.length ? [...(b.accept_private ? [""] : []), ...b.insurances] : [];

  // convênio lembrado que esta clínica não aceita → ajusta
  useEffect(() => {
    if (!payOptions.length) return;
    if (!payOptions.includes(form.insurance)) setForm((f) => ({ ...f, insurance: payOptions[0] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payOptions.join("|")]);
  const service = data?.services.find((s) => s.id === serviceId) ?? null;

  const eligiblePros = useMemo(
    () => (data && service ? data.professionals.filter((p) => !p.service_ids.length || p.service_ids.includes(service.id)) : []),
    [data, service],
  );
  const selectedPros: Professional[] = useMemo(
    () => (proId === ANY ? eligiblePros : eligiblePros.filter((p) => p.id === proId)),
    [proId, eligiblePros],
  );

  const days = useMemo(() => {
    if (!b || !selectedPros.length) return [];
    const map = new Map<number, Date>();
    selectedPros.forEach((p) => bookableDays(b, p).forEach((d) => map.set(+d, d)));
    return [...map.values()].sort((x, y) => +x - +y);
  }, [b, selectedPros]);

  // Carrega horários livres quando serviço/profissional/dia mudam
  useEffect(() => {
    if (!b || !service || !day || !selectedPros.length) {
      setSlots(null);
      return;
    }
    let alive = true;
    setLoadingSlots(true);
    const from = startOfDay(day);
    const to = addDays(from, 1);
    Promise.all(
      selectedPros.map(async (p) => {
        const busy = await api.getBusy(p.id, from, to);
        return freeSlots({ business: b, pro: p, day, duration: service.duration, busy }).map((at) => ({ at, proId: p.id }));
      }),
    )
      .then((lists) => {
        if (!alive) return;
        // "Sem preferência": um horário por hora, com o primeiro profissional livre
        const byTime = new Map<number, { at: Date; proId: string }>();
        lists.flat().forEach((s) => !byTime.has(+s.at) && byTime.set(+s.at, s));
        setSlots([...byTime.values()].sort((x, y) => +x.at - +y.at));
      })
      .catch(() => alive && setSlots([]))
      .finally(() => alive && setLoadingSlots(false));
    return () => {
      alive = false;
    };
  }, [b, service, day, selectedPros, reload]);

  // Só um profissional faz o serviço? Já seleciona.
  useEffect(() => {
    if (eligiblePros.length === 1 && proId !== eligiblePros[0].id) setProId(eligiblePros[0].id);
  }, [eligiblePros, proId]);

  // Escolhe automaticamente o primeiro dia disponível
  useEffect(() => {
    if (days.length && (!day || !days.some((d) => sameDay(d, day)))) setDay(days[0]);
  }, [days, day]);

  if (data === undefined) return <PageLoader />;
  if (!data || !b) return <NotFound />;

  // a página de agendamento segue a identidade visual do AgendNow (azul + verde-água)
  const accent = { "--accent": "#2563eb" } as CSSProperties;
  const myBookings = getSavedBookings(slug).filter((x) => new Date(x.starts_at) > new Date());

  const errors = {
    name: form.name.trim().length < 2 ? "Informe seu nome completo." : "",
    phone: !isValidPhone(form.phone) ? "Informe um celular com DDD." : "",
    email: !isValidEmail(form.email) ? "E-mail inválido." : "",
    consent: !consent ? "Precisamos da sua autorização para salvar os dados." : "",
    cpf: terms.clinical && !isValidCpf(form.cpf) ? "Informe um CPF válido." : "",
    birth: terms.clinical && !form.birth_date ? "Informe a data de nascimento." : "",
    card: terms.clinical && form.insurance && !form.insurance_number.trim() ? "Informe o número da carteirinha." : "",
  };
  // Pagamento online (Pix/cartão/boleto pelo site), se o estabelecimento ativou
  const setup = onlineSetup(b, api.mode === "demo", slot?.at);
  const chargeable = setup.enabled && !!service && service.price > 0 && !(terms.clinical && form.insurance);
  const payOnline = chargeable && (setup.required || payWhen === "online");
  const chosenOnline: OnlineMethod | "" = onlineMethod && setup.methods.includes(onlineMethod) ? onlineMethod : setup.methods[0] ?? "";
  const formOk = Object.values(errors).every((x) => !x);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError("");
    if (!slot || !service || !formOk || !b) return;
    setSending(true);
    try {
      const { token } = await api.createBooking({
        business_id: b.id,
        service_id: service.id,
        professional_id: slot.proId,
        starts_at: slot.at.toISOString(),
        name: form.name,
        phone: form.phone,
        email: form.email,
        birth_date: form.birth_date || null,
        cpf: terms.clinical ? form.cpf : "",
        insurance: terms.clinical ? form.insurance : "",
        insurance_number: terms.clinical && form.insurance ? form.insurance_number : "",
        payment_method: terms.clinical && form.insurance ? "" : payOnline ? chosenOnline : form.payment_method,
        pay_online: payOnline,
        notes: form.notes,
      });
      if (remember)
        saveProfile({
          name: form.name.trim(),
          phone: onlyDigits(form.phone),
          email: form.email.trim(),
          birth_date: form.birth_date || null,
          ...(terms.clinical ? { cpf: onlyDigits(form.cpf), insurance: form.insurance, insurance_number: form.insurance_number.trim() } : {}),
        });
      else forgetProfile();
      addSavedBooking({ token, slug, starts_at: slot.at.toISOString() });
      nav(`/agendamento/${token}?novo=1${payOnline ? "&pagar=1" : ""}`);
    } catch (err) {
      setError(errMsg(err));
      setSlot(null);
      setReload((n) => n + 1);
    } finally {
      setSending(false);
    }
  }

  const step = !service ? 1 : !proId ? 2 : !slot ? 3 : 4;

  return (
    <div style={accent} className="admin-bg min-h-screen">
      {/* Cabeçalho do estabelecimento */}
      <header className="relative overflow-hidden bg-[#071330] text-white">

        <div className="relative mx-auto flex max-w-2xl items-center justify-between px-4 pt-4">
          <Link to="/" className="flex items-center gap-2">
            <Logo light className="text-base text-white" />
          </Link>
          <ThemeToggle variant="glass" />
        </div>

        <div className="relative mx-auto max-w-2xl px-4 pt-8 pb-20">
          <div className="flex items-center gap-4">
            <span className="bg-grad grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-extrabold shadow-sm">
              {b.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20 backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> {terms.label} · agenda aberta
              </span>
              <h1 className="mt-2 truncate text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">{b.name}</h1>
            </div>
          </div>
          {b.about && <p className="mt-3 max-w-xl text-white/75">{b.about}</p>}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/80">
            {b.address && <span>{b.address}</span>}
            {b.phone && (
              <a className="underline-offset-2 hover:text-white hover:underline" href={whatsappLink(b.phone, `Olá, ${b.name}!`)} target="_blank" rel="noreferrer">
                {maskPhone(b.phone)}
              </a>
            )}
          </div>
          {b.payment_methods.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-white/55">Aceitamos</span>
              {PAYMENT_METHODS.filter((m) => b.payment_methods.includes(m.id)).map((m) => (
                <span key={m.id} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-white/20">
                  {m.short}
                </span>
              ))}
              {setup.enabled && (
                <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-300/30">
                  Pague pelo site
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="relative mx-auto -mt-12 max-w-2xl space-y-4 px-4 pb-16">
        {myBookings.length > 0 && (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70">
            <p className="text-sm font-semibold">Seus próximos horários aqui</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {myBookings.map((x) => (
                <Link key={x.token} to={`/agendamento/${x.token}`} className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm hover:bg-zinc-200">
                  {new Date(x.starts_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às {hm(x.starts_at)} →
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* 1. Serviço */}
        <Step n={1} title="Escolha o serviço" active={step === 1} done={!!service}>
          {data.services.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum serviço disponível no momento.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.services.map((s: Service) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setServiceId(s.id);
                    setProId(null);
                    setSlot(null);
                  }}
                  className={cx(
                    "rounded-xl border bg-white p-3.5 text-left transition hover:border-zinc-400",
                    serviceId === s.id ? "accent-ring" : "border-zinc-200",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{s.name}</span>
                    <span className="shrink-0 text-sm font-semibold text-brand-600">{s.price ? brl(s.price) : "Sem custo"}</span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {s.duration} min{s.description ? ` · ${s.description}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Step>

        {/* 2. Profissional */}
        {service && (
          <Step n={2} title={`Escolha o ${terms.pro.toLowerCase()}`} active={step === 2} done={!!proId}>
            {eligiblePros.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhum {terms.pro.toLowerCase()} disponível para este serviço.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {eligiblePros.length > 1 && (
                  <ProChip label="Sem preferência" sub="Primeiro disponível" on={proId === ANY} onClick={() => { setProId(ANY); setSlot(null); }} />
                )}
                {eligiblePros.map((p) => (
                  <ProChip key={p.id} label={p.name} sub={p.role} on={proId === p.id} onClick={() => { setProId(p.id); setSlot(null); }} />
                ))}
              </div>
            )}
          </Step>
        )}

        {/* 3. Dia e horário */}
        {service && proId && (
          <Step n={3} title="Dia e horário" active={step === 3} done={!!slot}>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
              {days.map((d) => {
                const on = day && sameDay(d, day);
                return (
                  <button
                    key={+d}
                    onClick={() => {
                      setDay(d);
                      setSlot(null);
                    }}
                    className={cx(
                      "flex w-16 shrink-0 flex-col items-center rounded-xl border py-2 transition",
                      on ? "bg-grad border-transparent text-white shadow-sm" : "border-zinc-200 bg-white hover:border-zinc-400",
                    )}
                  >
                    <span className="text-xs opacity-80">{sameDay(d, new Date()) ? "Hoje" : WEEKDAYS_SHORT[d.getDay()]}</span>
                    <span className="text-lg font-bold">{d.getDate()}</span>
                    <span className="text-[10px] uppercase opacity-70">{d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              {loadingSlots || slots === null ? (
                <div className="flex justify-center py-6 text-zinc-400">
                  <Spinner />
                </div>
              ) : slots.length === 0 ? (
                <p className="py-4 text-center text-sm text-zinc-500">Sem horários livres neste dia. Tente outra data.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {slots.map((s) => {
                    const on = slot && +slot.at === +s.at;
                    return (
                      <button
                        key={+s.at}
                        onClick={() => setSlot(s)}
                        className={cx(
                          "rounded-lg border py-2 text-sm font-semibold transition",
                          on ? "bg-grad border-transparent text-white shadow-sm" : "border-zinc-200 bg-white hover:border-zinc-400",
                        )}
                      >
                        {hm(s.at)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Step>
        )}

        {/* 4. Dados */}
        {slot && service && (
          <Step n={4} title="Seus dados" active done={false}>
            <div className="mb-4 rounded-xl bg-zinc-50 p-3 text-sm ring-1 ring-zinc-200">
              <b>{service.name}</b> com {data.professionals.find((p) => p.id === slot.proId)?.name}
              <br />
              {slot.at.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })} às <b>{hm(slot.at)}</b>
              {terms.clinical && form.insurance ? <> · Convênio {form.insurance}</> : service.price > 0 && <> · {brl(service.price)}</>}
            </div>
            <form onSubmit={submit} className="space-y-3" noValidate>
              <Field label="Nome completo" error={touched ? errors.name : ""}>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Celular (WhatsApp)" error={touched ? errors.phone : ""}>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(11) 99999-9999"
                  />
                </Field>
                <Field label="E-mail (opcional)" error={touched ? errors.email : ""}>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
                </Field>
              </div>
              {terms.clinical ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="CPF" error={touched ? errors.cpf : ""}>
                      <Input value={form.cpf} inputMode="numeric" placeholder="000.000.000-00" onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })} />
                    </Field>
                    <Field label="Data de nascimento" error={touched ? errors.birth : ""}>
                      <Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} max={new Date().toISOString().slice(0, 10)} />
                    </Field>
                  </div>
                  {payOptions.length > 0 && (
                    <div>
                      <span className="mb-1.5 block text-sm font-medium text-zinc-700">Forma de atendimento</span>
                      <div className="flex flex-wrap gap-2">
                        {payOptions.map((o) => (
                          <button
                            type="button"
                            key={o || "particular"}
                            onClick={() => setForm({ ...form, insurance: o })}
                            className={cx(
                              "rounded-xl border px-3.5 py-2 text-sm font-semibold transition",
                              form.insurance === o ? "accent-ring" : "border-zinc-200 bg-white hover:border-zinc-400",
                            )}
                          >
                            {o ? `${o}` : "Particular"}
                          </button>
                        ))}
                      </div>
                      {!b.accept_private && <p className="mt-1 text-xs text-zinc-500">Atendimento somente por convênio.</p>}
                    </div>
                  )}
                  {form.insurance && (
                    <Field label={`Nº da carteirinha (${form.insurance})`} error={touched ? errors.card : ""}>
                      <Input value={form.insurance_number} onChange={(e) => setForm({ ...form, insurance_number: e.target.value })} />
                    </Field>
                  )}
                </>
              ) : (
                terms.askBirth && (
                  <Field label="Data de nascimento (opcional)">
                    <Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} max={new Date().toISOString().slice(0, 10)} />
                  </Field>
                )
              )}
              {chargeable ? (
                <div className="rounded-2xl bg-zinc-50 p-3.5 ring-1 ring-zinc-200">
                  <span className="mb-2 block text-sm font-medium text-zinc-700">Pagamento</span>
                  {!setup.required && (
                    <div className="mb-3 grid grid-cols-2 gap-2">
                      {(["online", "local"] as const).map((w) => (
                        <button
                          type="button"
                          key={w}
                          onClick={() => setPayWhen(w)}
                          className={cx(
                            "rounded-xl border bg-white px-3 py-2.5 text-left text-sm transition",
                            payWhen === w ? "accent-ring" : "border-zinc-200 hover:border-zinc-400",
                          )}
                        >
                          <span className="block font-semibold">{w === "online" ? "Pagar agora" : "Pagar no local"}</span>
                          <span className="block text-xs text-zinc-500">{w === "online" ? "Pix, cartão ou boleto pelo site" : "No dia do atendimento"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {setup.required && (
                    <p className="mb-2 text-xs text-zinc-500">{b.name} pede o pagamento antecipado para garantir o horário.</p>
                  )}
                  {payOnline ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {setup.methods.map((m) => {
                          const pm = PAYMENT_METHODS.find((x) => x.id === m)!;
                          return (
                            <button
                              type="button"
                              key={m}
                              onClick={() => setOnlineMethod(m)}
                              className={cx(
                                "rounded-xl border px-3.5 py-2 text-sm font-semibold transition",
                                chosenOnline === m ? "accent-ring" : "border-zinc-200 bg-white hover:border-zinc-400",
                              )}
                            >
                              {pm.short}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-xs text-zinc-500">Você paga {brl(service!.price)} na próxima tela, logo depois de confirmar o horário.</p>
                    </>
                  ) : (
                    <LocalPay b={b} value={form.payment_method} onChange={(v) => setForm({ ...form, payment_method: v })} />
                  )}
                </div>
              ) : (
                !(terms.clinical && form.insurance) &&
                b.payment_methods.length > 0 && (
                  <div>
                    <span className="mb-1.5 block text-sm font-medium text-zinc-700">
                      Como prefere pagar? <span className="font-normal text-zinc-400">(opcional · pagamento no local)</span>
                    </span>
                    <LocalPay b={b} value={form.payment_method} onChange={(v) => setForm({ ...form, payment_method: v })} />
                  </div>
                )
              )}
              <Field label={terms.notesLabel}>
                <Textarea value={form.notes} maxLength={500} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              </Field>

              <label className="flex items-start gap-2 text-sm text-zinc-600">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Lembrar meus dados neste aparelho para o próximo agendamento
              </label>
              <label className="flex items-start gap-2 text-sm text-zinc-600">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  Autorizo {b.name} a guardar meus dados para gerenciar meus agendamentos e entrar em contato sobre eles (LGPD).
                </span>
              </label>
              {touched && errors.consent && <p className="text-xs text-rose-600">{errors.consent}</p>}

              {error && <Alert>{error}</Alert>}
              <button
                type="submit"
                disabled={sending}
                className="bg-grad flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
              >
                {sending && <Spinner />} {payOnline ? `Confirmar e pagar ${brl(service.price)}` : "Confirmar agendamento"}
              </button>
            </form>
          </Step>
        )}

        <p className="pt-4 text-center text-xs text-zinc-400">
          Agendamento online por <Link to="/" className="text-grad-dark font-bold">AgendNow</Link>
        </p>
      </main>
    </div>
  );
}

function Step({ n, title, active, done, children }: { n: number; title: string; active: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <section className={cx("fade-up rounded-2xl bg-white p-4 shadow-sm ring-1 sm:p-5", active ? "ring-zinc-300" : "ring-zinc-200/70")}>
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <span className={cx("grid h-6 w-6 place-items-center rounded-full text-xs font-bold", done ? "bg-grad text-white" : "bg-zinc-100 text-zinc-600")}>
          {done ? "✓" : n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Formas de pagamento no local (opcional: o cliente só indica como pretende pagar). */
function LocalPay({ b, value, onChange }: { b: PublicBusiness["business"]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PAYMENT_METHODS.filter((m) => b.payment_methods.includes(m.id)).map((m) => (
        <button
          type="button"
          key={m.id}
          onClick={() => onChange(value === m.id ? "" : m.id)}
          className={cx(
            "rounded-xl border px-3.5 py-2 text-sm font-semibold transition",
            value === m.id ? "accent-ring" : "border-zinc-200 bg-white hover:border-zinc-400",
          )}
        >
          {m.short}
        </button>
      ))}
    </div>
  );
}

function ProChip({ label, sub, on, onClick }: { label: string; sub?: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cx("flex items-center gap-2.5 rounded-xl border bg-white py-2 pr-4 pl-2 text-left transition hover:border-zinc-400", on ? "accent-ring" : "border-zinc-200")}
    >
      <span className="bg-grad grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white">
        {label === "Sem preferência" ? "" : label.replace(/^(Dra?\.\s*)/, "").charAt(0)}
      </span>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {sub && <span className="block text-xs text-zinc-500">{sub}</span>}
      </span>
    </button>
  );
}

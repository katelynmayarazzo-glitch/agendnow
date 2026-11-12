import { useState, type KeyboardEvent } from "react";
import { api } from "../../lib/api";
import type { Business, Segment } from "../../lib/types";
import { SEGMENTS } from "../../lib/segments";
import { hostPrefix, isValidPhone, maskPhone, onlyDigits, slugify } from "../../lib/format";
import { Alert, Button, Card, Field, Input, Select, Textarea, Toggle, cx } from "../../components/ui";
import { HoursEditor, hoursValid } from "../../components/HoursEditor";
import { PAYMENT_METHODS, normalizePixKey, onlineSetup } from "../../lib/payments";
import type { OnlinePaymentMode } from "../../lib/types";
import { errMsg, useToast } from "../../components/Toast";
import { PageHeader, useAdmin } from "./AdminLayout";


export default function Settings() {
  const { business, setBusiness } = useAdmin();
  const toast = useToast();
  const [f, setF] = useState<Business>({ ...business, phone: maskPhone(business.phone) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newIns, setNewIns] = useState("");
  const clinical = SEGMENTS[f.segment].clinical;
  const demo = api.mode === "demo";
  const setup = onlineSetup(f, demo);
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);

  async function connect(on: boolean) {
    setError("");
    setConnecting(true);
    try {
      if (on) await api.connectGateway(f.id, apiKey);
      else await api.disconnectGateway(f.id);
      const gateway = on ? "asaas" : "";
      setF({ ...f, gateway });
      setBusiness({ ...business, gateway });
      setApiKey("");
      toast(on ? "Asaas conectado! Cartão, boleto e Pix automático liberados." : "Asaas desconectado.");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setConnecting(false);
    }
  }

  function addIns() {
    const n = newIns.trim();
    if (!n) return;
    if (f.insurances.some((x) => x.toLowerCase() === n.toLowerCase())) return setNewIns("");
    setF({ ...f, insurances: [...f.insurances, n] });
    setNewIns("");
  }
  const onInsKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addIns();
    }
  };

  async function save() {
    setError("");
    if (f.name.trim().length < 2) return setError("Informe o nome do negócio.");
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(f.slug)) return setError("Link inválido: use letras minúsculas, números e hífen.");
    if (f.phone && !isValidPhone(f.phone)) return setError("WhatsApp inválido.");
    if (!hoursValid(f.hours)) return setError("Confira os horários: a abertura deve ser antes do fechamento.");
    if (f.payment_methods.length === 0) return setError("Selecione pelo menos uma forma de pagamento.");
    if (f.pix_key.trim() && normalizePixKey(f.pix_key).length < 5) return setError("Chave Pix inválida.");
    if (f.online_payment !== "off" && setup.methods.length === 0)
      return setError("Pagamento online: marque Pix, cartão ou boleto nas formas aceitas e cadastre uma chave Pix ou conecte o Asaas.");
    if (clinical && !f.accept_private && f.insurances.length === 0)
      return setError("Cadastre pelo menos um convênio ou aceite atendimento particular.");
    setSaving(true);
    try {
      const nb = { ...f, name: f.name.trim(), phone: onlyDigits(f.phone) };
      await api.updateBusiness(nb);
      setBusiness(nb);
      toast("Configurações salvas.");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Configurações" action={<Button loading={saving} onClick={save}>Salvar alterações</Button>} />
      <div className="space-y-6">
        <Card>
          <h2 className="mb-4 font-semibold">Seu negócio</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Tipo">
              <Select value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value as Segment })}>
                {(Object.keys(SEGMENTS) as Segment[]).map((s) => <option key={s} value={s}>{SEGMENTS[s].label}</option>)}
              </Select>
            </Field>
            <Field label="WhatsApp"><Input value={f.phone} inputMode="tel" onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} /></Field>
            <Field label="Link de agendamento" hint={hostPrefix() + f.slug}>
              <Input value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} />
            </Field>
            <div className="sm:col-span-2"><Field label="Endereço"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Rua, número — bairro, cidade/UF" /></Field></div>
            <div className="sm:col-span-2"><Field label="Sobre (aparece na sua página)"><Textarea rows={2} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} /></Field></div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Horário de funcionamento</h2>
          <HoursEditor value={f.hours} onChange={(h) => setF({ ...f, hours: h })} />
        </Card>

        {clinical && (
          <Card>
            <h2 className="font-semibold">Convênios e particular</h2>
            <p className="mt-0.5 mb-4 text-sm text-zinc-500">O paciente escolhe a forma de atendimento ao agendar e informa o número da carteirinha.</p>
            <div className="flex flex-wrap gap-2">
              {f.insurances.length === 0 && <span className="text-sm text-zinc-400">Nenhum convênio cadastrado — só atendimento particular.</span>}
              {f.insurances.map((i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 py-1 pr-1.5 pl-3 text-sm font-semibold text-sky-700 ring-1 ring-sky-200">
                  {i}
                  <button
                    onClick={() => setF({ ...f, insurances: f.insurances.filter((x) => x !== i) })}
                    className="grid h-5 w-5 place-items-center rounded-full hover:bg-sky-100"
                    aria-label={`Remover ${i}`}
                  >
                    
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex max-w-md gap-2">
              <Input placeholder="Ex.: Unimed, Bradesco Saúde, SulAmérica…" value={newIns} onChange={(e) => setNewIns(e.target.value)} onKeyDown={onInsKey} />
              <Button variant="secondary" onClick={addIns}>Adicionar</Button>
            </div>
            <div className="mt-4">
              <Toggle checked={f.accept_private} onChange={(v) => setF({ ...f, accept_private: v })} label="Também atendo particular" />
            </div>
          </Card>
        )}

        <Card>
          <h2 className="font-semibold">Formas de pagamento aceitas</h2>
          <p className="mt-0.5 mb-4 text-sm text-zinc-500">
            Aparecem na sua página de agendamento. Ao marcar um atendimento como concluído, você registra como o {SEGMENTS[f.segment].client.toLowerCase()} pagou.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PAYMENT_METHODS.map((m) => {
              const on = f.payment_methods.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setF({ ...f, payment_methods: on ? f.payment_methods.filter((x) => x !== m.id) : [...f.payment_methods, m.id] })}
                  className={cx(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold ring-1 transition",
                    on ? "bg-brand-50 text-brand-700 ring-2 ring-brand-600" : "bg-white text-zinc-500 ring-zinc-200 hover:bg-zinc-50",
                  )}
                >
                  <span className="flex-1">{m.label}</span>
                  <span className={cx("grid h-5 w-5 place-items-center rounded-md text-[11px] text-white", on ? "bg-brand-600" : "ring-1 ring-zinc-300")}>{on && "✓"}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold">Pagamento online pelo site</h2>
          <p className="mt-0.5 mb-4 text-sm text-zinc-500">
            O {SEGMENTS[f.segment].client.toLowerCase()} paga na hora de agendar (Pix, cartão ou boleto) e o comprovante mostra “Pago”. Reduz faltas.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["off", "Desligado", "Pagamento só no local"],
              ["optional", "Opcional", "O cliente escolhe pagar agora ou no local"],
              ["required", "Obrigatório", "Pagamento antecipado para garantir o horário"],
            ] as [OnlinePaymentMode, string, string][]).map(([v, t, d]) => (
              <button
                key={v}
                type="button"
                onClick={() => setF({ ...f, online_payment: v })}
                className={cx(
                  "rounded-2xl px-4 py-3 text-left ring-1 transition",
                  f.online_payment === v ? "bg-brand-50 ring-2 ring-brand-600" : "bg-white ring-zinc-200 hover:bg-zinc-50",
                )}
              >
                <span className={cx("block text-sm font-semibold", f.online_payment === v ? "text-brand-700" : "text-zinc-800")}>{t}</span>
                <span className="block text-xs text-zinc-500">{d}</span>
              </button>
            ))}
          </div>

          {f.online_payment !== "off" && (
            <div className="mt-5 space-y-5">
              <div className="rounded-2xl p-4 ring-1 ring-zinc-200">
                <h3 className="text-sm font-semibold">Pix direto na sua chave <span className="font-normal text-zinc-500">· sem taxa</span></h3>
                <p className="mt-0.5 mb-3 text-xs text-zinc-500">
                  O sistema gera o QR Code com o valor certo. O cliente avisa “Já fiz o Pix” e você confere no extrato e confirma na agenda.
                  {f.gateway === "asaas" && <> <b>Com o Asaas conectado, o Pix é gerado pelo Asaas (baixa automática).</b></>}
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Chave Pix" hint="CPF, CNPJ, e-mail, celular ou aleatória">
                    <Input value={f.pix_key} onChange={(e) => setF({ ...f, pix_key: e.target.value })} placeholder="sua@chave.com" />
                  </Field>
                  <Field label="Nome do recebedor" hint="Como aparece no app do banco">
                    <Input value={f.pix_name} maxLength={25} placeholder={f.name.slice(0, 25)} onChange={(e) => setF({ ...f, pix_name: e.target.value })} />
                  </Field>
                  <Field label="Cidade">
                    <Input value={f.pix_city} maxLength={15} placeholder="Campinas" onChange={(e) => setF({ ...f, pix_city: e.target.value })} />
                  </Field>
                </div>
              </div>

              <div className="rounded-2xl p-4 ring-1 ring-zinc-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Cartão, boleto e Pix automático <span className="font-normal text-zinc-500">· via Asaas</span></h3>
                  {f.gateway === "asaas" ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">✓ Conectado</span>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200">Não conectado</span>
                  )}
                </div>
                <p className="mt-0.5 mb-3 text-xs text-zinc-500">
                  O dinheiro cai direto na <b>sua</b> conta Asaas. Crédito aprova na hora (até 6x); Pix e boleto têm baixa automática. Pegue a chave em
                  Asaas → Integrações → Chave de API.
                </p>
                {f.gateway === "asaas" ? (
                  <Button variant="danger" size="sm" loading={connecting} onClick={() => connect(false)}>Desconectar Asaas</Button>
                ) : (
                  <div className="flex max-w-xl gap-2">
                    <Input type="password" value={apiKey} placeholder="$aact_..." onChange={(e) => setApiKey(e.target.value)} />
                    <Button variant="secondary" loading={connecting} onClick={() => connect(true)}>Conectar</Button>
                  </div>
                )}
                {demo && (
                  <p className="mt-3 text-xs text-sky-700">
                    Versão local: cartão e boleto funcionam em <b>simulação</b>, mesmo sem conectar. Cartão de teste 4242 4242 4242 4242 (final 0002 = recusado).
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="text-zinc-500">Na sua página, o cliente poderá pagar com:</span>
                {setup.methods.length ? (
                  setup.methods.map((m) => {
                    const pm = PAYMENT_METHODS.find((x) => x.id === m)!;
                    return <span key={m} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">{pm.short}</span>;
                  })
                ) : (
                  <span className="text-xs font-semibold text-rose-600">nenhuma forma ainda — cadastre a chave Pix ou conecte o Asaas</span>
                )}
              </div>
              <p className="text-xs text-zinc-400">Boleto só aparece para horários com mais de 3 dias de antecedência. Convênios não pagam pelo site.</p>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Regras de agendamento</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Intervalo entre horários" hint="De quanto em quanto tempo aparecem as opções">
              <Select value={f.slot_interval} onChange={(e) => setF({ ...f, slot_interval: Number(e.target.value) })}>
                {[10, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n} minutos</option>)}
              </Select>
            </Field>
            <Field label="Antecedência mínima" hint="Evita agendamentos em cima da hora">
              <Select value={f.min_notice} onChange={(e) => setF({ ...f, min_notice: Number(e.target.value) })}>
                {[[0, "Nenhuma"], [30, "30 minutos"], [60, "1 hora"], [120, "2 horas"], [240, "4 horas"], [1440, "1 dia"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Agenda aberta até" hint="Quantos dias à frente o cliente vê">
              <Select value={f.max_days_ahead} onChange={(e) => setF({ ...f, max_days_ahead: Number(e.target.value) })}>
                {[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{n} dias</option>)}
              </Select>
            </Field>
          </div>
          <div className="mt-5">
            <Toggle checked={f.auto_confirm} onChange={(v) => setF({ ...f, auto_confirm: v })} label="Confirmar agendamentos automaticamente" />
            <p className="mt-1 pl-[52px] text-xs text-zinc-500">Desligado: cada pedido chega como “Aguardando” e você confirma no painel.</p>
          </div>
        </Card>

        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end"><Button loading={saving} onClick={save} size="lg">Salvar alterações</Button></div>
        {api.mode === "demo" && <p className="text-center text-xs text-zinc-400">Versão local — conecte o Supabase para guardar os dados na nuvem.</p>}
      </div>
    </>
  );
}

/**
 * Tela de pagamento (Pix, crédito, débito, boleto) reutilizada no comprovante do agendamento
 * e no "Meu plano" (modo local). Quem efetivamente cobra é o `onPay` recebido:
 * modo local = simulação · Supabase = Edge Function com o Asaas do estabelecimento.
 * Nada de cartão é guardado aqui — no máximo bandeira, final e token do processador (se o cliente vincular).
 */
import { useMemo, useState } from "react";
import {
  BRAND_LABEL,
  cardBrand,
  installmentOptions,
  itfBars,
  luhn,
  maskCardNumber,
  maskCep,
  maskCvv,
  maskExpiry,
  paymentShort,
  validCvv,
  validExpiry,
  type OnlineMethod,
  type PayRequest,
  type PayResult,
  type SavedCard,
} from "../lib/payments";
import { qrPath } from "../lib/qr";
import { brl, isValidCpf, isValidEmail, maskCpf, onlyDigits } from "../lib/format";
import { getSavedCard, removeSavedCard, saveCard } from "../lib/clientDevice";
import { Alert, Button, Field, Input, Select, Spinner, cx } from "./ui";
import { errMsg } from "./Toast";

const LABEL: Record<OnlineMethod, string> = { pix: "Pix", credito: "Crédito", debito: "Débito", boleto: "Boleto" };

export interface CheckoutProps {
  amount: number; // centavos
  methods: OnlineMethod[];
  initialMethod?: OnlineMethod;
  defaults?: { cpf?: string; email?: string };
  onPay: (req: PayRequest) => Promise<PayResult>;
  /** Cartão aprovado na hora (ou o pai detectou o pagamento). */
  onPaid: (info: string) => void;
  /** Só no modo local: botão "Simular pagamento" para Pix/boleto. */
  onSimulate?: () => Promise<void>;
  /** Pix direto na chave do estabelecimento: o cliente avisa que pagou. */
  onReport?: () => Promise<void>;
  /** Permite vincular o cartão neste aparelho (cliente final). */
  allowSaveCard?: boolean;
  /** Texto do botão principal (ex.: "Pagar R$ 89,90"). */
  payLabel?: string;
}

export function PaymentCheckout(p: CheckoutProps) {
  const [method, setMethod] = useState<OnlineMethod>(p.initialMethod && p.methods.includes(p.initialMethod) ? p.initialMethod : p.methods[0]);
  const [result, setResult] = useState<PayResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);

  const [cpf, setCpf] = useState(p.defaults?.cpf ? maskCpf(p.defaults.cpf) : "");
  const [email, setEmail] = useState(p.defaults?.email ?? "");
  const [card, setCard] = useState({ number: "", holder: "", expiry: "", cvv: "", postal_code: "", address_number: "" });
  const [installments, setInstallments] = useState(1);
  const [remember, setRemember] = useState(false);
  const [saved, setSaved] = useState<SavedCard | null>(null);
  const [useSaved, setUseSaved] = useState(true);
  const [savedCvv, setSavedCvv] = useState("");

  const isCard = method === "credito" || method === "debito";
  const linked = isCard && useSaved ? (saved?.kind === method ? saved : getSavedCard(method)) : null;
  const brand = cardBrand(card.number);
  const parcelas = useMemo(() => installmentOptions(p.amount), [p.amount]);

  function pick(m: OnlineMethod) {
    if (m === method) return;
    setMethod(m);
    setResult(null);
    setError("");
    setReported(false);
    setUseSaved(true);
  }

  async function pay() {
    setError("");
    if (!isValidCpf(cpf)) return setError(isCard ? "Informe o CPF do titular do cartão." : "Informe um CPF válido de quem vai pagar.");
    if (!isValidEmail(email)) return setError("E-mail inválido.");
    if (isCard && !linked) {
      if (!luhn(card.number)) return setError("Número do cartão inválido.");
      if (card.holder.trim().length < 3) return setError("Informe o nome como está no cartão.");
      if (!validExpiry(card.expiry)) return setError("Validade inválida ou cartão vencido.");
      if (!validCvv(card.cvv, brand)) return setError("CVV inválido.");
      if (method === "credito" && (onlyDigits(card.postal_code).length !== 8 || !card.address_number.trim()))
        return setError("Informe CEP e número do endereço da fatura.");
    }
    if (linked && !/^\d{3,4}$/.test(savedCvv)) return setError("Informe o CVV do cartão.");
    setBusy(true);
    try {
      const r = await p.onPay({
        method,
        cpf: onlyDigits(cpf),
        email: email.trim(),
        installments: method === "credito" ? installments : 1,
        card: isCard && !linked ? card : undefined,
        saved: linked ? { ...linked, cvv: savedCvv } : undefined,
        save_card: isCard && !linked && remember,
      });
      if (r.saved_card) {
        saveCard(r.saved_card);
        setSaved(r.saved_card);
      }
      if (r.status === "paid") return p.onPaid(r.info ?? paymentShort(method));
      if (r.status === "redirect" && r.invoice_url) window.open(r.invoice_url, "_blank", "noopener");
      setResult(r);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function run(fn?: () => Promise<void>, after?: () => void) {
    if (!fn) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      after?.();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {p.methods.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {p.methods.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => pick(m)}
              className={cx("rounded-xl border px-3.5 py-2 text-sm font-semibold transition", method === m ? "accent-ring" : "border-zinc-200 bg-white hover:border-zinc-400")}
            >
              {LABEL[m]}
            </button>
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
        <span className="text-sm text-zinc-500">Total a pagar</span>
        <b className="text-xl">{brl(p.amount)}</b>
      </div>

      {/* ---------- Pix / boleto já gerados ---------- */}
      {result?.pix && (
        <div className="space-y-3">
          <div className="text-center">
            <div className="inline-block rounded-2xl bg-white p-2 ring-1 ring-zinc-200" style={{ background: "#fff" }}>
              {result.pix.image ? (
                <img src={`data:image/png;base64,${result.pix.image}`} alt="QR Code Pix" width={208} height={208} />
              ) : (
                <PixQr payload={result.pix.payload} />
              )}
            </div>
            <p className="mt-2 text-sm text-zinc-600">Abra o app do seu banco, escolha <b>Pix → Pagar com QR Code</b> e aponte a câmera.</p>
          </div>
          <CopyBox label="Ou use o Pix copia e cola" value={result.pix.payload} button="Copiar código Pix" />
          {result.manual ? (
            reported ? (
              <Alert kind="info">✓ Aviso enviado! O estabelecimento vai conferir o Pix e confirmar seu pagamento.</Alert>
            ) : (
              <Button className="w-full" size="lg" loading={busy} onClick={() => run(p.onReport, () => setReported(true))}>
                ✓ Já fiz o Pix
              </Button>
            )
          ) : p.onSimulate ? (
            <Button className="w-full" size="lg" loading={busy} onClick={() => run(p.onSimulate)}>Simular pagamento do Pix</Button>
          ) : (
            <Waiting text="Aguardando a confirmação do Pix… esta tela atualiza sozinha." />
          )}
        </div>
      )}

      {result?.boleto && (
        <div className="space-y-3">
          <Barcode digits={result.boleto.barcode} />
          <CopyBox label="Linha digitável" value={result.boleto.line} button="Copiar linha digitável" mono />
          <p className="text-sm text-zinc-500">
            Vencimento: <b className="text-zinc-800">{new Date(result.boleto.due).toLocaleDateString("pt-BR")}</b> · compensação em até 3 dias úteis.
            {!result.boleto.pdf_url && p.onSimulate && " (Boleto de demonstração — não pode ser pago.)"}
          </p>
          {result.boleto.pdf_url && (
            <a href={result.boleto.pdf_url} target="_blank" rel="noreferrer" className="block">
              <Button variant="secondary" className="w-full">Abrir boleto em PDF</Button>
            </a>
          )}
          {p.onSimulate ? (
            <Button className="w-full" size="lg" loading={busy} onClick={() => run(p.onSimulate)}>Simular compensação do boleto</Button>
          ) : (
            <Waiting text="Assim que o banco compensar, o pagamento aparece aqui." />
          )}
        </div>
      )}

      {result?.status === "redirect" && (
        <div className="space-y-3">
          <Alert kind="info">Abrimos a página segura de pagamento em outra aba. Conclua lá e volte aqui.</Alert>
          {result.invoice_url && (
            <a href={result.invoice_url} target="_blank" rel="noreferrer" className="block">
              <Button className="w-full" size="lg">Abrir página de pagamento →</Button>
            </a>
          )}
          <Waiting text="Aguardando a confirmação do banco…" />
        </div>
      )}

      {/* ---------- Formulário ---------- */}
      {!result && (
        <div className="space-y-3">
          {method === "debito" && (
            <Alert kind="info">Débito online: o valor sai direto da sua conta e o banco pode pedir confirmação no app.</Alert>
          )}

          {isCard &&
            (linked ? (
              <>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
                  <div>
                    <p className="font-semibold">{linked.brand} •••• {linked.last4}</p>
                    <p className="text-xs text-zinc-500">{linked.holder} · vinculado neste aparelho</p>
                  </div>
                  <div className="flex shrink-0 gap-3 text-sm font-semibold">
                    <button type="button" className="text-brand-600 hover:underline" onClick={() => setUseSaved(false)}>Usar outro</button>
                    <button
                      type="button"
                      className="text-rose-600 hover:underline"
                      onClick={() => {
                        removeSavedCard(method as SavedCard["kind"]);
                        setSaved(null);
                        setUseSaved(false);
                      }}
                    >
                      Remover
                    </button>
                  </div>
                </div>
                <Field label="CVV">
                  <Input className="max-w-[120px]" type="password" inputMode="numeric" placeholder="123" value={savedCvv} onChange={(e) => setSavedCvv(maskCvv(e.target.value))} />
                </Field>
              </>
            ) : (
              <>
                <div
                  className="rounded-2xl p-4 text-white shadow-sm"
                  style={{ background: "#1e3a8a" }}
                >
                  <div className="flex justify-between text-xs font-semibold tracking-wide uppercase opacity-90">
                    <span>{method === "credito" ? "Crédito" : "Débito"}</span>
                    <span>{BRAND_LABEL[brand]}</span>
                  </div>
                  <p className="mt-5 mb-3 font-mono text-lg tracking-[2px]">{card.number || "•••• •••• •••• ••••"}</p>
                  <div className="flex justify-between text-xs uppercase opacity-90">
                    <span className="truncate pr-3">{card.holder || "Nome no cartão"}</span>
                    <span>{card.expiry || "MM/AA"}</span>
                  </div>
                </div>
                <Field label="Número do cartão">
                  <Input inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={card.number} onChange={(e) => setCard({ ...card, number: maskCardNumber(e.target.value) })} />
                </Field>
                <Field label="Nome impresso no cartão">
                  <Input autoComplete="cc-name" placeholder="COMO ESTÁ NO CARTÃO" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value.toUpperCase() })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Validade">
                    <Input inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: maskExpiry(e.target.value) })} />
                  </Field>
                  <Field label="CVV">
                    <Input type="password" inputMode="numeric" autoComplete="cc-csc" placeholder={brand === "amex" ? "1234" : "123"} value={card.cvv} onChange={(e) => setCard({ ...card, cvv: maskCvv(e.target.value) })} />
                  </Field>
                </div>
                {method === "credito" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="CEP da fatura">
                      <Input inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={card.postal_code} onChange={(e) => setCard({ ...card, postal_code: maskCep(e.target.value) })} />
                    </Field>
                    <Field label="Nº do endereço">
                      <Input value={card.address_number} onChange={(e) => setCard({ ...card, address_number: e.target.value.slice(0, 10) })} />
                    </Field>
                  </div>
                )}
              </>
            ))}

          <div className={cx("grid gap-3", isCard && "sm:grid-cols-2")}>
            <Field label={isCard ? "CPF do titular" : "CPF de quem vai pagar"}>
              <Input inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} />
            </Field>
            {isCard && (
              <Field label="E-mail para o comprovante (opcional)">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            )}
          </div>

          {method === "credito" && parcelas.length > 1 && (
            <Field label="Parcelas">
              <Select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                {parcelas.map((n) => (
                  <option key={n} value={n}>
                    {n}x de {brl(Math.ceil(p.amount / n))} {n > 1 ? "sem juros" : "à vista"}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {isCard && !linked && p.allowSaveCard && (
            <label className="flex items-start gap-2 text-sm text-zinc-600">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>
                {method === "debito" ? "Vincular este cartão de débito" : "Salvar este cartão"} neste aparelho
                <span className="block text-xs text-zinc-400">Guardamos só a bandeira e os 4 últimos dígitos. O CVV é pedido a cada pagamento.</span>
              </span>
            </label>
          )}

          {error && <Alert>{error}</Alert>}
          <Button className="w-full" size="lg" loading={busy} onClick={pay}>
            {method === "pix" ? "Gerar QR Code Pix" : method === "boleto" ? "Gerar boleto" : p.payLabel ?? `Pagar ${brl(p.amount)}`}
          </Button>
        </div>
      )}

      {result && error && <div className="mt-3"><Alert>{error}</Alert></div>}

      <p className="mt-4 text-center text-xs text-zinc-400">
        Os dados do cartão vão direto ao processador de pagamento. O AgendNow não guarda número de cartão nem CVV.
      </p>
    </div>
  );
}

function PixQr({ payload }: { payload: string }) {
  const { d, size } = useMemo(() => qrPath(payload), [payload]);
  return (
    <svg viewBox={`-4 -4 ${size + 8} ${size + 8}`} width={208} height={208} shapeRendering="crispEdges" role="img" aria-label="QR Code Pix">
      <rect x={-4} y={-4} width={size + 8} height={size + 8} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

function Barcode({ digits }: { digits: string }) {
  const { rects, width } = useMemo(() => {
    let x = 0;
    const r: { x: number; w: number }[] = [];
    itfBars(digits).forEach((o) => {
      if (o.bar) r.push({ x, w: o.w });
      x += o.w;
    });
    return { rects: r, width: x };
  }, [digits]);
  return (
    <svg viewBox={`0 0 ${width} 50`} preserveAspectRatio="none" className="h-14 w-full rounded-lg p-1.5" style={{ background: "#fff" }} role="img" aria-label="Código de barras do boleto">
      {rects.map((r, i) => <rect key={i} x={r.x} width={r.w} height={50} fill="#000" />)}
    </svg>
  );
}

function CopyBox({ label, value, button, mono }: { label: string; value: string; button: string; mono?: boolean }) {
  const [txt, setTxt] = useState(button);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setTxt("✓ Copiado!");
    } catch {
      setTxt("Selecione o texto e copie");
    }
    setTimeout(() => setTxt(button), 2500);
  }
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-zinc-700">{label}</span>
      <textarea
        readOnly
        rows={mono ? 2 : 3}
        value={value}
        onFocus={(e) => e.target.select()}
        className="w-full resize-none rounded-xl border-0 bg-zinc-50 px-3.5 py-2.5 font-mono text-xs break-all text-zinc-800 ring-1 ring-zinc-200"
      />
      <Button variant="secondary" className="mt-2 w-full" onClick={copy}>{txt}</Button>
    </div>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-500 ring-1 ring-zinc-200">
      <Spinner /> {text}
    </div>
  );
}

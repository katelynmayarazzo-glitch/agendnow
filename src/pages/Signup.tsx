import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, onboardBusiness } from "../lib/api";
import { useAuth } from "../lib/auth";
import { SEGMENTS } from "../lib/segments";
import type { Segment } from "../lib/types";
import { hostPrefix, isValidPhone, maskPhone, slugify } from "../lib/format";
import { Alert, Button, Field, Input, cx } from "../components/ui";
import { errMsg } from "../components/Toast";
import { AuthShell } from "./Login";

const RESERVED = new Set(["painel", "entrar", "criar-conta", "definir-senha", "agendamento", "api", "admin", "login", "app", "www"]);

export default function Signup() {
  const { user, business, loading: authLoading, refresh } = useAuth();
  const nav = useNavigate();
  // Etapa 1: conta. Etapa 2: negócio (pula a 1 se já estiver logado).
  const [step, setStep] = useState<1 | 2>(1);
  const [acc, setAcc] = useState({ name: "", email: "", password: "" });
  const [biz, setBiz] = useState({ name: "", slug: "", segment: "barbearia" as Segment, phone: "" });
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugOk, setSlugOk] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user && !business) setStep(2);
  }, [user, business]);

  useEffect(() => {
    if (!slugEdited) setBiz((b) => ({ ...b, slug: slugify(b.name) }));
  }, [biz.name, slugEdited]);

  useEffect(() => {
    setSlugOk(null);
    if (biz.slug.length < 3) return;
    if (RESERVED.has(biz.slug)) return setSlugOk(false);
    const t = setTimeout(() => api.isSlugAvailable(biz.slug).then(setSlugOk).catch(() => setSlugOk(null)), 350);
    return () => clearTimeout(t);
  }, [biz.slug]);

  if (!authLoading && user && business) return <Navigate to="/painel" replace />;

  async function submitAccount(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (acc.password.length < 6) return setError("A senha precisa ter pelo menos 6 caracteres.");
    setLoading(true);
    try {
      await api.signUp(acc.email, acc.password);
      await refresh();
      setStep(2);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  async function submitBusiness(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (biz.name.trim().length < 2) return setError("Informe o nome do negócio.");
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(biz.slug)) return setError("Endereço inválido: use letras, números e hífen (mín. 3).");
    if (slugOk === false) return setError("Esse endereço já está em uso.");
    if (!isValidPhone(biz.phone)) return setError("Informe o WhatsApp do negócio com DDD.");
    setLoading(true);
    try {
      await onboardBusiness(biz, acc.name);
      await refresh();
      nav("/painel?bemvindo=1");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  if (step === 1)
    return (
      <AuthShell title="Crie sua conta grátis" sub="14 dias para testar tudo, sem cartão.">
        <form onSubmit={submitAccount} className="space-y-4">
          <Field label="Seu nome">
            <Input required value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} autoComplete="name" />
          </Field>
          <Field label="E-mail">
            <Input type="email" required value={acc.email} onChange={(e) => setAcc({ ...acc, email: e.target.value })} autoComplete="email" />
          </Field>
          <Field label="Senha" hint="Mínimo de 6 caracteres">
            <Input type="password" required value={acc.password} onChange={(e) => setAcc({ ...acc, password: e.target.value })} autoComplete="new-password" />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={loading} className="w-full" size="lg">Continuar</Button>
        </form>
        <p className="mt-5 text-center text-sm text-zinc-500">
          Já tem conta? <Link to="/entrar" className="font-semibold text-brand-600 hover:underline">Entrar</Link>
        </p>
      </AuthShell>
    );

  return (
    <AuthShell title="Sobre o seu negócio" sub="Dá pra mudar tudo isso depois.">
      <form onSubmit={submitBusiness} className="space-y-4">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-zinc-700">Tipo de atendimento</span>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(SEGMENTS) as Segment[]).map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setBiz({ ...biz, segment: s })}
                className={cx(
                  "rounded-xl border px-3 py-2.5 text-left text-sm transition",
                  biz.segment === s ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-zinc-200 hover:border-zinc-400",
                )}
              >
                {SEGMENTS[s].label}
              </button>
            ))}
          </div>
        </div>
        <Field label="Nome do negócio">
          <Input required value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} placeholder="Ex.: Barbearia do Zé" />
        </Field>
        <Field
          label="Seu link de agendamento"
          error={slugOk === false ? "Esse endereço não está disponível." : ""}
          hint={slugOk ? "✓ Disponível" : "Letras minúsculas, números e hífen."}
        >
          <div className="flex items-center rounded-xl ring-1 ring-zinc-300 focus-within:ring-2 focus-within:ring-brand-600">
            <span className="pl-3.5 text-sm text-zinc-400">{hostPrefix()}</span>
            <input
              className="w-full rounded-r-xl bg-transparent py-2.5 pr-3.5 text-sm outline-none"
              value={biz.slug}
              onChange={(e) => {
                setSlugEdited(true);
                setBiz({ ...biz, slug: slugify(e.target.value) });
              }}
            />
          </div>
        </Field>
        <Field label="WhatsApp do negócio">
          <Input value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: maskPhone(e.target.value) })} inputMode="tel" placeholder="(11) 99999-9999" />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={loading} className="w-full" size="lg">Criar minha agenda</Button>
      </form>
    </AuthShell>
  );
}

import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Button, Field, Input, Logo } from "../components/ui";
import { errMsg } from "../components/Toast";
import { ThemeToggle } from "../components/ThemeToggle";
import { SUPPORT_PHONE } from "../lib/config";
import { appUrl, maskPhone, whatsappLink } from "../lib/format";

export function AuthShell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-grad-soft relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <ThemeToggle className="absolute top-4 right-4" />
      <Link to="/" className="relative"><Logo /></Link>
      <div className="fade-up relative mt-8 w-full max-w-sm rounded-3xl bg-white/90 p-7 shadow-sm ring-1 ring-zinc-100 backdrop-blur">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{sub}</p>
        <div className="mt-6">{children}</div>
      </div>
      <a href={whatsappLink(SUPPORT_PHONE, "Olá! Preciso de ajuda para acessar o AgendNow.")} target="_blank" rel="noreferrer" className="relative mt-5 text-sm text-zinc-500 hover:text-brand-600">
        Precisa de ajuda? Suporte no WhatsApp {maskPhone(SUPPORT_PHONE)}
      </a>
    </div>
  );
}

export default function Login() {
  const [qs] = useSearchParams();
  const demoEmail = qs.get("email");
  const [email, setEmail] = useState(demoEmail ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forgot, setForgot] = useState(false);
  const [resetDone, setResetDone] = useState<{ url?: string } | null>(null);
  const { user, refresh } = useAuth();
  const nav = useNavigate();

  if (user) return <Navigate to="/painel" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.signIn(email, password);
      await refresh();
      nav("/painel");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  async function sendReset(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Informe o seu e-mail de login.");
    setLoading(true);
    try {
      const r = await api.requestPasswordReset(email);
      setResetDone({ url: r.token ? appUrl(`/definir-senha?token=${r.token}`) : undefined });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  if (forgot)
    return (
      <AuthShell title="Esqueci minha senha" sub="Enviamos um link para você criar uma senha nova.">
        {resetDone ? (
          <div className="space-y-4 text-sm">
            <Alert kind="success">Se <b>{email}</b> tiver acesso ao AgendNow, o link chega em instantes. Confira também o spam.</Alert>
            {resetDone.url && (
              <Alert kind="info">
                <b>Versão local (sem e-mail):</b>{" "}
                <a className="font-semibold underline" href={resetDone.url}>abrir o link de redefinição</a>
              </Alert>
            )}
          </div>
        ) : (
          <form onSubmit={sendReset} className="space-y-4">
            <Field label="E-mail de login">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
            </Field>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" loading={loading} className="w-full" size="lg">Enviar link</Button>
          </form>
        )}
        <button onClick={() => { setForgot(false); setResetDone(null); setError(""); }} className="mt-5 w-full text-center text-sm font-semibold text-brand-600 hover:underline">
          ← Voltar para entrar
        </button>
      </AuthShell>
    );

  return (
    <AuthShell title="Entrar no painel" sub="Acesse a agenda do seu negócio.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Senha">
          <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <div className="-mt-2 text-right">
          <button type="button" onClick={() => { setForgot(true); setError(""); }} className="text-sm font-semibold text-brand-600 hover:underline">
            Esqueci minha senha
          </button>
        </div>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={loading} className="w-full" size="lg">Entrar</Button>
      </form>
      <p className="mt-5 text-center text-sm text-zinc-500">
        Ainda não tem conta? <Link to="/criar-conta" className="font-semibold text-brand-600 hover:underline">Criar grátis</Link>
      </p>
    </AuthShell>
  );
}

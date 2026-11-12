/** Criar/redefinir senha pelo link recebido por e-mail (convite de usuário ou "esqueci minha senha"). */
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Button, Field, Input, Spinner } from "../components/ui";
import { errMsg } from "../components/Toast";
import { AuthShell } from "./Login";

export default function SetPassword() {
  const [qs] = useSearchParams();
  const token = qs.get("token");
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [check, setCheck] = useState<{ ok: boolean; email?: string; name?: string } | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.checkPasswordLink(token).then(setCheck).catch(() => setCheck({ ok: false }));
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (pw.length < 6) return setError("A senha precisa ter pelo menos 6 caracteres.");
    if (pw !== pw2) return setError("As senhas não são iguais.");
    setLoading(true);
    try {
      await api.setPasswordFromLink(token, pw);
      await refresh();
      nav("/painel");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  if (!check)
    return (
      <AuthShell title="Criar senha" sub="Verificando o seu link…">
        <div className="flex justify-center py-6 text-zinc-400"><Spinner className="h-6 w-6" /></div>
      </AuthShell>
    );

  if (!check.ok)
    return (
      <AuthShell title="Link inválido ou expirado" sub="Esse link já foi usado ou passou do prazo.">
        <p className="text-sm text-zinc-600">
          Peça um novo convite para quem te cadastrou, ou use <b>“Esqueci minha senha”</b> na tela de entrar.
        </p>
        <Link to="/entrar"><Button className="mt-5 w-full" size="lg">Ir para entrar</Button></Link>
      </AuthShell>
    );

  const first = check.name?.split(" ")[0];
  return (
    <AuthShell title={first ? `Olá, ${first}! Crie sua senha` : "Crie sua senha"} sub={`Seu login é ${check.email}`}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nova senha" hint="Mínimo de 6 caracteres">
          <Input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus />
        </Field>
        <Field label="Repita a senha">
          <Input type={show ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostrar senha
        </label>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={loading} className="w-full" size="lg">Salvar senha e entrar</Button>
      </form>
    </AuthShell>
  );
}

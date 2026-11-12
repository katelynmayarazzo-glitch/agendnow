/**
 * Usuários: quem acessa o painel da empresa.
 * O dono/admin informa nome e sobrenome + e-mail (que vira o login); a pessoa recebe
 * por e-mail um link para criar a senha.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import type { Member } from "../../lib/types";
import { appUrl, isValidEmail } from "../../lib/format";
import { useAuth } from "../../lib/auth";
import { Alert, Button, Card, Empty, Field, Input, Modal, PageLoader, Select, cx } from "../../components/ui";
import { errMsg, useToast } from "../../components/Toast";
import { PageHeader, useAdmin } from "./AdminLayout";

const ROLE_INFO = {
  owner: { label: "Dono", style: "bg-grad text-white ring-transparent", desc: "Acesso total, inclusive plano e pagamentos." },
  admin: { label: "Administrador", style: "bg-brand-50 text-brand-700 ring-brand-200", desc: "Tudo, inclusive Ajustes, Meu plano e Usuários." },
  equipe: { label: "Equipe", style: "bg-zinc-100 text-zinc-700 ring-zinc-200", desc: "Agenda, clientes, serviços e profissionais. Sem Ajustes, plano e usuários." },
} as const;

export default function Users() {
  const { business } = useAdmin();
  const { user, role } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<Member[] | null>(null);
  const [f, setF] = useState({ name: "", email: "", role: "equipe" as "admin" | "equipe" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<{ email: string; url: string; invite: boolean } | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const load = useCallback(() => api.listMembers(business.id).then(setList), [business.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setError("");
    const name = f.name.trim().replace(/\s+/g, " ");
    if (name.split(" ").length < 2) return setError("Informe nome e sobrenome.");
    if (!f.email.trim() || !isValidEmail(f.email.trim())) return setError("Informe um e-mail válido — ele será o login.");
    setSaving(true);
    try {
      const r = await api.inviteMember({ business_id: business.id, name, email: f.email.trim(), role: f.role });
      if (r.token) setLink({ email: f.email.trim().toLowerCase(), url: appUrl(`/definir-senha?token=${r.token}`), invite: true });
      else setSentTo(f.email.trim().toLowerCase());
      setF({ name: "", email: "", role: "equipe" });
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function resend(m: Member) {
    try {
      const r = await api.requestPasswordReset(m.email);
      if (r.token) setLink({ email: m.email, url: appUrl(`/definir-senha?token=${r.token}`), invite: false });
      else toast(`Link enviado de novo para ${m.email}.`);
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  async function changeRole(m: Member, r: "admin" | "equipe") {
    try {
      await api.updateMemberRole(m.id, r);
      toast("Permissão atualizada.");
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  async function remove(m: Member) {
    if (!confirm(`Remover o acesso de ${m.name}? A pessoa não vai mais conseguir entrar no painel.`)) return;
    try {
      await api.removeMember(m.id);
      toast("Acesso removido.");
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  if (!list) return <PageLoader />;

  return (
    <>
      <PageHeader title="Usuários" sub={`Quem pode acessar o painel de ${business.name}.`} />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ===== Novo usuário ===== */}
        <Card className="lg:col-span-2">
          <h2 className="font-semibold">Novo usuário</h2>
          <p className="mt-0.5 mb-4 text-sm text-zinc-500">A pessoa recebe um e-mail com o link para criar a senha.</p>
          <form onSubmit={invite} className="space-y-3" noValidate>
            <Field label="Nome e sobrenome">
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Ana Souza" autoComplete="off" />
            </Field>
            <Field label="E-mail (será o login)">
              <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="ana@email.com" autoComplete="off" />
            </Field>
            <Field label="Permissão" hint={ROLE_INFO[f.role].desc}>
              <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as "admin" | "equipe" })}>
                <option value="equipe">Equipe</option>
                <option value="admin">Administrador</option>
              </Select>
            </Field>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" loading={saving} className="w-full" size="lg">Criar acesso e enviar e-mail</Button>
          </form>
        </Card>

        {/* ===== Lista ===== */}
        <div className="space-y-3 lg:col-span-3">
          {role === "owner" && user && (
            <UserRow name="Você" email={user.email} badge="owner" status="active" />
          )}
          {list.length === 0 ? (
            <Empty title="Ninguém da equipe ainda">Crie o primeiro acesso ao lado — por exemplo, para a recepção.</Empty>
          ) : (
            list.map((m) => (
              <UserRow
                key={m.id}
                name={m.user_id === user?.id ? `${m.name} (você)` : m.name}
                email={m.email}
                badge={m.role}
                status={m.status}
                actions={
                  m.user_id !== user?.id && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        className="rounded-lg bg-white px-2 py-1.5 text-xs font-semibold ring-1 ring-zinc-200"
                        value={m.role}
                        onChange={(e) => changeRole(m, e.target.value as "admin" | "equipe")}
                        aria-label="Permissão"
                      >
                        <option value="equipe">Equipe</option>
                        <option value="admin">Administrador</option>
                      </select>
                      <Button size="sm" variant="secondary" onClick={() => resend(m)}>
                        {m.status === "pending" ? "Reenviar convite" : "Enviar link de senha"}
                      </Button>
                      <Button size="sm" variant="ghost" className="!text-zinc-400 hover:!text-rose-600" onClick={() => remove(m)}>Remover</Button>
                    </div>
                  )
                }
              />
            ))
          )}
          <p className="px-1 text-xs text-zinc-500">
            Cada pessoa entra com o próprio e-mail e senha. Quem é da <b>Equipe</b> não vê Ajustes, Meu plano nem Usuários.
          </p>
        </div>
      </div>

      {/* E-mail enviado (sistema online) */}
      <Modal open={!!sentTo} onClose={() => setSentTo(null)} title="Acesso criado!" footer={<Button onClick={() => setSentTo(null)}>Ok</Button>}>
        <p className="text-sm text-zinc-600">
          Enviamos um e-mail para <b>{sentTo}</b> com o link para criar a senha. Peça para olhar também a caixa de spam.
        </p>
      </Modal>

      {/* Modo local: não há envio de e-mail — mostra o link */}
      <Modal open={!!link} onClose={() => setLink(null)} title={link?.invite ? "Acesso criado!" : "Link para criar a senha"} footer={<Button onClick={() => setLink(null)}>Fechar</Button>}>
        {link && (
          <div className="space-y-3 text-sm">
            <p className="text-zinc-600">
              No sistema online, este link chega por <b>e-mail</b> para <b>{link.email}</b>. Nesta versão local não há envio de e-mail — use o link abaixo:
            </p>
            <div className="flex gap-2">
              <Input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(link.url).then(() => toast("Link copiado!"))}>Copiar</Button>
            </div>
            <Alert kind="info">Na versão local os dados ficam neste navegador: teste abrindo o link em outra aba daqui.</Alert>
          </div>
        )}
      </Modal>
    </>
  );
}

function UserRow({ name, email, badge, status, actions }: { name: string; email: string; badge: keyof typeof ROLE_INFO; status: "pending" | "active"; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="bg-grad grid h-10 w-10 shrink-0 place-items-center rounded-full font-bold text-white">{name.charAt(0).toUpperCase()}</span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <span className="truncate">{name}</span>
            <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", ROLE_INFO[badge].style)}>{ROLE_INFO[badge].label}</span>
            {status === "pending" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">Aguardando criar senha</span>}
          </p>
          <p className="truncate text-sm text-zinc-500">{email}</p>
        </div>
      </div>
      {actions}
    </div>
  );
}

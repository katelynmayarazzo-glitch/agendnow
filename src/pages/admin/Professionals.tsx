import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Professional, Service } from "../../lib/types";
import { Alert, Button, Card, Empty, Field, Input, Modal, PageLoader, Toggle, cx } from "../../components/ui";
import { HoursEditor, hoursValid } from "../../components/HoursEditor";
import { errMsg, useToast } from "../../components/Toast";
import { PageHeader, useAdmin } from "./AdminLayout";

export default function Professionals() {
  const { business, terms } = useAdmin();
  const [list, setList] = useState<Professional[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [edit, setEdit] = useState<Professional | null>(null);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([api.listProfessionals(business.id), api.listServices(business.id)]);
    setList(p);
    setServices(s);
  }, [business.id]);
  useEffect(() => {
    load();
  }, [load]);

  if (!list) return <PageLoader />;

  return (
    <>
      <PageHeader
        title={terms.pros}
        sub="Quem atende, quais serviços faz e em quais horários."
        action={
          <Button onClick={() => setEdit({ id: "", business_id: business.id, name: "", role: terms.pro, service_ids: services.map((s) => s.id), hours: null, active: true })}>
            + Adicionar
          </Button>
        }
      />
      {list.length === 0 ? (
        <Empty title={`Nenhum ${terms.pro.toLowerCase()} cadastrado`} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((p) => (
            <button key={p.id} onClick={() => setEdit(p)} className="text-left">
              <Card className={cx("transition hover:ring-zinc-300", !p.active && "opacity-60")}>
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-600 font-bold text-white">{p.name.replace(/^(Dra?\.\s*)/, "").charAt(0)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="text-sm text-zinc-500">{p.role || terms.pro}</p>
                  </div>
                  <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", p.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500")}>
                    {p.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <p className="mt-3 text-xs text-zinc-500">
                  {p.service_ids.length ? `${p.service_ids.length} serviço(s)` : "Todos os serviços"} · {p.hours ? "Horário próprio" : "Horário do estabelecimento"}
                </p>
              </Card>
            </button>
          ))}
        </div>
      )}
      <ProForm pro={edit} services={services} onClose={() => setEdit(null)} onSaved={load} />
    </>
  );
}

function ProForm({ pro, services, onClose, onSaved }: { pro: Professional | null; services: Service[]; onClose: () => void; onSaved: () => void }) {
  const { business, terms } = useAdmin();
  const toast = useToast();
  const [f, setF] = useState<Professional | null>(pro);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setF(pro);
    setError("");
  }, [pro]);
  if (!f) return null;

  const toggleService = (id: string) =>
    setF({ ...f, service_ids: f.service_ids.includes(id) ? f.service_ids.filter((x) => x !== id) : [...f.service_ids, id] });

  async function save() {
    if (!f) return;
    if (f.name.trim().length < 2) return setError("Informe o nome.");
    if (!f.service_ids.length) return setError("Selecione pelo menos um serviço.");
    if (f.hours && !hoursValid(f.hours)) return setError("Confira os horários: a abertura deve ser antes do fechamento.");
    setSaving(true);
    try {
      await api.saveProfessional({ ...f, name: f.name.trim() });
      toast("Salvo.");
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!f || !confirm(`Remover ${f.name}?`)) return;
    try {
      await api.deleteProfessional(f.id);
      toast("Removido.");
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <Modal open onClose={onClose} title={f.id ? `Editar ${terms.pro.toLowerCase()}` : `Novo ${terms.pro.toLowerCase()}`}
      footer={
        <>
          {f.id && <Button variant="danger" className="mr-auto" onClick={remove}>Excluir</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={save}>Salvar</Button>
        </>
      }>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
          <Field label="Função / especialidade"><Input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-zinc-700">Serviços que realiza</p>
          <div className="flex flex-wrap gap-2">
            {services.map((s) => (
              <button key={s.id} type="button" onClick={() => toggleService(s.id)}
                className={cx("rounded-full px-3 py-1 text-sm ring-1", f.service_ids.includes(s.id) ? "bg-brand-600 text-white ring-brand-600" : "ring-zinc-300 hover:bg-zinc-50")}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Toggle checked={!!f.hours} onChange={(on) => setF({ ...f, hours: on ? { ...business.hours } : null })} label="Horário diferente do estabelecimento" />
          {f.hours && <div className="mt-2 rounded-xl bg-zinc-50 px-3 ring-1 ring-zinc-200"><HoursEditor value={f.hours} onChange={(h) => setF({ ...f, hours: h })} /></div>}
        </div>
        <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Ativo (aparece no agendamento online)" />
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}

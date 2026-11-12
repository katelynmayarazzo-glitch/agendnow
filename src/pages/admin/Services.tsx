import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Service } from "../../lib/types";
import { brl } from "../../lib/format";
import { Alert, Button, Card, Empty, Field, Input, Modal, PageLoader, Textarea, Toggle } from "../../components/ui";
import { errMsg, useToast } from "../../components/Toast";
import { PageHeader, useAdmin } from "./AdminLayout";

export default function Services() {
  const { business } = useAdmin();
  const toast = useToast();
  const [list, setList] = useState<Service[] | null>(null);
  const [edit, setEdit] = useState<Service | null>(null);

  const load = useCallback(() => api.listServices(business.id).then(setList), [business.id]);
  useEffect(() => {
    load();
  }, [load]);

  if (!list) return <PageLoader />;

  async function toggle(s: Service) {
    try {
      await api.saveService({ ...s, active: !s.active });
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Serviços"
        sub="O que aparece para o cliente na hora de agendar."
        action={<Button onClick={() => setEdit({ id: "", business_id: business.id, name: "", description: "", duration: 30, price: 0, active: true })}>+ Novo serviço</Button>}
      />
      {list.length === 0 ? (
        <Empty title="Nenhum serviço cadastrado">Cadastre pelo menos um para começar a receber agendamentos.</Empty>
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-zinc-100">
            {list.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3.5">
                <button className="min-w-0 flex-1 text-left" onClick={() => setEdit(s)}>
                  <p className={`font-semibold ${s.active ? "" : "text-zinc-400 line-through"}`}>{s.name}</p>
                  <p className="truncate text-sm text-zinc-500">{s.duration} min{s.description && ` · ${s.description}`}</p>
                </button>
                <span className="font-semibold">{s.price ? brl(s.price) : "Grátis"}</span>
                <Toggle checked={s.active} onChange={() => toggle(s)} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      <ServiceForm service={edit} onClose={() => setEdit(null)} onSaved={load} />
    </>
  );
}

function ServiceForm({ service, onClose, onSaved }: { service: Service | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<Service | null>(service);
  const [priceTxt, setPriceTxt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setF(service);
    setPriceTxt(service ? (service.price / 100).toFixed(2).replace(".", ",") : "");
    setError("");
  }, [service]);
  if (!f) return null;

  async function save() {
    if (!f) return;
    const price = Math.round(parseFloat(priceTxt.replace(/\./g, "").replace(",", ".") || "0") * 100);
    if (f.name.trim().length < 2) return setError("Informe o nome do serviço.");
    if (!(f.duration >= 5 && f.duration <= 600)) return setError("Duração entre 5 e 600 minutos.");
    if (Number.isNaN(price) || price < 0) return setError("Preço inválido.");
    setSaving(true);
    try {
      await api.saveService({ ...f, name: f.name.trim(), price });
      toast("Serviço salvo.");
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!f || !confirm(`Excluir "${f.name}"?`)) return;
    try {
      await api.deleteService(f.id);
      toast("Serviço excluído.");
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <Modal open onClose={onClose} title={f.id ? "Editar serviço" : "Novo serviço"}
      footer={
        <>
          {f.id && <Button variant="danger" className="mr-auto" onClick={remove}>Excluir</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={save}>Salvar</Button>
        </>
      }>
      <div className="space-y-3">
        <Field label="Nome"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder="Ex.: Corte masculino" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duração (min)">
            <Input type="number" min={5} step={5} value={f.duration} onChange={(e) => setF({ ...f, duration: Number(e.target.value) })} />
          </Field>
          <Field label="Preço (R$)">
            <Input inputMode="decimal" value={priceTxt} onChange={(e) => setPriceTxt(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="0,00" />
          </Field>
        </div>
        <Field label="Descrição (opcional)"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Disponível para agendamento online" />
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}

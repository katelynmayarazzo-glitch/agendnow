import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type ClientWithStats } from "../../lib/api";
import type { AppointmentView, Business, Client, ClinicalNote, Professional } from "../../lib/types";
import type { Terms } from "../../lib/segments";
import {
  brl,
  insuranceLabel,
  isValidCpf,
  isValidEmail,
  isValidPhone,
  maskCpf,
  maskPhone,
  onlyDigits,
  whatsappLink,
} from "../../lib/format";
import { Alert, Button, Card, Empty, Field, Input, Modal, PageLoader, Select, StatusBadge, Textarea, cx } from "../../components/ui";
import { errMsg, useToast } from "../../components/Toast";
import { PageHeader, useAdmin } from "./AdminLayout";
import { NewAppointmentModal } from "./shared";

const blank = (business_id: string): Client => ({
  id: "",
  business_id,
  name: "",
  phone: "",
  email: "",
  birth_date: null,
  cpf: "",
  insurance: "",
  insurance_number: "",
  notes: "",
  created_at: "",
});

function age(birth: string | null) {
  if (!birth) return null;
  const b = new Date(`${birth}T12:00:00`);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

export default function Clients() {
  const { business, terms } = useAdmin();
  const toast = useToast();
  const [list, setList] = useState<ClientWithStats[] | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"name" | "visits" | "recent">("name");
  const [insFilter, setInsFilter] = useState<string>("*");
  const [editing, setEditing] = useState<Client | null>(null);
  const [viewing, setViewing] = useState<ClientWithStats | null>(null);
  const [bookFor, setBookFor] = useState<ClientWithStats | null>(null);

  const load = useCallback(() => api.listClients(business.id).then(setList), [business.id]);
  useEffect(() => {
    load();
  }, [load]);

  // abrir a ficha direto pelo link (ex.: vindo da agenda): ?id=...&aba=prontuario
  const [qs, setQs] = useSearchParams();
  const [openTab, setOpenTab] = useState<"ficha" | "prontuario">("ficha");
  useEffect(() => {
    const id = qs.get("id");
    if (!id || !list) return;
    const c = list.find((x) => x.id === id);
    if (c) {
      setOpenTab(qs.get("aba") === "prontuario" ? "prontuario" : "ficha");
      setViewing(c);
    }
    setQs({}, { replace: true });
  }, [qs, list, setQs]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digits = onlyDigits(q);
    const out = (list ?? []).filter(
      (c) =>
        (!t || c.name.toLowerCase().includes(t) || (digits && (c.phone.includes(digits) || c.cpf.includes(digits))) || c.email.toLowerCase().includes(t)) &&
        (insFilter === "*" || c.insurance === insFilter),
    );
    if (sort === "visits") out.sort((a, b) => b.visits - a.visits);
    if (sort === "recent") out.sort((a, b) => (b.last_visit ?? "").localeCompare(a.last_visit ?? ""));
    return out;
  }, [list, q, sort, insFilter]);

  function exportCsv() {
    const head = ["Nome", "Telefone", "E-mail", "Nascimento"];
    if (terms.clinical) head.push("CPF", "Convênio", "Carteirinha");
    head.push("Visitas", "Total gasto", "Última visita", "Observações");
    const rows = [head];
    (list ?? []).forEach((c) => {
      const r = [c.name, maskPhone(c.phone), c.email, c.birth_date ? new Date(`${c.birth_date}T12:00:00`).toLocaleDateString("pt-BR") : ""];
      if (terms.clinical) r.push(c.cpf ? maskCpf(c.cpf) : "", insuranceLabel(c.insurance), c.insurance_number);
      r.push(String(c.visits), (c.total_spent / 100).toFixed(2).replace(".", ","), c.last_visit ? new Date(c.last_visit).toLocaleDateString("pt-BR") : "", c.notes);
      rows.push(r);
    });
    const csv = "﻿" + rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${terms.clients.toLowerCase()}-${business.slug}.csv`;
    a.click();
    toast("Planilha exportada.");
  }

  if (!list) return <PageLoader />;

  return (
    <>
      <PageHeader
        title={terms.clients}
        sub={`${list.length} cadastrado${list.length === 1 ? "" : "s"}`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportCsv} disabled={!list.length}>Exportar</Button>
            <Button onClick={() => setEditing(blank(business.id))}>+ Novo</Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="max-w-sm flex-1"
          placeholder={terms.clinical ? "Buscar por nome, telefone, CPF ou e-mail" : "Buscar por nome, telefone ou e-mail"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="rounded-xl bg-white px-3 text-sm ring-1 ring-zinc-300" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="name">Nome (A–Z)</option>
          <option value="visits">Mais visitas</option>
          <option value="recent">Visita mais recente</option>
        </select>
        {terms.clinical && business.insurances.length > 0 && (
          <select className="rounded-xl bg-white px-3 text-sm ring-1 ring-zinc-300" value={insFilter} onChange={(e) => setInsFilter(e.target.value)}>
            <option value="*">Todos os convênios</option>
            <option value="">Particular</option>
            {business.insurances.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        )}
      </div>

      {shown.length === 0 ? (
        <Empty title={q ? "Nada encontrado" : `Nenhum ${terms.client.toLowerCase()} ainda`}>
          {!q && "Os cadastros são criados automaticamente quando alguém agenda pelo seu link."}
        </Empty>
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-zinc-100">
            {shown.map((c) => (
              <li key={c.id}>
                <button onClick={() => setViewing(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 font-semibold text-brand-700">{c.name.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block truncate text-sm text-zinc-500">
                      {maskPhone(c.phone)}
                      {terms.clinical ? (c.cpf ? ` · CPF ${maskCpf(c.cpf)}` : "") : c.email && ` · ${c.email}`}
                    </span>
                  </span>
                  {terms.clinical && (
                    <span className={cx("hidden rounded-full px-2 py-0.5 text-xs font-semibold ring-1 sm:block", c.insurance ? "bg-sky-50 text-sky-700 ring-sky-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200")}>
                      {insuranceLabel(c.insurance)}
                    </span>
                  )}
                  <span className="hidden text-right text-sm sm:block">
                    <span className="block font-semibold">{c.visits} {terms.clinical ? "atendimento" : "visita"}{c.visits === 1 ? "" : "s"}</span>
                    <span className="block text-xs text-zinc-500">{brl(c.total_spent)}</span>
                  </span>
                  {c.next_visit && <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 md:block">Agendado</span>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ClientForm client={editing} onClose={() => setEditing(null)} onSaved={() => { load(); setViewing(null); }} terms={terms} business={business} />
      <ClientDetail
        client={viewing}
        onClose={() => { setViewing(null); setOpenTab("ficha"); }}
        onEdit={(c) => { setViewing(null); setEditing(c); }}
        onBook={(c) => { setViewing(null); setBookFor(c); }}
        onDeleted={() => { setViewing(null); load(); }}
        business={business}
        terms={terms}
        initialTab={openTab}
      />
      <NewAppointmentModal open={!!bookFor} onClose={() => setBookFor(null)} onSaved={load} business={business} terms={terms} presetClient={bookFor} />
    </>
  );
}

function ClientForm({ client, onClose, onSaved, terms, business }: { client: Client | null; onClose: () => void; onSaved: () => void; terms: Terms; business: Business }) {
  const toast = useToast();
  const [f, setF] = useState<Client | null>(client);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setF(client ? { ...client, phone: maskPhone(client.phone), cpf: maskCpf(client.cpf) } : null);
    setError("");
  }, [client]);
  if (!f) return null;

  // convênio do paciente pode não estar mais na lista da clínica: mantém na lista para não perder o dado
  const insOptions = Array.from(new Set([...business.insurances, ...(f.insurance ? [f.insurance] : [])]));

  async function save() {
    if (!f) return;
    if (f.name.trim().length < 2) return setError("Informe o nome.");
    if (!isValidPhone(f.phone)) return setError("Celular inválido (use DDD).");
    if (!isValidEmail(f.email)) return setError("E-mail inválido.");
    if (f.cpf && !isValidCpf(f.cpf)) return setError("CPF inválido.");
    setSaving(true);
    try {
      await api.saveClient({ ...f, name: f.name.trim(), email: f.email.trim(), insurance_number: f.insurance ? f.insurance_number.trim() : "" });
      toast("Cadastro salvo.");
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={f.id ? `Editar ${terms.client.toLowerCase()}` : `Novo ${terms.client.toLowerCase()}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
      <div className="space-y-3">
        <Field label="Nome completo"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Celular"><Input value={f.phone} inputMode="tel" onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} /></Field>
          <Field label="E-mail"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        </div>
        {terms.clinical ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="CPF"><Input value={f.cpf} inputMode="numeric" placeholder="000.000.000-00" onChange={(e) => setF({ ...f, cpf: maskCpf(e.target.value) })} /></Field>
              <Field label="Data de nascimento"><Input type="date" value={f.birth_date ?? ""} onChange={(e) => setF({ ...f, birth_date: e.target.value || null })} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Convênio">
                <Select value={f.insurance} onChange={(e) => setF({ ...f, insurance: e.target.value })}>
                  <option value="">Particular</option>
                  {insOptions.map((i) => <option key={i} value={i}>{i}</option>)}
                </Select>
              </Field>
              {f.insurance && (
                <Field label="Nº da carteirinha"><Input value={f.insurance_number} onChange={(e) => setF({ ...f, insurance_number: e.target.value })} /></Field>
              )}
            </div>
            {business.insurances.length === 0 && (
              <p className="text-xs text-zinc-500">Cadastre os convênios aceitos em Ajustes para escolher aqui.</p>
            )}
          </>
        ) : (
          (terms.askBirth || f.birth_date) && (
            <Field label="Data de nascimento"><Input type="date" value={f.birth_date ?? ""} onChange={(e) => setF({ ...f, birth_date: e.target.value || null })} /></Field>
          )
        )}
        <Field label={terms.clinical ? "Observações gerais" : "Observações internas"} hint={terms.clinical ? "Ex.: alergias, medicamentos em uso. Anotações de cada consulta ficam no prontuário." : "Só você vê. Ex.: preferências, alergias, histórico."}>
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}

function ClientDetail({ client, onClose, onEdit, onBook, onDeleted, business, terms, initialTab = "ficha" }: {
  client: ClientWithStats | null; onClose: () => void; onEdit: (c: Client) => void; onBook: (c: ClientWithStats) => void; onDeleted: () => void; business: Business; terms: Terms; initialTab?: "ficha" | "prontuario";
}) {
  const toast = useToast();
  const [hist, setHist] = useState<AppointmentView[] | null>(null);
  const [tab, setTab] = useState<"ficha" | "prontuario">("ficha");
  useEffect(() => {
    setHist(null);
    setTab(terms.clinical ? initialTab : "ficha");
    if (client) api.clientHistory(client.id).then(setHist);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);
  if (!client) return null;
  const years = age(client.birth_date);

  async function remove() {
    if (!client) return;
    if (!confirm(`Excluir ${client.name} e todo o histórico${terms.clinical ? " e prontuário" : ""}? Use isso quando a pessoa pedir a remoção dos dados (LGPD). Não dá para desfazer.`)) return;
    try {
      await api.deleteClient(client.id);
      toast("Cadastro excluído.");
      onDeleted();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  return (
    <Modal open onClose={onClose} title={client.name}>
      {terms.clinical && (
        <div className="mb-4 flex rounded-xl bg-zinc-100 p-1 text-sm font-semibold">
          {(["ficha", "prontuario"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cx("flex-1 rounded-lg py-1.5", tab === t ? "bg-white shadow-sm" : "text-zinc-500")}>
              {t === "ficha" ? "Ficha" : "Prontuário"}
            </button>
          ))}
        </div>
      )}

      {tab === "prontuario" ? (
        <Prontuario client={client} business={business} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-zinc-50 p-3"><p className="text-lg font-bold">{client.visits}</p><p className="text-xs text-zinc-500">{terms.clinical ? "atendimentos" : "visitas"}</p></div>
            <div className="rounded-xl bg-zinc-50 p-3"><p className="text-lg font-bold">{brl(client.total_spent)}</p><p className="text-xs text-zinc-500">total gasto</p></div>
            <div className="rounded-xl bg-zinc-50 p-3"><p className="text-lg font-bold">{client.last_visit ? new Date(client.last_visit).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—"}</p><p className="text-xs text-zinc-500">última visita</p></div>
          </div>

          <dl className="mt-4 space-y-1.5 text-sm">
            <Row k="Celular" v={maskPhone(client.phone)} />
            {client.email && <Row k="E-mail" v={client.email} />}
            {terms.clinical && <Row k="CPF" v={client.cpf ? maskCpf(client.cpf) : "—"} />}
            {client.birth_date && <Row k="Nascimento" v={`${new Date(`${client.birth_date}T12:00:00`).toLocaleDateString("pt-BR")}${years !== null ? ` (${years} anos)` : ""}`} />}
            {terms.clinical && <Row k="Convênio" v={insuranceLabel(client.insurance) + (client.insurance && client.insurance_number ? ` · nº ${client.insurance_number}` : "")} />}
            <Row k={`${terms.client} desde`} v={new Date(client.created_at).toLocaleDateString("pt-BR")} />
          </dl>
          {client.notes && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{client.notes}</p>}

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Button size="sm" onClick={() => onBook(client)}>Agendar</Button>
            <a href={whatsappLink(client.phone, `Olá, ${client.name.split(" ")[0]}! Aqui é da ${business.name}.`)} target="_blank" rel="noreferrer">
              <Button size="sm" variant="secondary" className="w-full">WhatsApp</Button>
            </a>
            <Button size="sm" variant="secondary" onClick={() => onEdit(client)}>Editar</Button>
          </div>

          <h4 className="mt-6 mb-2 text-sm font-semibold">Histórico</h4>
          {hist === null ? (
            <p className="text-sm text-zinc-400">Carregando…</p>
          ) : hist.length === 0 ? (
            <p className="text-sm text-zinc-500">Sem agendamentos.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm">
              {hist.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <b>{new Date(a.starts_at).toLocaleDateString("pt-BR")}</b> · {a.service_name}
                    <span className="block text-xs text-zinc-500">
                      {a.professional_name} · {a.insurance ? `Convênio ${a.insurance}` : brl(a.price)}
                    </span>
                  </span>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}

          <button onClick={remove} className="mt-6 text-xs font-medium text-rose-600 hover:underline">Excluir cadastro e dados (LGPD)</button>
        </>
      )}
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

/** Prontuário: anotações de cada atendimento, da mais recente para a mais antiga. */
function Prontuario({ client, business }: { client: Client; business: Business }) {
  const toast = useToast();
  const [notes, setNotes] = useState<ClinicalNote[] | null>(null);
  const [pros, setPros] = useState<Professional[]>([]);
  const [text, setText] = useState("");
  const [proId, setProId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api.listNotes(client.id).then(setNotes), [client.id]);
  useEffect(() => {
    load();
    api.listProfessionals(business.id).then((p) => {
      setPros(p);
      if (p.length === 1) setProId(p[0].id);
    });
  }, [load, business.id]);

  async function add() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await api.addNote({ business_id: business.id, client_id: client.id, professional_id: proId || null, text });
      setText("");
      toast("Anotação salva no prontuário.");
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(n: ClinicalNote) {
    if (!confirm("Excluir esta anotação do prontuário?")) return;
    try {
      await api.deleteNote(n.id);
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  return (
    <div>
      <div className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
        <Textarea rows={4} placeholder="Queixa, conduta, orientações, retorno…" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select className="!w-auto flex-1" value={proId} onChange={(e) => setProId(e.target.value)}>
            <option value="">Profissional (opcional)</option>
            {pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Button size="sm" loading={saving} disabled={!text.trim()} onClick={add}>Salvar anotação</Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {notes === null ? (
          <p className="text-sm text-zinc-400">Carregando…</p>
        ) : notes.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-500">Nenhuma anotação ainda.</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="border-l-2 border-brand-600 pl-3">
              <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                <span>
                  <b className="text-zinc-700">{new Date(n.created_at).toLocaleDateString("pt-BR")}</b> às{" "}
                  {new Date(n.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {n.professional_id && ` · ${pros.find((p) => p.id === n.professional_id)?.name ?? ""}`}
                </span>
                <button onClick={() => remove(n)} className="text-zinc-400 hover:text-rose-600" title="Excluir"></button>
              </div>
              <p className="mt-1 text-sm whitespace-pre-wrap">{n.text}</p>
            </div>
          ))
        )}
      </div>
      <p className="mt-5 text-xs text-zinc-400">Dados de saúde: visíveis só para a conta da clínica.</p>
    </div>
  );
}

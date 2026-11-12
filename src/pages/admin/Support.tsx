import { publicUrl, maskPhone, whatsappLink } from "../../lib/format";
import { SUPPORT_HOURS, SUPPORT_PHONE } from "../../lib/config";
import { useAuth } from "../../lib/auth";
import { Card } from "../../components/ui";
import { PageHeader, useAdmin } from "./AdminLayout";

const TOPICS = [
  { icon: "", t: "Dúvida sobre a agenda", m: "Tenho uma dúvida sobre a agenda." },
  { icon: "", t: "Plano e pagamento", m: "Tenho uma dúvida sobre meu plano/pagamento." },
  { icon: "", t: "Encontrei um problema", m: "Encontrei um problema no sistema:" },
  { icon: "", t: "Sugestão de melhoria", m: "Tenho uma sugestão de melhoria:" },
];

const FAQ = [
  ["Como meus clientes agendam?", "Copie o seu link (menu lateral → Copiar link) e coloque na bio do Instagram, no WhatsApp Business e no Google. O cliente escolhe serviço, profissional e horário pelo celular."],
  ["Como mudo os horários de atendimento?", "Em Ajustes → Horário de funcionamento. Para um profissional com horário diferente, edite-o na aba da equipe e ative “Horário diferente do estabelecimento”."],
  ["Como registro como o cliente pagou?", "Na Agenda, clique em “✓ Atendido” e escolha a forma de pagamento. O resumo por forma de pagamento aparece no Início."],
  ["Como recebo pagamento pelo site?", "Em Ajustes → Pagamento online pelo site, escolha Opcional ou Obrigatório. Para Pix sem taxa, cadastre sua chave Pix (você confere e confirma na agenda). Para cartão, boleto e Pix com baixa automática, conecte sua conta Asaas com a chave de API."],
  ["O cliente disse que pagou o Pix. Onde confirmo?", "Na Agenda, o horário aparece com “Cliente informou Pix”. Confira no extrato do banco e clique em “✓ Confirmar Pix” (ou “Não recebi”)."],
  ["Um cliente pediu para apagar os dados dele. E agora?", "Em Clientes, abra a ficha e use “Excluir cadastro e dados (LGPD)”. Isso apaga o cadastro e o histórico."],
  ["Como cancelo ou mudo meu plano?", "Em Meu plano você troca de plano ou forma de pagamento. Para cancelar, fale com o suporte pelo WhatsApp."],
];

export default function Support() {
  const { business } = useAdmin();
  const { user } = useAuth();
  const ctx = `\n\n— ${business.name} (${publicUrl(business.slug)})${user?.email ? ` · ${user.email}` : ""}`;
  const wa = (msg: string) => whatsappLink(SUPPORT_PHONE, `Olá! ${msg}${ctx}`);

  return (
    <>
      <PageHeader title="Suporte" sub="Estamos aqui para ajudar você a usar o AgendNow." />

      <div className="bg-grad relative mb-6 overflow-hidden rounded-3xl p-6 text-white shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -right-12 -bottom-16 h-56 w-56 rounded-full bg-white/10" />
        <p className="text-sm font-medium opacity-85">Atendimento pelo WhatsApp</p>
        <h2 className="mt-1 text-3xl font-extrabold tracking-tight">{maskPhone(SUPPORT_PHONE)}</h2>
        <p className="mt-1 text-sm opacity-90">{SUPPORT_HOURS}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href={wa("Preciso de ajuda com o AgendNow.")}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-50 px-5 py-3 font-bold text-emerald-700 shadow-md transition hover:scale-[1.02]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.3-.5.1-1 .1-3.3-.8-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.6 2.1 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.6.3.1.2.1.8-.1 1.4Z" />
            </svg>
            Chamar no WhatsApp
          </a>
          <a href={`tel:+55${SUPPORT_PHONE}`} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-5 py-3 font-semibold ring-1 ring-white/25 hover:bg-white/25">
            Ligar
          </a>
        </div>
      </div>

      <h3 className="mb-3 font-semibold">Sobre o que você precisa de ajuda?</h3>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TOPICS.map((t) => (
          <a
            key={t.t}
            href={wa(t.m)}
            target="_blank"
            rel="noreferrer"
            className="group rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-brand-500"
          >
            <p className="mt-2 font-semibold">{t.t}</p>
            <p className="text-xs text-zinc-500 group-hover:text-brand-600">Abrir conversa →</p>
          </a>
        ))}
      </div>

      <h3 className="mb-3 font-semibold">Perguntas frequentes</h3>
      <Card className="!p-2">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group rounded-xl px-3 py-3 open:bg-zinc-50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
              {q}
              <span className="bg-grad grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm text-white transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2 text-sm text-zinc-600">{a}</p>
          </details>
        ))}
      </Card>
    </>
  );
}

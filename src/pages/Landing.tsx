import { Link } from "react-router-dom";
import { Logo } from "../components/ui";
import { useAuth } from "../lib/auth";
import { PLANS as PLAN_LIST } from "../lib/plans";
import { SUPPORT_PHONE } from "../lib/config";
import { maskPhone, whatsappLink } from "../lib/format";
import { ThemeToggle } from "../components/ThemeToggle";

const FEATURES = [
  { icon: "", c: "from-blue-500 to-blue-700", t: "Link de agendamento próprio", d: "Seu cliente marca pelo celular em menos de 1 minuto, 24 horas por dia. Coloque o link no Instagram e no WhatsApp." },
  { icon: "", c: "from-cyan-500 to-teal-600", t: "Zero conflito de horários", d: "O sistema bloqueia horários ocupados por profissional e respeita a duração de cada serviço." },
  { icon: "", c: "from-blue-500 to-blue-700", t: "Cadastro de clientes completo", d: "Histórico de visitas, total gasto, observações e contato. Tudo salvo e organizado." },
  { icon: "", c: "from-cyan-500 to-teal-600", t: "WhatsApp em 1 toque", d: "Confirme, lembre ou remarque com mensagens prontas direto do painel." },
  { icon: "", c: "from-blue-500 to-blue-700", t: "Números do seu negócio", d: "Agendamentos do dia, faturamento, taxa de faltas e serviços mais vendidos." },
  { icon: "", c: "from-cyan-500 to-teal-600", t: "Seguro e dentro da LGPD", d: "Consentimento do cliente, dados isolados por empresa e exclusão a pedido do titular." },
];

const SEGS = [
  { e: "", t: "Barbearias" },
  { e: "", t: "Salões de beleza" },
  { e: "", t: "Estética" },
  { e: "", t: "Clínicas e consultórios" },
];

const PLANS = PLAN_LIST.map((p) => ({ n: p.name, p: (p.price / 100).toFixed(2).replace(".", ","), d: p.desc, f: p.features, hot: p.hot }));

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="bg-white">
      {/* Hero escuro com gradiente */}
      <div className="relative overflow-hidden bg-[#071330] text-white">

        <header className="relative z-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
            <Logo light className="shrink-0 text-white" />
            <nav className="flex items-center gap-1 text-sm sm:gap-2">
              <ThemeToggle variant="glass" />
              <a href="#recursos" onClick={scrollTo("recursos")} className="hidden px-3 py-2 font-medium text-white/70 hover:text-white sm:block">Recursos</a>
              <a href="#planos" onClick={scrollTo("planos")} className="hidden px-3 py-2 font-medium text-white/70 hover:text-white sm:block">Planos</a>
              {user ? (
                <Link to="/painel" className="bg-grad rounded-xl px-4 py-2 font-semibold shadow-sm hover:brightness-110">Abrir painel</Link>
              ) : (
                <>
                  <Link to="/entrar" className="px-2 py-2 font-medium sm:px-3 text-white/80 hover:text-white">Entrar</Link>
                  <Link to="/criar-conta" className="bg-grad rounded-xl px-3 py-2 font-semibold whitespace-nowrap shadow-sm hover:brightness-110 sm:px-4"><span className="hidden sm:inline">Começar grátis</span><span className="sm:hidden">Criar conta</span></Link>
                </>
              )}
            </nav>
          </div>
        </header>

        <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-14 px-4 pt-10 pb-24 lg:grid-cols-2 lg:pt-16 lg:pb-32">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Agenda online para quem atende com hora marcada
            </span>
            <h1 className="mt-5 text-4xl leading-[1.08] font-extrabold tracking-tight sm:text-6xl">
              Sua agenda cheia, <span className="text-grad">sem ficar no WhatsApp</span> o dia todo.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/75">
              Seus clientes agendam sozinhos pelo link. Você acompanha tudo num painel simples, e os dados de cada cliente ficam salvos e organizados.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/criar-conta" className="bg-grad rounded-2xl px-7 py-4 text-base font-bold shadow-sm transition hover:scale-[1.02] hover:brightness-110">
                Criar minha agenda grátis →
              </Link>
              <a href="#como-funciona" onClick={scrollTo("como-funciona")} className="rounded-2xl bg-white/10 px-7 py-4 text-base font-semibold ring-1 ring-white/25 backdrop-blur hover:bg-white/15">
                Como funciona
              </a>
            </div>
            <p className="mt-4 text-sm text-white/55">✓ 14 dias grátis &nbsp; ✓ Sem cartão de crédito &nbsp; ✓ Cancele quando quiser</p>
          </div>

          {/* Mock do celular */}
          <div className="relative mx-auto w-full max-w-xs">
            <div className="float relative rounded-[2.6rem] bg-neutral-950 p-3 shadow-2xl ring-1 ring-white/10">
              <div className="overflow-hidden rounded-[2rem] bg-zinc-50 text-zinc-900">
                <div className="bg-grad px-5 pt-8 pb-10 text-white">
                  <p className="text-xs opacity-85">Barbearia</p>
                  <p className="text-lg font-bold">Seu Negócio</p>
                </div>
                <div className="-mt-6 space-y-2 px-3 pb-5">
                  <div className="rounded-xl bg-white p-3 shadow-sm ring-2 ring-blue-500">
                    <div className="flex justify-between text-xs font-semibold"><span>✓ Corte + barba</span><span className="text-blue-600">R$ 65</span></div>
                    <p className="text-[11px] text-zinc-500">70 min</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-zinc-200">
                    <p className="mb-2 text-xs font-semibold">Horários de hoje</p>
                    <div className="grid grid-cols-4 gap-1.5 text-center text-[11px] font-semibold">
                      {["09:00", "09:30", "11:00", "13:30", "14:00", "15:30", "16:00", "17:00"].map((h, i) => (
                        <span key={h} className={`rounded-md py-1.5 ${i === 4 ? "bg-grad text-white" : "ring-1 ring-zinc-200"}`}>{h}</span>
                      ))}
                    </div>
                  </div>
                  <div className="bg-grad rounded-xl py-2.5 text-center text-xs font-bold text-white shadow-md">Confirmar agendamento</div>
                </div>
              </div>
            </div>
            <div className="absolute top-16 -left-14 hidden rotate-[-6deg] rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-xl sm:block">
              Novo agendamento!<br /><span className="font-normal text-zinc-500">Hoje às 14:00</span>
            </div>
            <div className="absolute -right-10 bottom-20 hidden rotate-[5deg] rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-xl sm:block">
              R$ 1.840<br /><span className="font-normal text-zinc-500">faturado na semana</span>
            </div>
          </div>
        </section>
      </div>

      {/* Segmentos */}
      <section className="bg-grad">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-5 text-sm font-bold text-white">
          {SEGS.map((s) => (
            <span key={s.t}>{s.e} {s.t}</span>
          ))}
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-24">
        <p className="text-grad-dark text-center text-sm font-bold tracking-widest uppercase">Recursos</p>
        <h2 className="mt-2 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">Tudo que você precisa para atender melhor</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-zinc-600">
          O sistema se adapta ao seu negócio: na clínica fala em "pacientes" e "especialistas"; na barbearia, em "clientes" e "barbeiros".
        </p>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.t} className="group rounded-3xl bg-white p-7 shadow-sm ring-1 ring-zinc-200 transition hover:-translate-y-1 hover:shadow-xl hover:">
              <h3 className="mt-5 text-lg font-bold">{f.t}</h3>
              <p className="mt-1.5 text-sm text-zinc-600">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="bg-grad-soft scroll-mt-4">
        <div className="mx-auto max-w-6xl px-4 py-24">
          <p className="text-grad-dark text-center text-sm font-bold tracking-widest uppercase">Como funciona</p>
          <h2 className="mt-2 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">Pronto para usar em 5 minutos</h2>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              ["1", "Crie sua conta", "Informe o nome do negócio e o tipo de atendimento. Já criamos serviços sugeridos pra você."],
              ["2", "Ajuste serviços e equipe", "Defina preços, duração, profissionais e horários de cada um."],
              ["3", "Divulgue seu link", "Coloque no Instagram, no Google e no WhatsApp. Pronto, é só receber os agendamentos!"],
            ].map(([n, t, d]) => (
              <div key={n} className="rounded-3xl bg-white p-7 shadow-sm ring-1 ring-zinc-100">
                <div className="bg-grad grid h-12 w-12 place-items-center rounded-2xl text-lg font-extrabold text-white shadow-sm">{n}</div>
                <h3 className="mt-5 text-lg font-bold">{t}</h3>
                <p className="mt-1.5 text-zinc-600">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="scroll-mt-4">
        <div className="mx-auto max-w-6xl px-4 py-24">
          <p className="text-grad-dark text-center text-sm font-bold tracking-widest uppercase">Planos</p>
          <h2 className="mt-2 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">Simples, sem surpresa</h2>
          <p className="mt-3 text-center text-zinc-600">Todos com 14 dias grátis.</p>
          <div className="mt-14 grid items-center gap-6 md:grid-cols-3">
            {PLANS.map((p) =>
              p.hot ? (
                <div key={p.n} className="bg-grad relative rounded-3xl p-8 text-white shadow-sm md:scale-105">
                  <span className="absolute -top-3 left-8 rounded-full bg-neutral-900 px-3 py-1 text-xs font-bold text-white">Mais escolhido</span>
                  <PlanBody p={p} light />
                  <Link to="/criar-conta" className="mt-8 block rounded-xl bg-neutral-50 py-3.5 text-center font-bold text-blue-700 hover:bg-white">Começar teste grátis</Link>
                </div>
              ) : (
                <div key={p.n} className="rounded-3xl bg-white p-8 ring-1 ring-zinc-200">
                  <PlanBody p={p} />
                  <Link to="/criar-conta" className="mt-8 block rounded-xl py-3.5 text-center font-bold ring-1 ring-zinc-300 hover:bg-zinc-50">Começar teste grátis</Link>
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-grad-soft">
        <div className="mx-auto max-w-3xl px-4 py-24">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Perguntas frequentes</h2>
          <div className="mt-10 space-y-3">
            {[
              ["Meu cliente precisa baixar aplicativo?", "Não. Ele abre o link no navegador do celular, escolhe o serviço e o horário e pronto."],
              ["E se dois clientes tentarem o mesmo horário?", "O primeiro que confirmar fica com o horário. O sistema impede qualquer sobreposição."],
              ["Posso usar na minha clínica?", "Sim. No tipo \"Clínica\" o paciente informa CPF, nascimento e convênio ao agendar, e você tem prontuário com as anotações de cada atendimento."],
              ["Os dados dos meus clientes ficam seguros?", "Cada empresa só enxerga os próprios dados. O cliente dá consentimento ao agendar e você pode excluir o cadastro a pedido dele."],
            ].map(([q, a]) => (
              <details key={q} className="group rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-zinc-100">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                  {q}
                  <span className="bg-grad grid h-7 w-7 shrink-0 place-items-center rounded-full text-white transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-zinc-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20">
        <div className="bg-grad relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] px-6 py-16 text-center text-white shadow-sm">
          <div className="pointer-events-none absolute -top-16 -left-16 h-56 w-56 rounded-full bg-white/15" />
          <div className="pointer-events-none absolute -right-10 -bottom-20 h-64 w-64 rounded-full bg-white/10" />
          <h2 className="relative text-3xl font-extrabold sm:text-4xl">Comece hoje a receber agendamentos online</h2>
          <p className="relative mt-3 text-white/85">Leva menos tempo que responder 5 mensagens no WhatsApp.</p>
          <Link to="/criar-conta" className="relative mt-8 inline-block rounded-2xl bg-neutral-50 px-8 py-4 font-bold text-blue-700 shadow-lg transition hover:scale-[1.03]">
            Criar minha agenda grátis →
          </Link>
        </div>
      </section>

      <footer className="bg-[#071330] text-white/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm sm:flex-row">
          <Logo light className="text-base text-white" />
          <a href={whatsappLink(SUPPORT_PHONE, "Olá! Quero saber mais sobre o AgendNow.")} target="_blank" rel="noreferrer" className="font-semibold text-white/80 hover:text-white">
            Suporte e vendas: {maskPhone(SUPPORT_PHONE)}
          </a>
          <span>© {new Date().getFullYear()} AgendNow. Todos os direitos reservados.</span>
        </div>
      </footer>
    </div>
  );
}

// Rolagem suave sem mexer na rota (funciona também com rotas "#")
function scrollTo(id: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };
}

function PlanBody({ p, light }: { p: (typeof PLANS)[number]; light?: boolean }) {
  return (
    <>
      <h3 className="text-lg font-bold">{p.n}</h3>
      <p className={`text-sm ${light ? "text-white/80" : "text-zinc-500"}`}>{p.d}</p>
      <p className="mt-6">
        <span className={`text-sm ${light ? "text-white/80" : "text-zinc-500"}`}>R$</span>{" "}
        <span className="text-5xl font-extrabold tracking-tight">{p.p}</span>
        <span className={`text-sm ${light ? "text-white/80" : "text-zinc-500"}`}>/mês</span>
      </p>
      <ul className="mt-6 space-y-2.5 text-sm">
        {p.f.map((f) => (
          <li key={f} className="flex gap-2">
            <span className={light ? "text-white" : "text-blue-600"}>✓</span>
            {f}
          </li>
        ))}
      </ul>
    </>
  );
}

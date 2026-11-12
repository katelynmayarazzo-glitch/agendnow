# AgendNow

Sistema de agendamento online para **barbearias, salões, estética e clínicas**.
React + TypeScript + Tailwind v4 + Vite, com banco **Supabase (PostgreSQL)**.

## Rodar

```bash
npm install
npm run dev        # http://localhost:5173
```

Sem `.env`, o sistema roda em **modo local**: começa zerado e salva tudo no navegador (localStorage).

### Versão em arquivo único (abre sem instalar nada)

```bash
npm run build:arquivo   # gera dist-arquivo/index.html
```

Esse único `.html` abre com dois cliques em qualquer navegador (Chrome, Edge, Firefox).
Ele usa rotas com `#` (ex.: `AgendNow.html#/painel`) e guarda os dados no próprio navegador.

## Ligar o banco de dados (produção)

1. Crie um projeto em supabase.com.
2. **SQL Editor → New query** → cole `supabase/schema.sql` → **Run**.
3. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
   (Project Settings → API).
4. (Opcional) Authentication → Providers → Email: desligue "Confirm email" para o cadastro entrar direto.
5. `npm run build` e publique a pasta `dist/` (Vercel, Netlify, Cloudflare Pages).
   Configure o redirecionamento SPA (todas as rotas → `index.html`).

## Recursos para clínicas (tipo "Clínica / Consultório")

- **Agendamento:** paciente informa CPF (validado), data de nascimento e forma de atendimento
  (particular ou um dos convênios aceitos + nº da carteirinha).
- **Ajustes → Convênios e particular:** lista de convênios aceitos e opção de atender ou não particular.
- **Ficha do paciente:** CPF, idade, convênio, carteirinha, histórico; busca e filtro por convênio; exportação CSV.
- **Prontuário:** anotações de cada atendimento (data, profissional, texto) na tabela `clinical_notes`,
  acessível só pela conta da clínica (RLS). É dado de saúde — sensível pela LGPD.
- **Agenda estilo Google Agenda** (`src/pages/admin/ClinicCalendar.tsx`): visões Dia (uma coluna por
  especialista), Semana e Mês; cores por especialista; linha do horário atual; área fora do expediente
  hachurada; clique num horário vazio para agendar; clique na consulta para ver paciente, idade, CPF,
  convênio + carteirinha, motivo e observações, mudar status, mandar WhatsApp e abrir ficha/prontuário.
  Exclusiva das clínicas.
- **Barbearias, salões e estética** usam a agenda em linha do tempo (`src/pages/admin/AgendaTimeline.tsx`):
  faixa da semana com contagem por dia, filtro por profissional, resumo do dia, cartões coloridos com ações
  rápidas, horários livres clicáveis entre os atendimentos e marcador do "agora".
- Agenda e painel mostram a etiqueta Particular/Convênio e o resumo dos próximos 7 dias por convênio.

**Atualizando um banco que já existe:** rode `supabase/schema.sql` de novo — ele só adiciona as colunas e a
tabela novas, sem apagar dados.

## Formas de pagamento

**Do negócio (cliente final → salão/clínica):** Ajustes → *Formas de pagamento aceitas* (Pix, crédito, débito,
dinheiro, boleto). Aparecem na página de agendamento; o cliente pode indicar como prefere pagar. Ao clicar em
**✓ Atendido**, o painel pergunta *"Como foi pago?"* e o Início mostra o total recebido por forma de pagamento.

**Pagamento online no agendamento (cliente final → estabelecimento):** Ajustes → *Pagamento online pelo site*.

| Modo | O que acontece |
|---|---|
| Desligado | Só pagamento no local (como antes) |
| Opcional | O cliente escolhe "Pagar agora" ou "Pagar no local" |
| Obrigatório | Pagamento antecipado para garantir o horário |

- **Pix direto (sem taxa):** o estabelecimento cadastra a chave Pix; o sistema gera o QR Code/copia-e-cola (BR Code do
  Banco Central) com o valor. O cliente toca em "Já fiz o Pix" e o dono confere e clica em **✓ Confirmar Pix** na agenda.
- **Asaas do estabelecimento (cartão, boleto, Pix automático):** o dono cola a chave de API do Asaas; a função
  `pagar-agendamento` valida a chave, cadastra o webhook sozinha e cobra na conta **dele**. Crédito aprova na hora (até 6x),
  Pix/boleto dão baixa pelo `webhook-asaas`, débito abre a página segura do Asaas.
- Depois de agendar, o cliente cai no comprovante com a tela de pagamento; o comprovante mostra **Pago**. O painel mostra
  *Aguardando pagamento / Cliente informou Pix / Pago online*, o Início soma o que foi pago pelo site e o "✓ Atendido"
  não pergunta de novo como foi pago.
- Cartão vinculado: o cliente pode salvar o cartão **no próprio aparelho** — só bandeira, 4 últimos dígitos e o token do Asaas.
- Boleto só aparece para horários com mais de 3 dias. Convênios não pagam pelo site.
- **Modo local (arquivo .html):** tudo simulado. Cartão de teste 4242 4242 4242 4242 (final 0002 = recusado).

```bash
supabase functions deploy pagar-agendamento --no-verify-jwt
supabase functions deploy webhook-asaas --no-verify-jwt
```

**Assinatura do AgendNow (dono → você), via Asaas:** página **Meu plano** no painel.
- Toda empresa nova começa com **14 dias grátis** (gatilho `start_trial` no banco).
- O dono escolhe plano + cartão/Pix/boleto e informa CPF/CNPJ → a função `criar-assinatura` cria o cliente e a
  assinatura no Asaas e abre a **fatura do Asaas** (o cartão é digitado lá — o AgendNow não guarda cartão).
- A função `webhook-asaas` recebe os avisos (pago, atrasado, cancelado) e atualiza a tabela `subscriptions`.
- Preços: `src/lib/plans.ts` **e** `supabase/functions/criar-assinatura/index.ts` (mantenha iguais).
- No modo local (arquivo .html) o pagamento é **simulado**.

```bash
# Asaas: crie a conta, gere a chave de API (comece pelo sandbox)
supabase secrets set ASAAS_API_KEY=... ASAAS_API_URL=https://api-sandbox.asaas.com/v3 ASAAS_WEBHOOK_TOKEN=um-token-seu
supabase functions deploy criar-assinatura
supabase functions deploy webhook-asaas --no-verify-jwt
# No Asaas: Integrações > Webhooks > https://SEU_PROJETO.supabase.co/functions/v1/webhook-asaas (mesmo token)
# Em produção troque ASAAS_API_URL para https://api.asaas.com/v3 e use a chave de produção.
```

## Usuários (equipe com acesso ao painel)

Painel → **Usuários**: o dono (ou um administrador) informa **nome e sobrenome**, **e-mail (vira o login)** e a
permissão. A pessoa recebe um **e-mail com link para criar a senha** e entra com e-mail + senha.

| Permissão | Pode |
|---|---|
| Dono | Tudo |
| Administrador | Tudo, inclusive Ajustes, Meu plano e Usuários |
| Equipe | Agenda, clientes, serviços e profissionais (sem Ajustes, Meu plano e Usuários) |

No login há **"Esqueci minha senha"** (mesmo link de criar senha). Tabela `business_members`; as regras de acesso
(RLS) valem para dono e equipe. A criação/remoção de login é feita pela função `gerenciar-usuarios`:

```bash
supabase functions deploy gerenciar-usuarios
# Supabase > Authentication > URL Configuration:
#   Site URL = https://SEU_SITE   e   Redirect URLs += https://SEU_SITE/definir-senha
# Textos dos e-mails: Authentication > Email Templates ("Invite user" e "Reset password").
# Para produção, configure um SMTP próprio (Authentication > SMTP): o envio padrão do Supabase é limitado.
```

No modo local (arquivo .html) não há e-mail: o sistema mostra o link na tela para você testar.

## Suporte

Aba **Suporte** no painel (WhatsApp/ligação, assuntos rápidos e perguntas frequentes), link no login e no rodapé
da página de vendas. Número e horário ficam em `src/lib/config.ts`.

## Integrações (APIs)

Regra de ouro: **chave secreta nunca vai no front-end** (o site roda no navegador e qualquer um vê o código).

| Onde | Para quê | Como |
|---|---|---|
| `.env` (`VITE_...`) | Só chaves **públicas** (Supabase URL e anon key) | Já configurado |
| Supabase Edge Functions | APIs com chave secreta: WhatsApp, pagamentos, e-mail | `supabase/functions/*`, segredos com `supabase secrets set` |
| Webhooks | O serviço externo avisa o sistema (ex.: "PIX pago") | Uma Edge Function recebe o POST e atualiza o banco |

Modelo pronto: `supabase/functions/lembretes-whatsapp/index.ts` (lembrete do dia seguinte).

```bash
npm i -g supabase                # CLI
supabase login
supabase link --project-ref SEU_PROJETO
supabase secrets set WHATSAPP_API_URL=... WHATSAPP_API_TOKEN=...
supabase functions deploy lembretes-whatsapp
```

## Tema claro / escuro

Botão de lua (escuro) e sol (claro) no painel, na página de agendamento, no login e na página de vendas.
A escolha fica salva no navegador; na primeira visita segue o tema do sistema. As cores do modo escuro
ficam no fim de `src/index.css` (bloco `.dark`).

## Rotas

| Rota                     | O que é                                          |
|--------------------------|--------------------------------------------------|
| `/`                      | Página de vendas (planos, demo, FAQ)             |
| `/criar-conta`, `/entrar`| Cadastro do dono e login                         |
| `/:slug`                 | Página de agendamento do estabelecimento         |
| `/agendamento/:token`    | Comprovante do cliente: consultar, calendário, cancelar |
| `/painel/*`              | Painel: início, agenda, clientes, serviços, equipe, ajustes |

## Como os dados ficam seguros

- **RLS**: cada dono só lê/escreve os dados da própria empresa.
- O visitante nunca acessa as tabelas; usa só funções (`create_booking`, `get_busy`…) que expõem o mínimo
  (horários ocupados, sem nomes de clientes).
- **Sem horário duplicado**: restrição `EXCLUDE` no banco impede sobreposição por profissional, mesmo com
  dois clientes clicando ao mesmo tempo.
- O banco valida horário de funcionamento, antecedência mínima, telefone e nome.
- Cliente é identificado pelo telefone: agendou de novo → o cadastro é atualizado, não duplicado.
- LGPD: consentimento no agendamento, exportação CSV e exclusão do cadastro a pedido.

## Estrutura

```
src/lib/api/        camada de dados (local.ts = demo, supabase.ts = produção, mesma interface)
src/lib/slots.ts    cálculo de horários livres
src/lib/segments.ts vocabulário por segmento (Cliente/Paciente, Barbeiro/Especialista…)
src/pages/          páginas públicas
src/pages/admin/    painel
supabase/schema.sql banco completo
```

## Próximos passos sugeridos

- Lembretes automáticos por WhatsApp (Z-API, Twilio ou WhatsApp Cloud API) via Supabase Edge Function + cron.
- Cobrança das assinaturas (Asaas, Mercado Pago ou Stripe) e limite de profissionais por plano.

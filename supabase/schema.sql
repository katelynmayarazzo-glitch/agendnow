-- =====================================================================
--  AgendNow — schema do banco (Supabase / PostgreSQL)
--  Como usar: Supabase > SQL Editor > New query > cole tudo > Run.
--  Pode rodar mais de uma vez em um banco novo; em produção, use migrações.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------- Tabelas ----------

create table if not exists public.businesses (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  slug           text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'),
  name           text not null check (char_length(name) between 2 and 80),
  segment        text not null default 'barbearia' check (segment in ('barbearia','salao','clinica','estetica')),
  phone          text not null default '',
  address        text not null default '',
  about          text not null default '',
  color          text not null default '#2563eb',
  hours          jsonb not null,
  slot_interval  int  not null default 30 check (slot_interval between 5 and 240),
  min_notice     int  not null default 60 check (min_notice >= 0),
  max_days_ahead int  not null default 30 check (max_days_ahead between 1 and 365),
  auto_confirm   boolean not null default false,
  created_at     timestamptz not null default now()
);
-- Versão 1: uma empresa por conta
create unique index if not exists businesses_owner_uq on public.businesses(owner_id);

create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  description text not null default '',
  duration    int  not null check (duration between 5 and 600),
  price       int  not null default 0 check (price >= 0),  -- centavos
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists services_business_idx on public.services(business_id);

create table if not exists public.professionals (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  role        text not null default '',
  service_ids uuid[] not null default '{}',
  hours       jsonb,                       -- null = usa o horário da empresa
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists professionals_business_idx on public.professionals(business_id);

create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  phone       text not null check (phone ~ '^[0-9]{10,11}$'),
  email       text not null default '',
  birth_date  date,
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  unique (business_id, phone)
);

create table if not exists public.appointments (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  service_id      uuid not null references public.services(id) on delete restrict,
  professional_id uuid not null references public.professionals(id) on delete restrict,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  status          text not null default 'pending'
                  check (status in ('pending','confirmed','done','cancelled','no_show')),
  price           int  not null default 0,
  notes           text not null default '',
  token           uuid not null unique default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Garante NO BANCO que um profissional nunca tenha dois horários sobrepostos
  constraint appointments_no_overlap exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled')
);
create index if not exists appointments_business_start_idx on public.appointments(business_id, starts_at);
create index if not exists appointments_client_idx on public.appointments(client_id);

-- ---------- Recursos de clínicas (convênio, CPF, prontuário) ----------
alter table public.businesses   add column if not exists insurances     text[]  not null default '{}';
alter table public.businesses   add column if not exists accept_private boolean not null default true;
alter table public.clients      add column if not exists cpf              text not null default '';
alter table public.clients      add column if not exists insurance        text not null default '';
alter table public.clients      add column if not exists insurance_number text not null default '';
alter table public.appointments add column if not exists insurance        text not null default '';

do $$ begin
  alter table public.clients add constraint clients_cpf_format check (cpf = '' or cpf ~ '^[0-9]{11}$');
exception when duplicate_object then null; end $$;
create unique index if not exists clients_business_cpf_uq on public.clients(business_id, cpf) where cpf <> '';

-- Prontuário: anotações de atendimento. Dado de SAÚDE (sensível pela LGPD): só o dono acessa.
create table if not exists public.clinical_notes (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete set null,
  text            text not null check (char_length(text) between 1 and 10000),
  created_at      timestamptz not null default now()
);
create index if not exists clinical_notes_client_idx on public.clinical_notes(client_id, created_at desc);

-- ---------- Formas de pagamento e assinatura do AgendNow ----------
alter table public.businesses   add column if not exists payment_methods text[] not null default '{pix,credito,debito,dinheiro}';
alter table public.appointments add column if not exists payment_method  text   not null default '';

-- ---------- Pagamento online no agendamento (cliente final → estabelecimento) ----------
-- online_payment: off = só no local · optional = o cliente escolhe · required = pagamento antecipado
alter table public.businesses add column if not exists online_payment text not null default 'off';
alter table public.businesses add column if not exists pix_key  text not null default '';  -- Pix direto (chave pública)
alter table public.businesses add column if not exists pix_name text not null default '';
alter table public.businesses add column if not exists pix_city text not null default '';
alter table public.businesses add column if not exists gateway  text not null default '';  -- 'asaas' = conta conectada
do $$ begin
  alter table public.businesses add constraint businesses_online_payment_chk check (online_payment in ('off','optional','required'));
exception when duplicate_object then null; end $$;

-- payment_status: '' = paga no local · pending = aguardando · review = Pix direto informado · paid = pago
alter table public.appointments add column if not exists payment_status   text not null default '';
alter table public.appointments add column if not exists paid_at          timestamptz;
alter table public.appointments add column if not exists payment_info     text not null default '';
alter table public.appointments add column if not exists asaas_payment_id text;
do $$ begin
  alter table public.appointments add constraint appointments_payment_status_chk check (payment_status in ('','pending','review','paid'));
exception when duplicate_object then null; end $$;
create index if not exists appointments_asaas_payment_idx on public.appointments(asaas_payment_id) where asaas_payment_id is not null;

-- Chave de API do Asaas de cada estabelecimento. SEGREDO: RLS ligada e nenhuma política →
-- ninguém lê pelo site; só as Edge Functions (service_role).
create table if not exists public.business_gateways (
  business_id   uuid primary key references public.businesses(id) on delete cascade,
  provider      text not null default 'asaas',
  api_key       text not null,
  api_url       text not null default 'https://api.asaas.com/v3',
  webhook_token text not null,
  updated_at    timestamptz not null default now()
);
alter table public.business_gateways enable row level security;

-- o campo "gateway" só muda pelo servidor (função pagar-agendamento)
create or replace function public.protect_gateway() returns trigger
language plpgsql as $$
begin
  if new.gateway is distinct from old.gateway and coalesce(auth.role(), '') <> 'service_role' then
    new.gateway := old.gateway;
  end if;
  return new;
end;
$$;
drop trigger if exists businesses_protect_gateway on public.businesses;
create trigger businesses_protect_gateway before update on public.businesses
  for each row execute function public.protect_gateway();

-- Esta forma pode ser paga pelo site neste estabelecimento? (mesma regra de src/lib/payments.ts → onlineSetup)
create or replace function public.online_method_ok(b businesses, m text, p_starts timestamptz)
returns boolean language sql stable as $$
  select m = any(array['pix','credito','debito','boleto'])
     and m = any(b.payment_methods)
     and case when m = 'pix' then b.gateway = 'asaas' or btrim(b.pix_key) <> '' else b.gateway = 'asaas' end
     and (m <> 'boleto' or p_starts > now() + interval '3 days');
$$;

-- Assinatura de cada negócio (o dono pagando a plataforma). Quem altera status é SÓ o servidor
-- (funções criar-assinatura e webhook-asaas, com a chave service_role). O dono apenas lê.
create table if not exists public.subscriptions (
  business_id           uuid primary key references public.businesses(id) on delete cascade,
  plan                  text not null default 'profissional' check (plan in ('essencial','profissional','clinica')),
  status                text not null default 'trial' check (status in ('trial','pending','active','overdue','canceled')),
  billing_type          text not null default '',
  trial_ends_at         timestamptz not null default now() + interval '14 days',
  current_period_end    timestamptz,
  invoice_url           text,
  asaas_customer_id     text,
  asaas_subscription_id text unique,
  updated_at            timestamptz not null default now()
);

-- Toda empresa nova começa com 14 dias grátis
create or replace function public.start_trial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into subscriptions (business_id, plan)
  values (new.id, case when new.segment = 'clinica' then 'clinica' else 'profissional' end)
  on conflict (business_id) do nothing;
  return new;
end;
$$;
drop trigger if exists businesses_start_trial on public.businesses;
create trigger businesses_start_trial after insert on public.businesses
  for each row execute function public.start_trial();
-- empresas que já existiam ganham o registro de teste
insert into public.subscriptions (business_id) select id from public.businesses on conflict do nothing;

-- ---------- Usuários da equipe (acesso ao painel) ----------
-- O dono continua em businesses.owner_id. Outros usuários entram por convite (função gerenciar-usuarios).
create table if not exists public.business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null,
  role        text not null default 'equipe' check (role in ('admin','equipe')),
  accepted_at timestamptz,               -- preenchido quando a pessoa cria a senha e entra
  created_at  timestamptz not null default now(),
  unique (business_id, user_id)
);
-- Versão 1: cada login pertence a uma empresa só
create unique index if not exists business_members_user_uq on public.business_members(user_id);

-- ---------- Segurança (RLS): cada empresa só vê os próprios dados ----------

-- is_owner: o nome ficou por compatibilidade; vale para o DONO e para quem é da EQUIPE da empresa
create or replace function public.is_owner(bid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from businesses where id = bid and owner_id = auth.uid())
      or exists (select 1 from business_members where business_id = bid and user_id = auth.uid());
$$;

-- is_admin: dono ou membro com permissão de administrador
create or replace function public.is_admin(bid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from businesses where id = bid and owner_id = auth.uid())
      or exists (select 1 from business_members where business_id = bid and user_id = auth.uid() and role = 'admin');
$$;

-- marca o convite como aceito no primeiro acesso
create or replace function public.accept_membership()
returns void language sql security definer set search_path = public as $$
  update business_members set accepted_at = now() where user_id = auth.uid() and accepted_at is null;
$$;
grant execute on function public.accept_membership() to authenticated;

alter table public.businesses    enable row level security;
alter table public.services      enable row level security;
alter table public.professionals enable row level security;
alter table public.clients       enable row level security;
alter table public.appointments  enable row level security;
alter table public.clinical_notes enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.business_members enable row level security;

drop policy if exists owner_all on public.businesses;
drop policy if exists biz_select on public.businesses;
drop policy if exists biz_insert on public.businesses;
drop policy if exists biz_update on public.businesses;
drop policy if exists biz_delete on public.businesses;
create policy biz_select on public.businesses for select using (public.is_owner(id));
create policy biz_insert on public.businesses for insert with check (owner_id = auth.uid());
create policy biz_update on public.businesses for update using (public.is_admin(id)) with check (public.is_admin(id));
create policy biz_delete on public.businesses for delete using (owner_id = auth.uid());

drop policy if exists members_select on public.business_members;
drop policy if exists members_update on public.business_members;
drop policy if exists members_delete on public.business_members;
create policy members_select on public.business_members for select using (public.is_owner(business_id));
create policy members_update on public.business_members for update
  using (public.is_admin(business_id) and user_id <> auth.uid()) with check (public.is_admin(business_id));
-- inserir/remover: só pela função gerenciar-usuarios (cria/apaga o login junto)

drop policy if exists owner_all on public.services;
create policy owner_all on public.services for all
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

drop policy if exists owner_all on public.professionals;
create policy owner_all on public.professionals for all
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

drop policy if exists owner_all on public.clients;
create policy owner_all on public.clients for all
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

drop policy if exists owner_all on public.appointments;
create policy owner_all on public.appointments for all
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

drop policy if exists owner_read on public.subscriptions;
create policy owner_read on public.subscriptions for select using (public.is_admin(business_id));

drop policy if exists owner_all on public.clinical_notes;
create policy owner_all on public.clinical_notes for all
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

-- ---------- Funções públicas (o cliente final usa sem login) ----------
-- O visitante NUNCA lê as tabelas direto: só por estas funções, que expõem o mínimo.

create or replace function public.get_public_business(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'business', to_jsonb(b) - 'owner_id' - 'created_at',
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.name)
                          from services s where s.business_id = b.id and s.active), '[]'::jsonb),
    'professionals', coalesce((select jsonb_agg(to_jsonb(p) order by p.name)
                          from professionals p where p.business_id = b.id and p.active), '[]'::jsonb)
  )
  from businesses b where b.slug = p_slug;
$$;

-- Só devolve intervalos ocupados (sem nomes de clientes)
create or replace function public.get_busy(p_professional uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.starts_at, a.ends_at from appointments a
  where a.professional_id = p_professional
    and a.status <> 'cancelled'
    and a.starts_at < p_to and a.ends_at > p_from;
$$;

create or replace function public.slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from businesses where slug = p_slug);
$$;

drop function if exists public.create_booking(uuid,uuid,uuid,timestamptz,text,text,text,date,text);
drop function if exists public.create_booking(uuid,uuid,uuid,timestamptz,text,text,text,date,text,text,text,text);
drop function if exists public.create_booking(uuid,uuid,uuid,timestamptz,text,text,text,date,text,text,text,text,text);
create or replace function public.create_booking(
  p_business uuid, p_service uuid, p_professional uuid, p_starts timestamptz,
  p_name text, p_phone text, p_email text, p_birth date, p_notes text,
  p_cpf text default '', p_insurance text default '', p_insurance_number text default '',
  p_payment text default '', p_pay_online boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  b businesses; s services; p professionals;
  v_phone text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  v_name  text := btrim(coalesce(p_name,''));
  v_cpf   text := regexp_replace(coalesce(p_cpf,''), '\D', '', 'g');
  v_ins   text := btrim(coalesce(p_insurance,''));
  v_card  text := left(btrim(coalesce(p_insurance_number,'')), 40);
  v_pay   text := btrim(coalesce(p_payment,''));
  v_end   timestamptz;
  v_local timestamp;
  v_hours jsonb;
  v_client uuid;
  v_token uuid;
  v_owner boolean;
  v_charge boolean;
  v_online boolean := false;
begin
  select * into b from businesses where id = p_business;
  select * into s from services where id = p_service and business_id = p_business and active;
  select * into p from professionals where id = p_professional and business_id = p_business and active;
  if b.id is null or s.id is null or p.id is null then
    raise exception 'Dados do agendamento inválidos.';
  end if;
  if cardinality(p.service_ids) > 0 and not (s.id = any(p.service_ids)) then
    raise exception 'Este profissional não realiza este serviço.';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'Informe seu nome.'; end if;
  if v_phone !~ '^[0-9]{10,11}$' then raise exception 'Telefone inválido.'; end if;
  if v_cpf <> '' and v_cpf !~ '^[0-9]{11}$' then raise exception 'CPF inválido.'; end if;
  if v_pay <> '' and not (v_pay = any(b.payment_methods)) then
    raise exception 'Forma de pagamento não aceita.';
  end if;
  if v_ins <> '' and not (v_ins = any(b.insurances)) then
    raise exception 'Convênio não aceito por este estabelecimento.';
  end if;

  v_end   := p_starts + make_interval(mins => s.duration);
  v_owner := coalesce(public.is_owner(b.id), false);  -- dono ou equipe logados; visitante anônimo = false
  if v_ins = '' and cardinality(b.insurances) > 0 and not b.accept_private and not v_owner then
    raise exception 'Este estabelecimento atende apenas por convênio.';
  end if;

  -- Pagamento online: só particular com valor, numa forma que o estabelecimento recebe pelo site
  v_charge := v_ins = '' and s.price > 0 and b.online_payment <> 'off';
  if coalesce(p_pay_online, false) then
    if not (v_charge and public.online_method_ok(b, v_pay, p_starts)) then
      raise exception 'Esta forma de pagamento online não está disponível.';
    end if;
    v_online := true;
  elsif v_charge and b.online_payment = 'required' and not v_owner
        and exists (select 1 from unnest(b.payment_methods) m where public.online_method_ok(b, m, p_starts)) then
    raise exception 'Este estabelecimento pede o pagamento antecipado pelo site.';
  end if;

  -- Regras que valem para o público (o dono pode fazer encaixes)
  if not v_owner then
    if p_starts < now() + make_interval(mins => b.min_notice) then
      raise exception 'Esse horário não está mais disponível.';
    end if;
    if p_starts > now() + make_interval(days => b.max_days_ahead + 1) then
      raise exception 'Data muito distante.';
    end if;
    v_local := p_starts at time zone 'America/Sao_Paulo';
    v_hours := coalesce(p.hours, b.hours) -> (extract(dow from v_local)::int)::text;
    if v_hours is null or jsonb_typeof(v_hours) = 'null'
       or v_local::time < (v_hours->>'open')::time
       or (v_end at time zone 'America/Sao_Paulo')::time > (v_hours->>'close')::time
       or (v_end at time zone 'America/Sao_Paulo')::date <> v_local::date then
      raise exception 'Fora do horário de atendimento.';
    end if;
  end if;

  -- Cadastro do cliente: cria ou atualiza pelo telefone
  begin
    insert into clients (business_id, name, phone, email, birth_date, cpf, insurance, insurance_number)
    values (b.id, v_name, v_phone, btrim(coalesce(p_email,'')), p_birth, v_cpf, v_ins, v_card)
    on conflict (business_id, phone) do update set
      name             = excluded.name,
      email            = coalesce(nullif(excluded.email, ''), clients.email),
      birth_date       = coalesce(excluded.birth_date, clients.birth_date),
      cpf              = coalesce(nullif(excluded.cpf, ''), clients.cpf),
      insurance        = excluded.insurance,
      insurance_number = coalesce(nullif(excluded.insurance_number, ''), clients.insurance_number)
    returning id into v_client;
  exception when unique_violation then
    raise exception 'Este CPF já está cadastrado com outro telefone. Fale com o estabelecimento.';
  end;

  begin
    insert into appointments (business_id, client_id, service_id, professional_id, starts_at, ends_at, status, price, insurance, payment_method, payment_status, notes)
    values (b.id, v_client, s.id, p.id, p_starts, v_end,
            case when b.auto_confirm or v_owner then 'confirmed' else 'pending' end,
            s.price, v_ins, case when v_ins = '' then v_pay else '' end,
            case when v_online then 'pending' else '' end, left(btrim(coalesce(p_notes,'')), 500))
    returning token into v_token;
  exception
    when exclusion_violation then
      raise exception 'Ops! Alguém acabou de reservar esse horário. Escolha outro.';
  end;

  return v_token;
end;
$$;

create or replace function public.get_booking(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'appointment', to_jsonb(a),
    'business', to_jsonb(b) - 'owner_id' - 'created_at',
    'service_name', s.name,
    'professional_name', p.name,
    'client_name', c.name
  )
  from appointments a
  join businesses b on b.id = a.business_id
  join services s on s.id = a.service_id
  join professionals p on p.id = a.professional_id
  join clients c on c.id = a.client_id
  where a.token = p_token;
$$;

create or replace function public.cancel_booking(p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a appointments;
begin
  select * into a from appointments where token = p_token;
  if a.id is null then raise exception 'Agendamento não encontrado.'; end if;
  if a.starts_at < now() then raise exception 'Não é possível cancelar um horário que já passou.'; end if;
  update appointments set status = 'cancelled'
   where id = a.id and status in ('pending','confirmed');
end;
$$;

-- Pix direto na chave do estabelecimento (sem processador): marca o agendamento como "aguardando Pix"
create or replace function public.start_direct_pix(p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a appointments; b businesses;
begin
  select * into a from appointments where token = p_token;
  if a.id is null then raise exception 'Agendamento não encontrado.'; end if;
  select * into b from businesses where id = a.business_id;
  if a.status = 'cancelled' then raise exception 'Este agendamento foi cancelado.'; end if;
  if a.payment_status = 'paid' then raise exception 'Este agendamento já está pago.'; end if;
  if a.insurance <> '' or a.price <= 0 or b.online_payment = 'off'
     or b.gateway = 'asaas' or btrim(b.pix_key) = '' or not ('pix' = any(b.payment_methods)) then
    raise exception 'Pix indisponível para este agendamento.';
  end if;
  update appointments set payment_method = 'pix', payment_status = 'pending' where id = a.id and payment_status <> 'review';
end;
$$;

-- O cliente avisa "já paguei o Pix": o estabelecimento confere e confirma no painel
create or replace function public.report_pix_paid(p_token uuid)
returns void language sql security definer set search_path = public as $$
  update appointments set payment_status = 'review'
   where token = p_token and payment_method = 'pix' and payment_status = 'pending';
$$;

revoke all on function public.start_direct_pix(uuid) from public;
revoke all on function public.report_pix_paid(uuid) from public;
grant execute on function public.start_direct_pix(uuid) to anon, authenticated;
grant execute on function public.report_pix_paid(uuid) to anon, authenticated;

revoke all on function public.get_public_business(text) from public;
revoke all on function public.get_busy(uuid, timestamptz, timestamptz) from public;
revoke all on function public.slug_available(text) from public;
revoke all on function public.create_booking(uuid,uuid,uuid,timestamptz,text,text,text,date,text,text,text,text,text,boolean) from public;
revoke all on function public.get_booking(uuid) from public;
revoke all on function public.cancel_booking(uuid) from public;

grant execute on function public.get_public_business(text) to anon, authenticated;
grant execute on function public.get_busy(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.slug_available(text) to anon, authenticated;
grant execute on function public.create_booking(uuid,uuid,uuid,timestamptz,text,text,text,date,text,text,text,text,text,boolean) to anon, authenticated;
grant execute on function public.get_booking(uuid) to anon, authenticated;
grant execute on function public.cancel_booking(uuid) to anon, authenticated;

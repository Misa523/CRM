-- =====================================================================
-- Moje CRM – propojení s Google kalendářem
-- Spusťte až po nasazení funkce „gcal“: Supabase → SQL Editor → New query → vložit celý soubor → Run.
-- Skript jde spustit i opakovaně (nic nesmaže).
-- =====================================================================

-- Propojení uživatele s Googlem. Přístup má jen serverová funkce gcal (aplikace ani přihlášení uživatelé ne).
create table if not exists public.gcal_links (
  user_id       uuid        primary key references auth.users (id) on delete cascade,
  refresh_token text        not null,
  calendar_id   text,
  reminders     text[]      not null default '{week,eve,morning}',
  email         boolean     not null default true,
  currency      text        not null default 'CZK',
  time_zone     text        not null default 'Europe/Prague',
  app_url       text        not null default '',
  sent          jsonb       not null default '{}'::jsonb,  -- co už v Googlu je (id události → otisk obsahu)
  last_sync     timestamptz,
  last_error    text,
  needs_relink  boolean     not null default false,
  created_at    timestamptz not null default now()
);
alter table public.gcal_links enable row level security;
revoke all on public.gcal_links from anon, authenticated;

-- Tajný klíč pro plánovač (vygeneruje se sám, nikam ho neopisujte).
create table if not exists public.gcal_private (
  id       int  primary key default 1 check (id = 1),
  cron_key text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into public.gcal_private (id) values (1) on conflict (id) do nothing;
alter table public.gcal_private enable row level security;
revoke all on public.gcal_private from anon, authenticated;

-- Plánovač: každých 10 minut pošle změny do Google kalendáře (i když je aplikace zavřená).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'crm-google-kalendar',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://gscysvybyluqypqskwpp.supabase.co/functions/v1/gcal',
    body := '{"action":"cron"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select cron_key from public.gcal_private where id = 1)),
    timeout_milliseconds := 120000
  );
  $$
);

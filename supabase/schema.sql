-- =====================================================================
-- Moje CRM – databáze v Supabase
-- Spusťte jednou: Supabase → SQL Editor → New query → vložit celý soubor → Run.
-- Skript jde spustit i opakovaně (nic nesmaže).
-- =====================================================================

-- Všechny záznamy CRM (kontakty, obchody, úkoly, faktury, nastavení) v jedné tabulce.
create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  collection text        not null,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, id)
);

create index if not exists records_user_updated on public.records (user_id, updated_at);

-- Čas změny nastavuje vždy server (podle něj si zařízení stahují novinky).
create or replace function public.records_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
for each row execute function public.records_touch();

-- Každý vidí a mění jen svoje data.
alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
drop policy if exists "records_insert_own" on public.records;
drop policy if exists "records_update_own" on public.records;
drop policy if exists "records_delete_own" on public.records;

create policy "records_select_own" on public.records for select to authenticated
  using (user_id = auth.uid());
create policy "records_insert_own" on public.records for insert to authenticated
  with check (user_id = auth.uid());
create policy "records_update_own" on public.records for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "records_delete_own" on public.records for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Soubory faktur: soukromé úložiště, každý uživatel jen ve své složce <user_id>/...
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('invoices', 'invoices', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "invoices_select_own" on storage.objects;
drop policy if exists "invoices_insert_own" on storage.objects;
drop policy if exists "invoices_update_own" on storage.objects;
drop policy if exists "invoices_delete_own" on storage.objects;

create policy "invoices_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "invoices_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "invoices_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "invoices_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);

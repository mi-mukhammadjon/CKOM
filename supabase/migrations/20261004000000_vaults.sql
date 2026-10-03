-- СКОМ: облачные хранилища пользователей со сквозным шифрованием.
--
-- Сервер хранит только шифротекст (AES-256-GCM): ключ выводится из пароля
-- на устройстве и в Supabase не передается. Одна строка на пользователя.
-- Выполните этот файл в Supabase → SQL Editor (или `supabase db push`).

create table if not exists public.vaults (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  -- Номер версии для оптимистичной блокировки: запись проходит,
  -- только если клиент видел текущую версию
  version        bigint not null default 1 check (version > 0),
  kdf_salt       text not null,
  kdf_iterations integer not null check (kdf_iterations >= 100000),
  iv             text not null,
  ciphertext     text not null check (length(ciphertext) < 8000000),
  device_id      text,
  updated_at     timestamptz not null default now()
);

alter table public.vaults enable row level security;

-- Каждый пользователь видит и меняет только свою строку
drop policy if exists "vault_select_own" on public.vaults;
create policy "vault_select_own" on public.vaults
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "vault_insert_own" on public.vaults;
create policy "vault_insert_own" on public.vaults
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "vault_update_own" on public.vaults;
create policy "vault_update_own" on public.vaults
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "vault_delete_own" on public.vaults;
create policy "vault_delete_own" on public.vaults
  for delete to authenticated using (auth.uid() = user_id);

-- Анонимной роли таблица недоступна вовсе
revoke all on public.vaults from anon;
grant select, insert, update, delete on public.vaults to authenticated;

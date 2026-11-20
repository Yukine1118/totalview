-- AI 作戰室 v2:資料庫結構
-- 設計:每次匯入 = 一個版本(aiwr_imports),內容拆成多筆 aiwr_items。
-- 「目前資料」= 每個 (bot, kind, key) 最新且未被還原掉的一筆。
-- 還原 = 把舊版本複製成新版本,並把「之後的同 bot 資料」標記為 reverted(只增不刪)。
-- 安全:所有表開 RLS 且沒有任何 policy → anon / authenticated 完全讀不到;
--       只有伺服器端用 secret(service role)key 才能存取。

create table public.aiwr_imports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('paste', 'restore')),
  raw_text text not null,
  restored_from uuid references public.aiwr_imports (id),
  note text
);

create table public.aiwr_items (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.aiwr_imports (id),
  bot text not null check (length(bot) between 1 and 64),
  kind text not null check (
    kind in ('bot_status', 'ai_usage', 'positions_real', 'positions_paper', 'trades', 'equity', 'strategies', 'summary', 'fx')
  ),
  -- 同一個 bot、同一種資料裡的細分:ai_usage 用服務名稱、equity 用 account|market|currency、fx 用 BASE/QUOTE
  key text not null default '',
  as_of timestamptz not null,
  payload jsonb not null,
  reverted_at timestamptz,
  reverted_by uuid references public.aiwr_imports (id)
);

create index aiwr_items_lookup on public.aiwr_items (bot, kind, key, import_id) where reverted_at is null;
create index aiwr_items_import on public.aiwr_items (import_id);
create index aiwr_imports_created on public.aiwr_imports (created_at desc);

alter table public.aiwr_imports enable row level security;
alter table public.aiwr_items enable row level security;
revoke all on public.aiwr_imports from anon, authenticated;
revoke all on public.aiwr_items from anon, authenticated;

-- 目前資料
create view public.aiwr_current with (security_invoker = true) as
select distinct on (it.bot, it.kind, it.key)
  it.id, it.import_id, it.bot, it.kind, it.key, it.as_of, it.payload, imp.created_at as imported_at
from public.aiwr_items it
join public.aiwr_imports imp on imp.id = it.import_id
where it.reverted_at is null
order by it.bot, it.kind, it.key, imp.created_at desc, it.id desc;

revoke all on public.aiwr_current from anon, authenticated;

-- 匯入(一個 transaction:全部成功或全部不寫)
create function public.aiwr_import(p_raw text, p_items jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no items';
  end if;
  insert into aiwr_imports (source, raw_text) values ('paste', p_raw) returning id into v_id;
  insert into aiwr_items (import_id, bot, kind, key, as_of, payload)
  select v_id, x ->> 'bot', x ->> 'kind', coalesce(x ->> 'key', ''), (x ->> 'as_of')::timestamptz, x -> 'payload'
  from jsonb_array_elements(p_items) x;
  return v_id;
end;
$$;

-- 還原成某個版本
create function public.aiwr_restore(p_import uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_new uuid;
  v_created timestamptz;
  v_bots text[];
begin
  select created_at into v_created from aiwr_imports where id = p_import;
  if not found then
    raise exception 'import not found';
  end if;
  select array_agg(distinct bot) into v_bots from aiwr_items where import_id = p_import;

  insert into aiwr_imports (source, raw_text, restored_from, note)
  select 'restore', raw_text, id, '還原自 ' || to_char(created_at at time zone 'Asia/Taipei', 'YYYY-MM-DD HH24:MI') || ' 的版本'
  from aiwr_imports where id = p_import
  returning id into v_new;

  -- 之後匯入、屬於同一批 bot 的資料標記為已還原(不刪除)
  update aiwr_items it
  set reverted_at = now(), reverted_by = v_new
  from aiwr_imports imp
  where imp.id = it.import_id
    and imp.created_at > v_created
    and imp.id <> v_new
    and it.bot = any (v_bots)
    and it.reverted_at is null;

  insert into aiwr_items (import_id, bot, kind, key, as_of, payload)
  select v_new, bot, kind, key, as_of, payload from aiwr_items where import_id = p_import order by id;

  return v_new;
end;
$$;

revoke all on function public.aiwr_import (text, jsonb) from public, anon, authenticated;
revoke all on function public.aiwr_restore (uuid) from public, anon, authenticated;
grant execute on function public.aiwr_import (text, jsonb) to service_role;
grant execute on function public.aiwr_restore (uuid) to service_role;
grant all on public.aiwr_imports, public.aiwr_items, public.aiwr_current to service_role;

-- 自動匯入(POST /api/ingest)的來源標記。
-- 請在 Supabase → SQL Editor 把這個檔案整份貼上執行一次。
-- 執行前:貼上匯入仍走 aiwr_import,來源維持 paste,這個檔案不會改那條路。
-- 執行後:網站的自動匯入會呼叫 aiwr_ingest,來源記成 ingest。
-- 還沒執行時,端點會回 503 {"error":"ingest_not_ready"},不會寫入任何資料。
-- 這份可以重跑:約束會先拿掉再加回來,函式是 create or replace。

-- 欄位上的 check 約束名稱在不同環境可能略有不同,用定義內容找出來再重建。
do $$
declare
  cname text;
begin
  select c.conname into cname
  from pg_constraint c
  where c.conrelid = 'public.aiwr_imports'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%source%';
  if cname is not null then
    execute format('alter table public.aiwr_imports drop constraint %I', cname);
  end if;
end $$;

alter table public.aiwr_imports
  add constraint aiwr_imports_source_check
  check (source in ('paste', 'restore', 'ingest'));

-- 寫入。和 aiwr_import 分開,避免 PostgREST 在同名重載之間選錯函式。
create or replace function public.aiwr_ingest(p_raw text, p_items jsonb)
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
  insert into aiwr_imports (source, raw_text) values ('ingest', p_raw) returning id into v_id;
  insert into aiwr_items (import_id, bot, kind, key, as_of, payload)
  select v_id,
         x ->> 'bot',
         x ->> 'kind',
         coalesce(x ->> 'key', ''),
         (x ->> 'as_of')::timestamptz,
         x -> 'payload'
  from jsonb_array_elements(p_items) x;
  return v_id;
end;
$$;

-- 某個 bot 最新一個版本的 items(冪等判斷用)。沒有版本時回空陣列。
create or replace function public.aiwr_latest_bot_items(p_bot text)
returns jsonb
language sql
stable
set search_path = public
as $$
  with latest as (
    select it.import_id
    from public.aiwr_items it
    join public.aiwr_imports imp on imp.id = it.import_id
    where it.bot = p_bot
    order by imp.created_at desc, it.id desc
    limit 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'bot', it.bot,
        'kind', it.kind,
        'key', it.key,
        'as_of', it.as_of,
        'payload', it.payload
      )
      order by it.id
    ),
    '[]'::jsonb
  )
  from public.aiwr_items it
  join latest l on l.import_id = it.import_id
  where it.bot = p_bot;
$$;

revoke all on function public.aiwr_ingest(text, jsonb) from public, anon, authenticated;
revoke all on function public.aiwr_latest_bot_items(text) from public, anon, authenticated;
grant execute on function public.aiwr_ingest(text, jsonb) to service_role;
grant execute on function public.aiwr_latest_bot_items(text) to service_role;

notify pgrst, 'reload schema';

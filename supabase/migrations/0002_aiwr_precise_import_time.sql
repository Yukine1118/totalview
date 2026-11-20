-- 匯入時間改用 clock_timestamp():同一個 transaction 裡的多次匯入也有先後順序(還原判斷「之後的版本」需要)
alter table public.aiwr_imports alter column created_at set default clock_timestamp();

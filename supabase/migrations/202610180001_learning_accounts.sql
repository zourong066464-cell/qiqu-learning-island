-- Run once in the Supabase SQL Editor. No password or email is stored here.
begin;
create table public.learning_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 2000000),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);
alter table public.learning_progress enable row level security;
revoke all on table public.learning_progress from public, anon, authenticated;
grant select, insert, update on table public.learning_progress to authenticated;
create policy "Read own learning island" on public.learning_progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own learning island" on public.learning_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own learning island" on public.learning_progress
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create function public.qiqu_progress_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then new.version := 1;
  else
    if new.user_id <> old.user_id then raise exception 'Cannot change profile owner'; end if;
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.qiqu_progress_version() from public, anon, authenticated;
create trigger qiqu_progress_version before insert or update on public.learning_progress
  for each row execute function public.qiqu_progress_version();
commit;

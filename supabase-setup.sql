-- Mind Maps cloud sync schema for Supabase
-- Run in Supabase Dashboard > SQL Editor as project owner.
create table if not exists public.mindmap_libraries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"folders":[],"maps":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Optional (recommended): keep updated_at authoritative on the server so client clocks
-- cannot weaken conflict detection. Apply in Supabase SQL Editor when ready:
-- create or replace function public.touch_mindmap_libraries_updated_at()
-- returns trigger language plpgsql as $$
-- begin
--   new.updated_at := now();
--   return new;
-- end;
-- $$;
-- drop trigger if exists mindmap_libraries_set_updated_at on public.mindmap_libraries;
-- create trigger mindmap_libraries_set_updated_at
--   before update on public.mindmap_libraries
--   for each row execute function public.touch_mindmap_libraries_updated_at();

alter table public.mindmap_libraries enable row level security;

-- Users can only read and write their own library.
drop policy if exists "Users can read their own mind map library" on public.mindmap_libraries;
create policy "Users can read their own mind map library"
  on public.mindmap_libraries for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own mind map library" on public.mindmap_libraries;
create policy "Users can insert their own mind map library"
  on public.mindmap_libraries for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own mind map library" on public.mindmap_libraries;
create policy "Users can update their own mind map library"
  on public.mindmap_libraries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Enable Realtime updates for cross-device sync. Safe to run if already added.
do $$ begin
  alter publication supabase_realtime add table public.mindmap_libraries;
exception when duplicate_object then null;
when undefined_object then raise notice 'Publication supabase_realtime not found; enable Realtime for mindmap_libraries in the dashboard.';
end $$;

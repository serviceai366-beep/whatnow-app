create table if not exists public.document_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  title text not null check (char_length(title) between 1 and 160),
  source_kind text not null check (source_kind in ('file', 'text')),
  language text not null check (language in ('ru', 'lv', 'en')),
  result jsonb not null check (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 524288)
);

create index if not exists document_analyses_user_created_idx
  on public.document_analyses (user_id, created_at desc);

alter table public.document_analyses enable row level security;
revoke all on table public.document_analyses from anon;
grant select, insert, delete on table public.document_analyses to authenticated;

drop policy if exists "Users can read own analyses" on public.document_analyses;
create policy "Users can read own analyses" on public.document_analyses
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can save own analyses" on public.document_analyses;
create policy "Users can save own analyses" on public.document_analyses
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can delete own analyses" on public.document_analyses;
create policy "Users can delete own analyses" on public.document_analyses
  for delete to authenticated using (auth.uid() = user_id);

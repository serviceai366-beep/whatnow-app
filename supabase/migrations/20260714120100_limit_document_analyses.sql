-- Keep account history private and bounded. Original documents are never stored
-- in this table; only the validated structured result and display metadata.
with ranked as (
  select id, row_number() over (partition by user_id order by created_at desc, id desc) as position
  from public.document_analyses
)
delete from public.document_analyses
where id in (select id from ranked where position > 10);

create or replace function public.trim_document_analysis_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.document_analyses
  where user_id = new.user_id
    and id in (
      select id
      from public.document_analyses
      where user_id = new.user_id
      order by created_at desc, id desc
      offset 10
    );
  return new;
end;
$$;

revoke all on function public.trim_document_analysis_history() from public, anon, authenticated;

drop trigger if exists trim_document_analysis_history_after_insert on public.document_analyses;
create trigger trim_document_analysis_history_after_insert
after insert on public.document_analyses
for each row execute function public.trim_document_analysis_history();

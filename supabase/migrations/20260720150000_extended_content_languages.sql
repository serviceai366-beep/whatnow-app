-- Keep saved analyses, calendar events, and reminder delivery compatible with
-- every language accepted by the current document-analysis schema.
alter table public.document_analyses
  drop constraint if exists document_analyses_language_check;
alter table public.document_analyses
  add constraint document_analyses_language_check
    check (language in ('en', 'ru', 'lv', 'es', 'pt', 'fr', 'de', 'it', 'pl', 'uk', 'nl', 'ro', 'sv', 'cs'));

alter table public.calendar_events
  drop constraint if exists calendar_events_source_language_check;
alter table public.calendar_events
  add constraint calendar_events_source_language_check
    check (source_language in ('en', 'ru', 'lv', 'es', 'pt', 'fr', 'de', 'it', 'pl', 'uk', 'nl', 'ro', 'sv', 'cs'));

alter table public.email_reminders
  drop constraint if exists email_reminders_source_language_check;
alter table public.email_reminders
  add constraint email_reminders_source_language_check
    check (source_language in ('en', 'ru', 'lv', 'es', 'pt', 'fr', 'de', 'it', 'pl', 'uk', 'nl', 'ro', 'sv', 'cs'));

-- These security-definer functions predate the extended language list. Rebuild
-- their stored definitions in-place so both manual and analysis-derived events
-- can keep the source language all the way through reminder dispatch.
do $migration$
declare
  v_signature text;
  v_definition text;
  v_updated text;
  v_new_languages constant text := 'in (''en'', ''ru'', ''lv'', ''es'', ''pt'', ''fr'', ''de'', ''it'', ''pl'', ''uk'', ''nl'', ''ro'', ''sv'', ''cs'')';
begin
  foreach v_signature in array array[
    'public.confirm_analysis_calendar_event(uuid,text,text,date,time without time zone,text,boolean,text,text,integer)',
    'public.create_manual_calendar_event(uuid,text,date,time without time zone,text,boolean,text,text,text,integer)',
    'public.schedule_email_reminder(uuid,text,text,date,time without time zone,text,integer,text)'
  ] loop
    select pg_catalog.pg_get_functiondef(v_signature::pg_catalog.regprocedure)
      into v_definition;
    v_updated := pg_catalog.regexp_replace(
      v_definition,
      'in\s*\(\s*''(?:ru|lv|en)''\s*,\s*''(?:ru|lv|en)''\s*,\s*''(?:ru|lv|en)''\s*\)',
      v_new_languages,
      'g'
    );
    if v_updated <> v_definition then
      execute v_updated;
    end if;
  end loop;
end;
$migration$;

-- Calendar events are durable account data. They deliberately keep only the
-- event details required for the calendar and reminders, never the source file
-- or document text.
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_request_id uuid,
  origin text not null check (origin in ('analysis', 'manual')),
  source_analysis_id uuid references public.document_analyses(id) on delete set null,
  source_event_key text check (source_event_key is null or source_event_key ~ '^[a-z0-9_-]{1,80}$'),
  title text not null check (char_length(title) between 1 and 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  location text check (location is null or char_length(location) <= 300),
  event_local_date date not null,
  event_local_time time without time zone,
  event_at timestamptz,
  timezone text not null check (char_length(timezone) between 1 and 64),
  is_all_day boolean not null default false,
  source_language text not null check (source_language in ('ru', 'lv', 'en')),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (is_all_day and event_local_time is null and event_at is null)
    or (not is_all_day and event_local_time is not null and event_at is not null)
  ),
  check (origin = 'analysis' or (source_analysis_id is null and source_event_key is null))
);

create unique index if not exists calendar_events_source_unique
  on public.calendar_events (user_id, source_analysis_id, source_event_key)
  where source_analysis_id is not null and source_event_key is not null and deleted_at is null;
create unique index if not exists calendar_events_request_unique
  on public.calendar_events (user_id, client_request_id)
  where client_request_id is not null;
create index if not exists calendar_events_user_date_idx
  on public.calendar_events (user_id, event_local_date, event_local_time)
  where deleted_at is null and status = 'active';

alter table public.calendar_events enable row level security;
revoke all on table public.calendar_events from anon, authenticated;
grant select on table public.calendar_events to authenticated;

drop policy if exists "Users can read own calendar events" on public.calendar_events;
create policy "Users can read own calendar events" on public.calendar_events
  for select to authenticated using (auth.uid() = user_id);

-- Link the existing delivery queue to the calendar without breaking the old
-- production client during rollout. The column remains nullable for the
-- compatibility window; every new write fills it.
alter table public.email_reminders
  add column if not exists calendar_event_id uuid;
alter table public.email_reminders
  alter column analysis_id drop not null;
alter table public.email_reminders
  drop constraint if exists email_reminders_analysis_id_fkey;
alter table public.email_reminders
  add constraint email_reminders_analysis_id_fkey
  foreign key (analysis_id) references public.document_analyses(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'calendar_events_id_user_unique'
      and conrelid = 'public.calendar_events'::regclass
  ) then
    alter table public.calendar_events
      add constraint calendar_events_id_user_unique unique (id, user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'email_reminders_calendar_event_user_fkey'
      and conrelid = 'public.email_reminders'::regclass
  ) then
    alter table public.email_reminders
      add constraint email_reminders_calendar_event_user_fkey
      foreign key (calendar_event_id, user_id)
      references public.calendar_events(id, user_id) on delete cascade;
  end if;
end;
$$;

create unique index if not exists email_reminders_calendar_event_unique
  on public.email_reminders (user_id, calendar_event_id)
  where calendar_event_id is not null;

insert into public.calendar_events (
  user_id, origin, source_analysis_id, source_event_key, title,
  event_local_date, event_local_time, event_at, timezone, is_all_day,
  source_language, status, created_at, updated_at
)
select
  reminder.user_id, 'analysis', reminder.analysis_id, reminder.event_key,
  reminder.event_title, reminder.event_local_date, reminder.event_local_time,
  reminder.event_at, reminder.timezone, false, reminder.source_language,
  'active', reminder.created_at, reminder.updated_at
from public.email_reminders reminder
where reminder.calendar_event_id is null and reminder.analysis_id is not null
on conflict (user_id, source_analysis_id, source_event_key)
  where source_analysis_id is not null and source_event_key is not null and deleted_at is null
do nothing;

update public.email_reminders reminder
set calendar_event_id = event.id
from public.calendar_events event
where reminder.calendar_event_id is null
  and reminder.analysis_id is not null
  and event.user_id = reminder.user_id
  and event.source_analysis_id = reminder.analysis_id
  and event.source_event_key = reminder.event_key
  and event.deleted_at is null;

-- A defensive fallback makes a re-run safe even if a legacy row has already
-- lost its analysis link.
insert into public.calendar_events (
  user_id, client_request_id, origin, title, event_local_date,
  event_local_time, event_at, timezone, is_all_day, source_language,
  status, created_at, updated_at
)
select
  reminder.user_id, reminder.id, 'manual', reminder.event_title,
  reminder.event_local_date, reminder.event_local_time, reminder.event_at,
  reminder.timezone, false, reminder.source_language, 'active',
  reminder.created_at, reminder.updated_at
from public.email_reminders reminder
where reminder.calendar_event_id is null and reminder.analysis_id is null
on conflict (user_id, client_request_id) where client_request_id is not null
do nothing;

update public.email_reminders reminder
set calendar_event_id = event.id
from public.calendar_events event
where reminder.calendar_event_id is null
  and reminder.analysis_id is null
  and event.user_id = reminder.user_id
  and event.client_request_id = reminder.id;

-- Changing the profile time zone changes only the default for future events.
-- Existing events keep the exact local time and time zone the user confirmed.
create or replace function public.set_reminder_preferences(
  p_email_consent boolean,
  p_timezone text
)
returns public.reminder_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result public.reminder_preferences;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;

  insert into public.reminder_preferences (user_id, email_consent_at, timezone)
  values (v_user_id, case when p_email_consent then pg_catalog.now() else null end, p_timezone)
  on conflict (user_id) do update
    set email_consent_at = case
          when p_email_consent then coalesce(public.reminder_preferences.email_consent_at, excluded.email_consent_at)
          else null
        end,
        timezone = excluded.timezone,
        updated_at = pg_catalog.now()
  returning * into v_result;

  if not p_email_consent then
    update public.email_reminders
    set status = 'cancelled', locked_at = null,
        updated_at = pg_catalog.now(), last_error_code = 'consent_revoked'
    where user_id = v_user_id and status = 'scheduled';
  end if;

  return v_result;
end;
$$;

create or replace function public.ensure_calendar_email_reminder(
  p_event_id uuid,
  p_remind_before_minutes integer
)
returns public.email_reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.calendar_events;
  v_send_at timestamptz;
  v_existing_id uuid;
  v_result public.email_reminders;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_remind_before_minutes not in (60, 1440, 10080, 43200) then
    raise exception 'invalid_reminder' using errcode = '22023';
  end if;

  select * into v_event
  from public.calendar_events
  where id = p_event_id and user_id = v_user_id
    and status = 'active' and deleted_at is null
  for update;
  if v_event.id is null then
    raise exception 'calendar_event_not_found' using errcode = '22023';
  end if;
  if v_event.is_all_day or v_event.event_local_time is null or v_event.event_at is null then
    raise exception 'reminder_requires_time' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.reminder_preferences
    where user_id = v_user_id and email_consent_at is not null
  ) then
    raise exception 'consent_required' using errcode = '22023';
  end if;

  v_send_at := v_event.event_at - pg_catalog.make_interval(mins => p_remind_before_minutes);
  if v_event.event_at <= pg_catalog.now() + interval '5 minutes'
    or v_send_at <= pg_catalog.now() + interval '5 minutes' then
    raise exception 'reminder_too_late' using errcode = '22023';
  end if;

  select id into v_existing_id
  from public.email_reminders
  where user_id = v_user_id and calendar_event_id = v_event.id;
  if v_existing_id is null and (
    select count(*) from public.email_reminders
    where user_id = v_user_id and status in ('scheduled', 'sending')
  ) >= 25 then
    raise exception 'active_reminder_limit' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.email_reminders
    where user_id = v_user_id and calendar_event_id = v_event.id and status = 'sending'
  ) then
    raise exception 'reminder_sending' using errcode = '55000';
  end if;

  insert into public.email_reminders (
    user_id, analysis_id, calendar_event_id, event_key, event_title,
    event_local_date, event_local_time, event_at, timezone,
    remind_before_minutes, send_at, source_language, status,
    attempt_count, next_attempt_at, locked_at, sent_at,
    provider_email_id, last_error_code, updated_at
  ) values (
    v_user_id, v_event.source_analysis_id, v_event.id,
    coalesce(v_event.source_event_key, 'calendar_' || replace(v_event.id::text, '-', '')),
    v_event.title, v_event.event_local_date, v_event.event_local_time,
    v_event.event_at, v_event.timezone, p_remind_before_minutes,
    v_send_at, v_event.source_language, 'scheduled', 0,
    pg_catalog.now(), null, null, null, null, pg_catalog.now()
  )
  on conflict (user_id, calendar_event_id) where calendar_event_id is not null
  do update set
    analysis_id = excluded.analysis_id,
    event_key = excluded.event_key,
    event_title = excluded.event_title,
    event_local_date = excluded.event_local_date,
    event_local_time = excluded.event_local_time,
    event_at = excluded.event_at,
    timezone = excluded.timezone,
    remind_before_minutes = excluded.remind_before_minutes,
    send_at = excluded.send_at,
    source_language = excluded.source_language,
    status = 'scheduled',
    attempt_count = 0,
    next_attempt_at = pg_catalog.now(),
    locked_at = null,
    sent_at = null,
    provider_email_id = null,
    last_error_code = null,
    updated_at = pg_catalog.now()
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.confirm_analysis_calendar_event(
  p_analysis_id uuid,
  p_event_key text,
  p_event_title text,
  p_event_local_date date,
  p_event_local_time time without time zone,
  p_timezone text,
  p_is_all_day boolean,
  p_location text,
  p_notes text,
  p_remind_before_minutes integer
)
returns public.calendar_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_analysis record;
  v_source jsonb;
  v_source_language text;
  v_event_at timestamptz;
  v_result public.calendar_events;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  select result, language into v_analysis
  from public.document_analyses
  where id = p_analysis_id and user_id = v_user_id;
  if v_analysis.result is null then
    raise exception 'analysis_not_found' using errcode = '22023';
  end if;
  if p_event_key is null or p_event_key !~ '^[a-z0-9_-]{1,80}$' then
    raise exception 'invalid_event' using errcode = '22023';
  end if;

  select item into v_source
  from pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(v_analysis.result->'events') = 'array'
      then v_analysis.result->'events' else '[]'::jsonb end
  ) item
  where item->>'id' = p_event_key
  limit 1;
  if v_source is null and p_event_key ~ '^deadline_[1-9][0-9]*$' then
    v_source := (v_analysis.result->'deadlines')->(
      substring(p_event_key from '[0-9]+')::integer - 1
    );
  end if;
  if v_source is null then
    raise exception 'analysis_event_not_found' using errcode = '22023';
  end if;

  if p_event_title is null or char_length(btrim(p_event_title)) not between 1 and 200
    or p_location is not null and char_length(btrim(p_location)) > 300
    or p_notes is not null and char_length(btrim(p_notes)) > 2000
    or p_event_local_date is null
    or p_is_all_day is null
    or (p_is_all_day and p_event_local_time is not null)
    or (not p_is_all_day and p_event_local_time is null)
    or p_timezone is null or not exists (
      select 1 from pg_catalog.pg_timezone_names where name = p_timezone
    )
    or p_remind_before_minutes is not null
      and p_remind_before_minutes not in (60, 1440, 10080, 43200) then
    raise exception 'invalid_event' using errcode = '22023';
  end if;
  if p_is_all_day and p_remind_before_minutes is not null then
    raise exception 'reminder_requires_time' using errcode = '22023';
  end if;

  if p_is_all_day then
    v_event_at := null;
  else
    v_event_at := (p_event_local_date + p_event_local_time) at time zone p_timezone;
    if (v_event_at at time zone p_timezone) <> (p_event_local_date + p_event_local_time) then
      raise exception 'invalid_local_time' using errcode = '22023';
    end if;
  end if;

  if not exists (
    select 1 from public.calendar_events
    where user_id = v_user_id and source_analysis_id = p_analysis_id
      and source_event_key = p_event_key and deleted_at is null
  ) and (
    select count(*) from public.calendar_events
    where user_id = v_user_id and status = 'active' and deleted_at is null
  ) >= 100 then
    raise exception 'active_event_limit' using errcode = '22023';
  end if;

  v_source_language := case
    when v_analysis.result->>'sourceLanguage' in ('ru', 'lv', 'en')
      then v_analysis.result->>'sourceLanguage'
    else v_analysis.language
  end;

  insert into public.calendar_events (
    user_id, origin, source_analysis_id, source_event_key, title, notes,
    location, event_local_date, event_local_time, event_at, timezone,
    is_all_day, source_language, status, deleted_at, updated_at
  ) values (
    v_user_id, 'analysis', p_analysis_id, p_event_key, btrim(p_event_title),
    nullif(btrim(coalesce(p_notes, '')), ''),
    nullif(btrim(coalesce(p_location, '')), ''), p_event_local_date,
    case when p_is_all_day then null else p_event_local_time end,
    v_event_at, p_timezone, p_is_all_day, v_source_language,
    'active', null, pg_catalog.now()
  )
  on conflict (user_id, source_analysis_id, source_event_key)
    where source_analysis_id is not null and source_event_key is not null and deleted_at is null
  do update set
    title = excluded.title,
    notes = excluded.notes,
    location = excluded.location,
    event_local_date = excluded.event_local_date,
    event_local_time = excluded.event_local_time,
    event_at = excluded.event_at,
    timezone = excluded.timezone,
    is_all_day = excluded.is_all_day,
    source_language = excluded.source_language,
    status = 'active',
    updated_at = pg_catalog.now()
  returning * into v_result;

  if p_remind_before_minutes is not null and exists (
    select 1 from public.reminder_preferences
    where user_id = v_user_id and email_consent_at is not null
  ) then
    perform public.ensure_calendar_email_reminder(v_result.id, p_remind_before_minutes);
  end if;
  return v_result;
end;
$$;

create or replace function public.create_manual_calendar_event(
  p_request_id uuid,
  p_event_title text,
  p_event_local_date date,
  p_event_local_time time without time zone,
  p_timezone text,
  p_is_all_day boolean,
  p_location text,
  p_notes text,
  p_source_language text,
  p_remind_before_minutes integer
)
returns public.calendar_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event_at timestamptz;
  v_result public.calendar_events;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_request_id is null then
    raise exception 'invalid_request_id' using errcode = '22023';
  end if;
  select * into v_result from public.calendar_events
  where user_id = v_user_id and client_request_id = p_request_id;
  if v_result.id is not null then
    return v_result;
  end if;
  if p_event_title is null or char_length(btrim(p_event_title)) not between 1 and 200
    or p_location is not null and char_length(btrim(p_location)) > 300
    or p_notes is not null and char_length(btrim(p_notes)) > 2000
    or p_event_local_date is null
    or p_is_all_day is null
    or (p_is_all_day and p_event_local_time is not null)
    or (not p_is_all_day and p_event_local_time is null)
    or p_source_language not in ('ru', 'lv', 'en')
    or p_timezone is null or not exists (
      select 1 from pg_catalog.pg_timezone_names where name = p_timezone
    )
    or p_remind_before_minutes is not null
      and p_remind_before_minutes not in (60, 1440, 10080, 43200) then
    raise exception 'invalid_event' using errcode = '22023';
  end if;
  if p_is_all_day and p_remind_before_minutes is not null then
    raise exception 'reminder_requires_time' using errcode = '22023';
  end if;
  if (
    select count(*) from public.calendar_events
    where user_id = v_user_id and status = 'active' and deleted_at is null
  ) >= 100 then
    raise exception 'active_event_limit' using errcode = '22023';
  end if;

  if p_is_all_day then
    v_event_at := null;
  else
    v_event_at := (p_event_local_date + p_event_local_time) at time zone p_timezone;
    if (v_event_at at time zone p_timezone) <> (p_event_local_date + p_event_local_time) then
      raise exception 'invalid_local_time' using errcode = '22023';
    end if;
  end if;

  insert into public.calendar_events (
    user_id, client_request_id, origin, title, notes, location,
    event_local_date, event_local_time, event_at, timezone, is_all_day,
    source_language, status
  ) values (
    v_user_id, p_request_id, 'manual', btrim(p_event_title),
    nullif(btrim(coalesce(p_notes, '')), ''),
    nullif(btrim(coalesce(p_location, '')), ''), p_event_local_date,
    case when p_is_all_day then null else p_event_local_time end,
    v_event_at, p_timezone, p_is_all_day, p_source_language, 'active'
  )
  on conflict (user_id, client_request_id) where client_request_id is not null
  do nothing
  returning * into v_result;
  if v_result.id is null then
    select * into v_result from public.calendar_events
    where user_id = v_user_id and client_request_id = p_request_id;
  end if;

  if p_remind_before_minutes is not null and exists (
    select 1 from public.reminder_preferences
    where user_id = v_user_id and email_consent_at is not null
  ) then
    perform public.ensure_calendar_email_reminder(v_result.id, p_remind_before_minutes);
  end if;
  return v_result;
end;
$$;

create or replace function public.update_calendar_event(
  p_event_id uuid,
  p_expected_updated_at timestamptz,
  p_event_title text,
  p_event_local_date date,
  p_event_local_time time without time zone,
  p_timezone text,
  p_is_all_day boolean,
  p_location text,
  p_notes text,
  p_remind_before_minutes integer
)
returns public.calendar_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current public.calendar_events;
  v_event_at timestamptz;
  v_result public.calendar_events;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  select * into v_current from public.calendar_events
  where id = p_event_id and user_id = v_user_id and deleted_at is null
  for update;
  if v_current.id is null then
    raise exception 'calendar_event_not_found' using errcode = '22023';
  end if;
  if p_expected_updated_at is not null and v_current.updated_at <> p_expected_updated_at then
    raise exception 'event_conflict' using errcode = '40001';
  end if;
  if exists (
    select 1 from public.email_reminders
    where user_id = v_user_id and calendar_event_id = p_event_id and status = 'sending'
  ) then
    raise exception 'reminder_sending' using errcode = '55000';
  end if;
  if p_event_title is null or char_length(btrim(p_event_title)) not between 1 and 200
    or p_location is not null and char_length(btrim(p_location)) > 300
    or p_notes is not null and char_length(btrim(p_notes)) > 2000
    or p_event_local_date is null
    or p_is_all_day is null
    or (p_is_all_day and p_event_local_time is not null)
    or (not p_is_all_day and p_event_local_time is null)
    or p_timezone is null or not exists (
      select 1 from pg_catalog.pg_timezone_names where name = p_timezone
    )
    or p_remind_before_minutes is not null
      and p_remind_before_minutes not in (60, 1440, 10080, 43200) then
    raise exception 'invalid_event' using errcode = '22023';
  end if;
  if p_is_all_day and p_remind_before_minutes is not null then
    raise exception 'reminder_requires_time' using errcode = '22023';
  end if;

  if p_is_all_day then
    v_event_at := null;
  else
    v_event_at := (p_event_local_date + p_event_local_time) at time zone p_timezone;
    if (v_event_at at time zone p_timezone) <> (p_event_local_date + p_event_local_time) then
      raise exception 'invalid_local_time' using errcode = '22023';
    end if;
  end if;

  update public.calendar_events
  set title = btrim(p_event_title),
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      location = nullif(btrim(coalesce(p_location, '')), ''),
      event_local_date = p_event_local_date,
      event_local_time = case when p_is_all_day then null else p_event_local_time end,
      event_at = v_event_at,
      timezone = p_timezone,
      is_all_day = p_is_all_day,
      status = 'active',
      updated_at = pg_catalog.now()
  where id = p_event_id and user_id = v_user_id
  returning * into v_result;

  if p_remind_before_minutes is null then
    update public.email_reminders
    set status = 'cancelled', locked_at = null, last_error_code = null,
        updated_at = pg_catalog.now()
    where user_id = v_user_id and calendar_event_id = p_event_id
      and status in ('scheduled', 'failed');
  elsif exists (
    select 1 from public.reminder_preferences
    where user_id = v_user_id and email_consent_at is not null
  ) then
    perform public.ensure_calendar_email_reminder(v_result.id, p_remind_before_minutes);
  end if;
  return v_result;
end;
$$;

create or replace function public.delete_calendar_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_found boolean;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  update public.calendar_events
  set status = 'cancelled', deleted_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = p_event_id and user_id = v_user_id and deleted_at is null;
  v_found := found;
  if v_found then
    update public.email_reminders
    set status = 'cancelled', locked_at = null,
        last_error_code = 'event_deleted', updated_at = pg_catalog.now()
    where user_id = v_user_id and calendar_event_id = p_event_id
      and status in ('scheduled', 'sending', 'failed');
  end if;
  return v_found;
end;
$$;

create or replace function public.set_calendar_event_reminder(
  p_event_id uuid,
  p_remind_before_minutes integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.calendar_events
    where id = p_event_id and user_id = v_user_id
      and status = 'active' and deleted_at is null
  ) then
    raise exception 'calendar_event_not_found' using errcode = '22023';
  end if;
  if p_remind_before_minutes is null then
    update public.email_reminders
    set status = 'cancelled', locked_at = null, last_error_code = null,
        updated_at = pg_catalog.now()
    where user_id = v_user_id and calendar_event_id = p_event_id
      and status in ('scheduled', 'failed');
    return true;
  end if;
  perform public.ensure_calendar_email_reminder(p_event_id, p_remind_before_minutes);
  return true;
end;
$$;

-- Compatibility for an already-open result page from the previous release.
-- It now creates/updates the calendar event first and then schedules delivery.
create or replace function public.schedule_email_reminder(
  p_analysis_id uuid,
  p_event_key text,
  p_event_title text,
  p_event_local_date date,
  p_event_local_time time without time zone,
  p_timezone text,
  p_remind_before_minutes integer,
  p_source_language text
)
returns public.email_reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.calendar_events;
  v_result public.email_reminders;
begin
  select * into v_event from public.confirm_analysis_calendar_event(
    p_analysis_id, p_event_key, p_event_title, p_event_local_date,
    p_event_local_time, p_timezone, false, null, null,
    p_remind_before_minutes
  );
  select * into v_result from public.email_reminders
  where user_id = auth.uid() and calendar_event_id = v_event.id;
  return v_result;
end;
$$;

-- Never send a queued message after the event itself. Old jobs are cancelled
-- before each claim, while current in-flight jobs are also guarded by the
-- dispatcher immediately before the provider call.
create or replace function public.claim_due_email_reminders(p_limit integer default 20)
returns setof public.email_reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_limit integer;
  v_global_remaining integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(90421534);

  update public.email_reminders reminder
  set status = 'cancelled', locked_at = null,
      last_error_code = 'event_passed', updated_at = pg_catalog.now()
  where reminder.event_at <= pg_catalog.now()
    and (
      reminder.status = 'scheduled'
      or (reminder.status = 'sending' and reminder.locked_at < pg_catalog.now() - interval '10 minutes')
    );

  update public.email_reminders reminder
  set status = 'cancelled', locked_at = null,
      last_error_code = 'event_deleted', updated_at = pg_catalog.now()
  from public.calendar_events event
  where reminder.calendar_event_id = event.id
    and (event.deleted_at is not null or event.status <> 'active')
    and (
      reminder.status = 'scheduled'
      or (reminder.status = 'sending' and reminder.locked_at < pg_catalog.now() - interval '10 minutes')
    );

  select greatest(
    80 - count(*) filter (
      where sent_at > pg_catalog.now() - interval '24 hours'
        or (status = 'sending' and locked_at >= pg_catalog.now() - interval '10 minutes')
    ),
    0
  )::integer
  into v_global_remaining
  from public.email_reminders;

  v_batch_limit := least(
    least(greatest(coalesce(p_limit, 20), 1), 20),
    v_global_remaining
  );
  if v_batch_limit <= 0 then
    return;
  end if;

  return query
  with eligible as (
    select
      reminder.id,
      reminder.user_id,
      reminder.send_at,
      row_number() over (
        partition by reminder.user_id
        order by reminder.send_at, reminder.id
      ) as user_position,
      greatest(3 - coalesce(recent.reserved_count, 0), 0) as user_remaining
    from public.email_reminders reminder
    join public.reminder_preferences preference
      on preference.user_id = reminder.user_id
      and preference.email_consent_at is not null
    left join public.calendar_events event on event.id = reminder.calendar_event_id
    left join lateral (
      select count(*)::integer as reserved_count
      from public.email_reminders recent
      where recent.user_id = reminder.user_id
        and (
          recent.sent_at > pg_catalog.now() - interval '24 hours'
          or (recent.status = 'sending' and recent.locked_at >= pg_catalog.now() - interval '10 minutes')
        )
    ) recent on true
    where reminder.send_at <= pg_catalog.now()
      and reminder.event_at > pg_catalog.now()
      and reminder.next_attempt_at <= pg_catalog.now()
      and reminder.attempt_count < 3
      and (event.id is null or (event.status = 'active' and event.deleted_at is null))
      and (
        reminder.status = 'scheduled'
        or (reminder.status = 'sending' and reminder.locked_at < pg_catalog.now() - interval '10 minutes')
      )
  ),
  due as (
    select reminder.id
    from public.email_reminders reminder
    join eligible on eligible.id = reminder.id
    where eligible.user_position <= eligible.user_remaining
    order by eligible.send_at, eligible.id
    for update of reminder skip locked
    limit v_batch_limit
  )
  update public.email_reminders reminder
  set status = 'sending',
      attempt_count = reminder.attempt_count + 1,
      locked_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  from due
  where reminder.id = due.id
  returning reminder.*;
end;
$$;

revoke all on function public.ensure_calendar_email_reminder(uuid, integer) from public, anon, authenticated;
revoke all on function public.confirm_analysis_calendar_event(uuid, text, text, date, time without time zone, text, boolean, text, text, integer) from public, anon;
revoke all on function public.create_manual_calendar_event(uuid, text, date, time without time zone, text, boolean, text, text, text, integer) from public, anon;
revoke all on function public.update_calendar_event(uuid, timestamptz, text, date, time without time zone, text, boolean, text, text, integer) from public, anon;
revoke all on function public.delete_calendar_event(uuid) from public, anon;
revoke all on function public.set_calendar_event_reminder(uuid, integer) from public, anon;

grant execute on function public.confirm_analysis_calendar_event(uuid, text, text, date, time without time zone, text, boolean, text, text, integer) to authenticated;
grant execute on function public.create_manual_calendar_event(uuid, text, date, time without time zone, text, boolean, text, text, text, integer) to authenticated;
grant execute on function public.update_calendar_event(uuid, timestamptz, text, date, time without time zone, text, boolean, text, text, integer) to authenticated;
grant execute on function public.delete_calendar_event(uuid) to authenticated;
grant execute on function public.set_calendar_event_reminder(uuid, integer) to authenticated;


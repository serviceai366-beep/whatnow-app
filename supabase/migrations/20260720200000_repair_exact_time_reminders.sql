-- Reassert the exact-time (0 minute) option after the reminder quota rollout.
-- This is intentionally a forward migration: production may have retained an
-- older stored function even though the table constraint already accepts 0.
alter table public.email_reminders
  drop constraint if exists email_reminders_remind_before_minutes_check;

alter table public.email_reminders
  add constraint email_reminders_remind_before_minutes_check
  check (remind_before_minutes in (0, 60, 1440, 10080, 43200));

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
  v_existing public.email_reminders;
  v_result public.email_reminders;
  v_is_new_schedule boolean;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_remind_before_minutes is null
    or p_remind_before_minutes not in (0, 60, 1440, 10080, 43200) then
    raise exception 'invalid_reminder' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 73109)
  );

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

  select * into v_existing
  from public.email_reminders
  where user_id = v_user_id and calendar_event_id = v_event.id
  for update;

  v_is_new_schedule := v_existing.id is null
    or v_existing.status not in ('scheduled', 'sending')
    or v_existing.event_at is distinct from v_event.event_at
    or v_existing.send_at is distinct from v_send_at
    or v_existing.remind_before_minutes is distinct from p_remind_before_minutes;

  if v_existing.status = 'sending' and v_is_new_schedule then
    raise exception 'reminder_sending' using errcode = '55000';
  end if;

  if v_is_new_schedule and (
    select count(*) from public.email_reminders reminder
    where reminder.user_id = v_user_id
      and reminder.status in ('scheduled', 'sending')
      and (v_existing.id is null or reminder.id <> v_existing.id)
  ) >= 3 then
    raise exception 'active_reminder_limit' using errcode = '22023';
  end if;

  if v_is_new_schedule and (
    select count(*) from public.reminder_schedule_usage usage
    where usage.user_id = v_user_id
      and usage.created_at >= pg_catalog.now() - interval '7 days'
  ) >= 10 then
    raise exception 'weekly_reminder_limit' using errcode = '22023';
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

  if v_is_new_schedule then
    insert into public.reminder_schedule_usage (user_id, reminder_id)
    values (v_user_id, v_result.id);
  end if;

  return v_result;
end;
$$;

revoke all on function public.ensure_calendar_email_reminder(uuid, integer)
  from public, anon, authenticated;

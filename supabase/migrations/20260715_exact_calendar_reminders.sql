-- Manual calendar events may deliver an email at the exact selected time.
-- Existing document reminders keep their before-event offsets unchanged.
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
  v_existing_id uuid;
  v_result public.email_reminders;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_remind_before_minutes not in (0, 60, 1440, 10080, 43200) then
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

-- These wrappers reuse the existing strict event validation, then schedule the
-- email in the same transaction. A scheduling failure rolls the event change back.
create or replace function public.create_manual_calendar_event_with_reminder(
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
  v_result public.calendar_events;
begin
  select * into v_result from public.create_manual_calendar_event(
    p_request_id, p_event_title, p_event_local_date, p_event_local_time,
    p_timezone, p_is_all_day, p_location, p_notes, p_source_language, null
  );
  if p_remind_before_minutes is not null then
    perform public.ensure_calendar_email_reminder(v_result.id, p_remind_before_minutes);
  end if;
  return v_result;
end;
$$;

create or replace function public.update_calendar_event_with_reminder(
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
  v_result public.calendar_events;
begin
  select * into v_result from public.update_calendar_event(
    p_event_id, p_expected_updated_at, p_event_title, p_event_local_date,
    p_event_local_time, p_timezone, p_is_all_day, p_location, p_notes, null
  );
  if p_remind_before_minutes is not null then
    perform public.ensure_calendar_email_reminder(v_result.id, p_remind_before_minutes);
  end if;
  return v_result;
end;
$$;

-- Exact-time jobs get a small delivery grace window because the dispatcher runs
-- on a schedule rather than continuously. Before-event jobs are still cancelled
-- as soon as their event has passed.
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
  where (
      (reminder.remind_before_minutes = 0 and reminder.event_at <= pg_catalog.now() - interval '15 minutes')
      or (reminder.remind_before_minutes <> 0 and reminder.event_at <= pg_catalog.now())
    )
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
      and (
        reminder.event_at > pg_catalog.now()
        or (reminder.remind_before_minutes = 0 and reminder.event_at > pg_catalog.now() - interval '15 minutes')
      )
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

revoke all on function public.create_manual_calendar_event_with_reminder(uuid, text, date, time without time zone, text, boolean, text, text, text, integer) from public, anon;
revoke all on function public.update_calendar_event_with_reminder(uuid, timestamptz, text, date, time without time zone, text, boolean, text, text, integer) from public, anon;
grant execute on function public.create_manual_calendar_event_with_reminder(uuid, text, date, time without time zone, text, boolean, text, text, text, integer) to authenticated;
grant execute on function public.update_calendar_event_with_reminder(uuid, timestamptz, text, date, time without time zone, text, boolean, text, text, integer) to authenticated;


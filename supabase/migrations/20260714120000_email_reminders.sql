-- Email reminder data is private per account. Original document text and user
-- email addresses are deliberately not stored here.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.reminder_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  email_consent_at timestamptz,
  timezone text not null default 'Europe/Riga' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  analysis_id uuid not null references public.document_analyses(id) on delete cascade,
  event_key text not null check (event_key ~ '^[a-z0-9_-]{1,80}$'),
  event_title text not null check (char_length(event_title) between 1 and 200),
  event_local_date date not null,
  event_local_time time without time zone not null,
  event_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 64),
  remind_before_minutes integer not null check (remind_before_minutes in (60, 1440, 10080, 43200)),
  send_at timestamptz not null,
  source_language text not null check (source_language in ('ru', 'lv', 'en')),
  status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'sent', 'cancelled', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  provider_email_id text check (provider_email_id is null or char_length(provider_email_id) <= 100),
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, analysis_id, event_key)
);

create index if not exists email_reminders_due_idx
  on public.email_reminders (status, next_attempt_at, send_at)
  where status in ('scheduled', 'sending');
create index if not exists email_reminders_user_send_idx
  on public.email_reminders (user_id, send_at desc);
create index if not exists email_reminders_sent_idx
  on public.email_reminders (sent_at desc)
  where sent_at is not null;

alter table public.reminder_preferences enable row level security;
alter table public.email_reminders enable row level security;

revoke all on table public.reminder_preferences from anon, authenticated;
revoke all on table public.email_reminders from anon, authenticated;
grant select on table public.reminder_preferences to authenticated;
grant select on table public.email_reminders to authenticated;

drop policy if exists "Users can read own reminder preferences" on public.reminder_preferences;
create policy "Users can read own reminder preferences" on public.reminder_preferences
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can read own email reminders" on public.email_reminders;
create policy "Users can read own email reminders" on public.email_reminders
  for select to authenticated using (auth.uid() = user_id);

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
  v_previous_timezone text;
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

  select timezone into v_previous_timezone
  from public.reminder_preferences
  where user_id = v_user_id;

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
    set status = 'cancelled', locked_at = null, updated_at = pg_catalog.now(), last_error_code = 'consent_revoked'
    where user_id = v_user_id and status = 'scheduled';
  elsif v_previous_timezone is not null and v_previous_timezone <> p_timezone then
    update public.email_reminders
    set status = 'cancelled', locked_at = null, updated_at = pg_catalog.now(), last_error_code = 'timezone_change_too_late'
    where user_id = v_user_id and timezone = v_previous_timezone
      and status = 'scheduled'
      and (((event_local_date + event_local_time) at time zone p_timezone)
        - pg_catalog.make_interval(mins => remind_before_minutes)) <= pg_catalog.now() + interval '5 minutes';

    update public.email_reminders
    set timezone = p_timezone,
        event_at = (event_local_date + event_local_time) at time zone p_timezone,
        send_at = ((event_local_date + event_local_time) at time zone p_timezone)
          - pg_catalog.make_interval(mins => remind_before_minutes),
        next_attempt_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where user_id = v_user_id and timezone = v_previous_timezone and status = 'scheduled';
  end if;

  return v_result;
end;
$$;

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
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_event_at timestamptz;
  v_send_at timestamptz;
  v_existing_id uuid;
  v_result public.email_reminders;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_analysis_id is null or not exists (
    select 1 from public.document_analyses where id = p_analysis_id and user_id = v_user_id
  ) then
    raise exception 'analysis_not_found' using errcode = '22023';
  end if;
  if p_event_key is null or p_event_key !~ '^[a-z0-9_-]{1,80}$'
    or p_event_title is null or char_length(btrim(p_event_title)) not between 1 and 200
    or p_remind_before_minutes not in (60, 1440, 10080, 43200)
    or p_source_language not in ('ru', 'lv', 'en') then
    raise exception 'invalid_reminder' using errcode = '22023';
  end if;

  select timezone into v_timezone
  from public.reminder_preferences
  where user_id = v_user_id and email_consent_at is not null;
  if v_timezone is null then
    raise exception 'consent_required' using errcode = '22023';
  end if;

  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  v_timezone := p_timezone;

  v_event_at := (p_event_local_date + p_event_local_time) at time zone v_timezone;
  v_send_at := v_event_at - pg_catalog.make_interval(mins => p_remind_before_minutes);
  if v_event_at <= pg_catalog.now() + interval '5 minutes'
    or v_send_at <= pg_catalog.now() + interval '5 minutes' then
    raise exception 'reminder_too_late' using errcode = '22023';
  end if;

  select id into v_existing_id
  from public.email_reminders
  where user_id = v_user_id and analysis_id = p_analysis_id and event_key = p_event_key;
  if v_existing_id is null and (
    select count(*) from public.email_reminders
    where user_id = v_user_id and status in ('scheduled', 'sending')
  ) >= 25 then
    raise exception 'active_reminder_limit' using errcode = '22023';
  end if;

  insert into public.email_reminders (
    user_id, analysis_id, event_key, event_title, event_local_date, event_local_time,
    event_at, timezone, remind_before_minutes, send_at, source_language,
    status, attempt_count, next_attempt_at, locked_at, sent_at,
    provider_email_id, last_error_code, updated_at
  ) values (
    v_user_id, p_analysis_id, p_event_key, btrim(p_event_title), p_event_local_date, p_event_local_time,
    v_event_at, v_timezone, p_remind_before_minutes, v_send_at, p_source_language,
    'scheduled', 0, pg_catalog.now(), null, null, null, null, pg_catalog.now()
  )
  on conflict (user_id, analysis_id, event_key) do update
    set event_title = excluded.event_title,
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

create or replace function public.cancel_email_reminder(p_reminder_id uuid)
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
  update public.email_reminders
  set status = 'cancelled', locked_at = null, updated_at = pg_catalog.now(), last_error_code = null
  where id = p_reminder_id and user_id = v_user_id and status = 'scheduled';
  return found;
end;
$$;

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
  -- Serialize short claim transactions, then reserve capacity for jobs that are
  -- already being sent. This prevents overlapping cron invocations from
  -- exceeding the hard global budget.
  perform pg_catalog.pg_advisory_xact_lock(90421534);

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
      and reminder.next_attempt_at <= pg_catalog.now()
      and reminder.attempt_count < 3
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

create or replace function public.mark_email_reminder_sent(
  p_reminder_id uuid,
  p_provider_email_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.email_reminders
  set status = 'sent', sent_at = pg_catalog.now(), provider_email_id = left(p_provider_email_id, 100),
      locked_at = null, last_error_code = null, updated_at = pg_catalog.now()
  where id = p_reminder_id and status = 'sending';
  return found;
end;
$$;

create or replace function public.mark_email_reminder_failed(
  p_reminder_id uuid,
  p_error_code text,
  p_retryable boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.email_reminders
  set status = case when p_retryable and attempt_count < 3 then 'scheduled' else 'failed' end,
      next_attempt_at = case
        when p_retryable and attempt_count < 3 then pg_catalog.now() + pg_catalog.make_interval(mins => attempt_count * 5)
        else next_attempt_at
      end,
      locked_at = null,
      last_error_code = left(coalesce(p_error_code, 'unknown'), 80),
      updated_at = pg_catalog.now()
  where id = p_reminder_id and status = 'sending';
  return found;
end;
$$;

revoke all on function public.set_reminder_preferences(boolean, text) from public, anon;
revoke all on function public.schedule_email_reminder(uuid, text, text, date, time without time zone, text, integer, text) from public, anon;
revoke all on function public.cancel_email_reminder(uuid) from public, anon;
grant execute on function public.set_reminder_preferences(boolean, text) to authenticated;
grant execute on function public.schedule_email_reminder(uuid, text, text, date, time without time zone, text, integer, text) to authenticated;
grant execute on function public.cancel_email_reminder(uuid) to authenticated;

revoke all on function public.claim_due_email_reminders(integer) from public, anon, authenticated;
revoke all on function public.mark_email_reminder_sent(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_email_reminder_failed(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_due_email_reminders(integer) to service_role;
grant execute on function public.mark_email_reminder_sent(uuid, text) to service_role;
grant execute on function public.mark_email_reminder_failed(uuid, text, boolean) to service_role;

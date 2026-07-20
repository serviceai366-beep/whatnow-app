-- The exact-time dispatcher grace was added to an already-recorded migration
-- during development. Apply it explicitly so production claims jobs due now
-- before the expiration cleanup can cancel them.
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

revoke all on function public.claim_due_email_reminders(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_email_reminders(integer)
  to service_role;

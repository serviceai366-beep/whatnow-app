-- The reminder dispatcher needs read-only access to verify one-time email consent.
grant select on table public.reminder_preferences to service_role;

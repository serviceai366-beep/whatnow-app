-- Run from the Supabase SQL editor only after the Edge Function secrets have
-- been configured. Replace placeholders locally; never commit real secrets.
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'whatnow_project_url');
select vault.create_secret('YOUR_PUBLISHABLE_KEY', 'whatnow_publishable_key');
select vault.create_secret('YOUR_RANDOM_CRON_SECRET', 'whatnow_reminder_cron_secret');

select cron.schedule(
  'whatnow-dispatch-email-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'whatnow_project_url')
      || '/functions/v1/dispatch-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'whatnow_publishable_key'),
      'x-whatnow-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'whatnow_reminder_cron_secret')
    ),
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);

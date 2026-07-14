-- Private, cross-device preferences for a confirmed WhatNow? account.
create table if not exists public.user_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  ui_language text not null default 'en' check (ui_language in ('en', 'ru', 'lv')),
  analysis_language text not null default 'en' check (analysis_language in ('en', 'ru', 'lv')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  font_scale text not null default 'normal' check (font_scale in ('normal', 'large')),
  reduced_motion boolean not null default false,
  density text not null default 'comfortable' check (density in ('comfortable', 'compact')),
  week_starts_on text not null default 'monday' check (week_starts_on in ('monday', 'sunday')),
  time_format text not null default '24' check (time_format in ('12', '24')),
  default_reminder_minutes integer not null default 1440
    check (default_reminder_minutes in (60, 1440, 10080, 43200)),
  auto_save_files boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.user_profiles enable row level security;

revoke all on table public.user_profiles from public, anon, authenticated;
grant select on table public.user_profiles to authenticated;

drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile" on public.user_profiles
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.get_user_profile()
returns public.user_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result public.user_profiles;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  insert into public.user_profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select * into strict v_result
  from public.user_profiles
  where user_id = v_user_id;

  return v_result;
end;
$$;

create or replace function public.update_user_profile(
  p_ui_language text default null,
  p_analysis_language text default null,
  p_theme text default null,
  p_font_scale text default null,
  p_reduced_motion boolean default null,
  p_density text default null,
  p_week_starts_on text default null,
  p_time_format text default null,
  p_default_reminder_minutes integer default null,
  p_auto_save_files boolean default null
)
returns public.user_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result public.user_profiles;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_ui_language is not null and p_ui_language not in ('en', 'ru', 'lv') then
    raise exception 'invalid_ui_language' using errcode = '22023';
  end if;
  if p_analysis_language is not null and p_analysis_language not in ('en', 'ru', 'lv') then
    raise exception 'invalid_analysis_language' using errcode = '22023';
  end if;
  if p_theme is not null and p_theme not in ('system', 'light', 'dark') then
    raise exception 'invalid_theme' using errcode = '22023';
  end if;
  if p_font_scale is not null and p_font_scale not in ('normal', 'large') then
    raise exception 'invalid_font_scale' using errcode = '22023';
  end if;
  if p_density is not null and p_density not in ('comfortable', 'compact') then
    raise exception 'invalid_density' using errcode = '22023';
  end if;
  if p_week_starts_on is not null and p_week_starts_on not in ('monday', 'sunday') then
    raise exception 'invalid_week_start' using errcode = '22023';
  end if;
  if p_time_format is not null and p_time_format not in ('12', '24') then
    raise exception 'invalid_time_format' using errcode = '22023';
  end if;
  if p_default_reminder_minutes is not null
    and p_default_reminder_minutes not in (60, 1440, 10080, 43200) then
    raise exception 'invalid_reminder_offset' using errcode = '22023';
  end if;

  insert into public.user_profiles (
    user_id, ui_language, analysis_language, theme, font_scale, reduced_motion,
    density, week_starts_on, time_format, default_reminder_minutes, auto_save_files
  ) values (
    v_user_id,
    coalesce(p_ui_language, 'en'),
    coalesce(p_analysis_language, 'en'),
    coalesce(p_theme, 'system'),
    coalesce(p_font_scale, 'normal'),
    coalesce(p_reduced_motion, false),
    coalesce(p_density, 'comfortable'),
    coalesce(p_week_starts_on, 'monday'),
    coalesce(p_time_format, '24'),
    coalesce(p_default_reminder_minutes, 1440),
    coalesce(p_auto_save_files, true)
  )
  on conflict (user_id) do update
    set ui_language = coalesce(p_ui_language, user_profiles.ui_language),
        analysis_language = coalesce(p_analysis_language, user_profiles.analysis_language),
        theme = coalesce(p_theme, user_profiles.theme),
        font_scale = coalesce(p_font_scale, user_profiles.font_scale),
        reduced_motion = coalesce(p_reduced_motion, user_profiles.reduced_motion),
        density = coalesce(p_density, user_profiles.density),
        week_starts_on = coalesce(p_week_starts_on, user_profiles.week_starts_on),
        time_format = coalesce(p_time_format, user_profiles.time_format),
        default_reminder_minutes = coalesce(p_default_reminder_minutes, user_profiles.default_reminder_minutes),
        auto_save_files = coalesce(p_auto_save_files, user_profiles.auto_save_files),
        updated_at = pg_catalog.now()
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_user_profile() from public, anon;
revoke all on function public.update_user_profile(text, text, text, text, boolean, text, text, text, integer, boolean)
  from public, anon;
grant execute on function public.get_user_profile() to authenticated;
grant execute on function public.update_user_profile(text, text, text, text, boolean, text, text, text, integer, boolean)
  to authenticated;

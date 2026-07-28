-- The preferred model is an account setting. It is enforced as Pro-only in
-- WhatNow's server routes; free accounts always run on the safe Luna default.
alter table public.user_profiles
  add column if not exists default_model text not null default 'gpt-5.6-luna'
  check (default_model in ('gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'));

drop function if exists public.update_user_profile(text, text, text, text, boolean, text, text, text, integer, boolean);

create function public.update_user_profile(
  p_ui_language text default null,
  p_analysis_language text default null,
  p_theme text default null,
  p_font_scale text default null,
  p_reduced_motion boolean default null,
  p_density text default null,
  p_week_starts_on text default null,
  p_time_format text default null,
  p_default_reminder_minutes integer default null,
  p_auto_save_files boolean default null,
  p_default_model text default null
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
  if p_ui_language is not null and p_ui_language not in ('en', 'ru', 'lv', 'es', 'pt', 'fr', 'de') then raise exception 'invalid_ui_language' using errcode = '22023'; end if;
  if p_analysis_language is not null and p_analysis_language not in ('en', 'ru', 'lv', 'es', 'pt', 'fr', 'de', 'it', 'pl', 'uk', 'nl', 'ro', 'sv', 'cs') then raise exception 'invalid_analysis_language' using errcode = '22023'; end if;
  if p_theme is not null and p_theme not in ('system', 'light', 'dark') then raise exception 'invalid_theme' using errcode = '22023'; end if;
  if p_font_scale is not null and p_font_scale not in ('normal', 'large') then raise exception 'invalid_font_scale' using errcode = '22023'; end if;
  if p_density is not null and p_density not in ('comfortable', 'compact') then raise exception 'invalid_density' using errcode = '22023'; end if;
  if p_week_starts_on is not null and p_week_starts_on not in ('monday', 'sunday') then raise exception 'invalid_week_start' using errcode = '22023'; end if;
  if p_time_format is not null and p_time_format not in ('12', '24') then raise exception 'invalid_time_format' using errcode = '22023'; end if;
  if p_default_reminder_minutes is not null and p_default_reminder_minutes not in (60, 1440, 10080, 43200) then raise exception 'invalid_reminder_offset' using errcode = '22023'; end if;
  if p_default_model is not null and p_default_model not in ('gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol') then raise exception 'invalid_default_model' using errcode = '22023'; end if;

  insert into public.user_profiles (
    user_id, ui_language, analysis_language, theme, font_scale, reduced_motion,
    density, week_starts_on, time_format, default_reminder_minutes, auto_save_files, default_model
  ) values (
    v_user_id, coalesce(p_ui_language, 'en'), coalesce(p_analysis_language, 'en'),
    coalesce(p_theme, 'system'), coalesce(p_font_scale, 'normal'), coalesce(p_reduced_motion, false),
    coalesce(p_density, 'comfortable'), coalesce(p_week_starts_on, 'monday'), coalesce(p_time_format, '24'),
    coalesce(p_default_reminder_minutes, 1440), coalesce(p_auto_save_files, true), coalesce(p_default_model, 'gpt-5.6-luna')
  ) on conflict (user_id) do update set
    ui_language = coalesce(p_ui_language, user_profiles.ui_language),
    analysis_language = coalesce(p_analysis_language, user_profiles.analysis_language),
    theme = coalesce(p_theme, user_profiles.theme), font_scale = coalesce(p_font_scale, user_profiles.font_scale),
    reduced_motion = coalesce(p_reduced_motion, user_profiles.reduced_motion), density = coalesce(p_density, user_profiles.density),
    week_starts_on = coalesce(p_week_starts_on, user_profiles.week_starts_on), time_format = coalesce(p_time_format, user_profiles.time_format),
    default_reminder_minutes = coalesce(p_default_reminder_minutes, user_profiles.default_reminder_minutes),
    auto_save_files = coalesce(p_auto_save_files, user_profiles.auto_save_files),
    default_model = coalesce(p_default_model, user_profiles.default_model), updated_at = pg_catalog.now()
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.update_user_profile(text, text, text, text, boolean, text, text, text, integer, boolean, text) from public, anon;
grant execute on function public.update_user_profile(text, text, text, text, boolean, text, text, text, integer, boolean, text) to authenticated;

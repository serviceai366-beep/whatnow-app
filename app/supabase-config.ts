// These values are intentionally public. Supabase publishable keys identify the
// project; row-level security remains responsible for protecting user data.
const DEFAULT_SUPABASE_URL = "https://vrcbgpmevieccopqembx.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xAMpqyyKUuJ3CIt_sIo7gg_kf-NGg89";

export const SUPABASE_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL
).replace(/\/$/, "");

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.ts";
import { activePlanForUser } from "./subscription-store.ts";
import { profileDefaultModels, type ProfileDefaultModel } from "./profile-types.ts";
import type { SubscriptionPlanCode } from "./subscription-types.ts";

export const DEFAULT_MODEL: ProfileDefaultModel = "gpt-5.6-luna";

export function isSelectableModel(value: unknown): value is ProfileDefaultModel {
  return typeof value === "string" && (profileDefaultModels as readonly string[]).includes(value);
}

function rowFromPayload(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : null;
}

export async function selectedModelForUser({
  userId,
  email,
  token,
  planCode,
}: {
  userId: string;
  email: string;
  token: string;
  planCode?: SubscriptionPlanCode;
}): Promise<ProfileDefaultModel> {
  const plan = planCode ?? await activePlanForUser(userId, undefined, email);
  if (plan !== "pro" || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return DEFAULT_MODEL;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_user_profile`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const row = response.ok ? rowFromPayload(await response.json().catch(() => null)) : null;
    return isSelectableModel(row?.default_model) ? row.default_model : DEFAULT_MODEL;
  } catch {
    // A preference lookup must never stop an otherwise valid, quota-approved request.
    return DEFAULT_MODEL;
  }
}

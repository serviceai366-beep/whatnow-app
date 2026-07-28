import assert from "node:assert/strict";
import test from "node:test";

const databaseRow = {
  user_id: "11111111-1111-4111-8111-111111111111",
  ui_language: "en",
  analysis_language: "en",
  theme: "system",
  font_scale: "normal",
  reduced_motion: false,
  density: "comfortable",
  week_starts_on: "monday",
  time_format: "24",
  default_reminder_minutes: 1_440,
  auto_save_files: false,
  default_model: "gpt-5.6-luna",
};

function request(path = "/api/profile", init = {}) {
  return new Request(`https://whatnow.example${path}`, {
    ...init,
    headers: {
      Origin: "https://whatnow.example",
      "Sec-Fetch-Site": "same-origin",
      Authorization: "Bearer valid.token_123",
      ...init.headers,
    },
  });
}

test("profile endpoint enforces origin, authentication, strict input, and user-scoped RPCs", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({
        id: databaseRow.user_id,
        email: "person@example.com",
        email_confirmed_at: "2026-07-14T10:00:00.000Z",
        is_anonymous: false,
      });
    }
    if (String(url).endsWith("/rpc/get_user_profile")) return Response.json(databaseRow);
    if (String(url).endsWith("/rpc/update_user_profile")) {
      const patch = JSON.parse(String(init.body));
      return Response.json({
        ...databaseRow,
        ui_language: patch.p_ui_language ?? databaseRow.ui_language,
        reduced_motion: patch.p_reduced_motion ?? databaseRow.reduced_motion,
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const { GET, PATCH } = await import(`../app/api/profile/route.ts?test=${Date.now()}`);

    const crossSite = await GET(new Request("https://whatnow.example/api/profile", {
      headers: { Origin: "https://attacker.example", "Sec-Fetch-Site": "cross-site", Authorization: "Bearer valid.token_123" },
    }));
    assert.equal(crossSite.status, 403);
    assert.equal(calls.length, 0);

    const unauthenticated = await GET(new Request("https://whatnow.example/api/profile", {
      headers: { Origin: "https://whatnow.example", "Sec-Fetch-Site": "same-origin" },
    }));
    assert.equal(unauthenticated.status, 401);
    assert.equal(calls.length, 0);

    const getResponse = await GET(request());
    assert.equal(getResponse.status, 200);
    assert.equal(getResponse.headers.get("cache-control"), "no-store");
    assert.equal(getResponse.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.equal((await getResponse.json()).profile.uiLanguage, "en");
    assert.ok(calls.some((call) => call.url.endsWith("/rpc/get_user_profile")));

    const callsBeforeInvalid = calls.length;
    const invalidResponse = await PATCH(request("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "neon", unknown: true }),
    }));
    assert.equal(invalidResponse.status, 400);
    assert.equal(calls.length, callsBeforeInvalid);

    const patchResponse = await PATCH(request("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uiLanguage: "lv", reducedMotion: true }),
    }));
    assert.equal(patchResponse.status, 200);
    assert.deepEqual((await patchResponse.json()).profile, {
      uiLanguage: "lv",
      analysisLanguage: "en",
      theme: "system",
      fontScale: "normal",
      reducedMotion: true,
      density: "comfortable",
      weekStartsOn: "monday",
      timeFormat: "24",
      defaultReminderMinutes: 1_440,
      autoSaveFiles: false,
      defaultModel: "gpt-5.6-luna",
    });
    const rpc = calls.find((call) => call.url.endsWith("/rpc/update_user_profile"));
    assert.ok(rpc);
    assert.deepEqual(JSON.parse(String(rpc.init.body)), { p_ui_language: "lv", p_reduced_motion: true });
    assert.equal(rpc.init.headers.Authorization, "Bearer valid.token_123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

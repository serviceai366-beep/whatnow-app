import assert from "node:assert/strict";
import test from "node:test";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "../app/supabase-config.ts";
import { verifySupabaseRequest } from "../app/supabase-server-auth.ts";

function authenticatedRequest(token = "valid.test-token_123") {
  return new Request("https://whatnow.example/api/analyze", {
    headers: { authorization: `Bearer ${token}` },
  });
}

test("rejects a missing bearer token without contacting Supabase", async () => {
  let calls = 0;
  const result = await verifySupabaseRequest(
    new Request("https://whatnow.example/api/analyze"),
    async () => {
      calls += 1;
      throw new Error("fetch must not be called");
    },
  );

  assert.deepEqual(result, {
    ok: false,
    code: "authentication_required",
    status: 401,
  });
  assert.equal(calls, 0);
});

test("rejects malformed bearer headers without contacting Supabase", async (t) => {
  const malformedHeaders = [
    "Basic abc",
    "Bearer",
    "Bearer ",
    "bearer abc",
    "Bearer token with spaces",
    "Bearer token/with/slashes",
    `Bearer ${"a".repeat(4097)}`,
  ];

  for (const authorization of malformedHeaders) {
    await t.test(authorization.slice(0, 40), async () => {
      let calls = 0;
      const result = await verifySupabaseRequest(
        new Request("https://whatnow.example/api/analyze", {
          headers: { authorization },
        }),
        async () => {
          calls += 1;
          throw new Error("fetch must not be called");
        },
      );

      assert.deepEqual(result, {
        ok: false,
        code: "authentication_required",
        status: 401,
      });
      assert.equal(calls, 0);
    });
  }
});

test("accepts a confirmed Supabase user and forwards only the bearer token and public key", async () => {
  const token = "valid.test-token_123";
  let capturedUrl = "";
  let capturedInit;
  const result = await verifySupabaseRequest(authenticatedRequest(token), async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return Response.json({
      id: "2d2c2605-a53b-41a6-b1fa-a19ff6626540",
      email: "  person@example.com  ",
      email_confirmed_at: "2026-07-13T10:00:00.000Z",
      is_anonymous: false,
    });
  });

  assert.deepEqual(result, {
    ok: true,
    user: {
      id: "2d2c2605-a53b-41a6-b1fa-a19ff6626540",
      email: "person@example.com",
    },
  });
  assert.equal(capturedUrl, `${SUPABASE_URL}/auth/v1/user`);
  assert.equal(capturedInit.headers.Authorization, `Bearer ${token}`);
  assert.equal(capturedInit.headers.apikey, SUPABASE_PUBLISHABLE_KEY);
  assert.ok(capturedInit.signal instanceof AbortSignal);
});

test("rejects forged and expired tokens reported by Supabase", async (t) => {
  for (const status of [401, 403]) {
    await t.test(`upstream status ${status}`, async () => {
      const result = await verifySupabaseRequest(
        authenticatedRequest(),
        async () => new Response("invalid token", { status }),
      );

      assert.deepEqual(result, {
        ok: false,
        code: "authentication_invalid",
        status: 401,
      });
    });
  }
});

test("rejects unconfirmed and anonymous Supabase identities", async (t) => {
  const cases = [
    {
      name: "unconfirmed email",
      user: {
        id: "unconfirmed-user",
        email: "unconfirmed@example.com",
        email_confirmed_at: null,
        confirmed_at: null,
        is_anonymous: false,
      },
    },
    {
      name: "anonymous identity",
      user: {
        id: "anonymous-user",
        email: "anonymous@example.com",
        email_confirmed_at: "2026-07-13T10:00:00.000Z",
        is_anonymous: true,
      },
    },
  ];

  for (const { name, user } of cases) {
    await t.test(name, async () => {
      const result = await verifySupabaseRequest(
        authenticatedRequest(),
        async () => Response.json(user),
      );

      assert.deepEqual(result, {
        ok: false,
        code: "authentication_invalid",
        status: 401,
      });
    });
  }
});

test("fails closed when Supabase returns a server error", async () => {
  const result = await verifySupabaseRequest(
    authenticatedRequest(),
    async () => new Response("temporary failure", { status: 503 }),
  );

  assert.deepEqual(result, {
    ok: false,
    code: "authentication_unavailable",
    status: 503,
  });
});

test("fails closed when a successful upstream response is not JSON", async () => {
  const result = await verifySupabaseRequest(
    authenticatedRequest(),
    async () => new Response("not-json", {
      status: 200,
      headers: { "content-type": "text/plain" },
    }),
  );

  assert.deepEqual(result, {
    ok: false,
    code: "authentication_invalid",
    status: 401,
  });
});

test("fails closed when the Supabase request rejects", async () => {
  const result = await verifySupabaseRequest(
    authenticatedRequest(),
    async () => {
      throw new TypeError("network unavailable");
    },
  );

  assert.deepEqual(result, {
    ok: false,
    code: "authentication_unavailable",
    status: 503,
  });
});

import type { SubscriptionPlanCode, SubscriptionSnapshot, SubscriptionState } from "./subscription-types.ts";

export type SubscriptionD1Statement = {
  bind(...values: unknown[]): SubscriptionD1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
};

export type SubscriptionD1Database = {
  prepare(query: string): SubscriptionD1Statement;
  batch(statements: SubscriptionD1Statement[]): Promise<unknown>;
};

type SubscriptionRow = {
  user_id: string;
  account_reference: string;
  plan_code: SubscriptionPlanCode;
  state: SubscriptionState;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: number | null;
  cancel_at_period_end: number;
  test_mode: number;
  last_stripe_event_created: number;
  updated_at: number;
};

export type StoredSubscription = SubscriptionSnapshot & {
  userId: string;
  accountReference: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export type StripeEvent = {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: { object: Record<string, unknown> };
};

export type SubscriptionStore = {
  readForUser(userId: string): Promise<StoredSubscription | null>;
  markCheckoutPending(userId: string, accountReference: string, testMode?: boolean, now?: number): Promise<void>;
  applyStripeEvent(event: StripeEvent, now?: number): Promise<void>;
};

const SUBSCRIPTION_COLUMNS = `user_id, account_reference, plan_code, state, stripe_customer_id,
  stripe_subscription_id, current_period_end, cancel_at_period_end, test_mode, last_stripe_event_created, updated_at`;

function rowToSubscription(row: SubscriptionRow): StoredSubscription {
  return {
    userId: row.user_id,
    accountReference: row.account_reference,
    planCode: row.plan_code,
    state: row.state,
    checkoutAvailable: true,
    managementAvailable: Boolean(row.stripe_customer_id),
    testMode: Boolean(row.test_mode),
    currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end).toISOString() : null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
  };
}

function stripeId(value: unknown, prefix: string): string | null {
  return typeof value === "string" && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value) ? value : null;
}

function accountReference(object: Record<string, unknown>): string | null {
  const metadata = object.metadata;
  const value = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).whatnow_account : null;
  const fallback = object.client_reference_id;
  const candidate = typeof value === "string" ? value : typeof fallback === "string" ? fallback : "";
  return /^[a-f0-9]{40}$/.test(candidate) ? candidate : null;
}

function subscriptionState(value: unknown): SubscriptionState {
  if (value === "active" || value === "trialing") return "active";
  if (value === "canceled") return "canceled";
  return "past_due";
}

function periodEnd(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value * 1000 : null;
}

function createStore(db: SubscriptionD1Database): SubscriptionStore {
  let initialized: Promise<void> | null = null;
  const initialize = () => {
    initialized ??= (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS user_subscriptions (
        user_id TEXT PRIMARY KEY NOT NULL,
        account_reference TEXT NOT NULL UNIQUE,
        plan_code TEXT NOT NULL DEFAULT 'free',
        state TEXT NOT NULL DEFAULT 'free',
        stripe_customer_id TEXT UNIQUE,
        stripe_subscription_id TEXT UNIQUE,
        current_period_end INTEGER,
        cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
        test_mode INTEGER NOT NULL DEFAULT 1,
        last_stripe_event_created INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        received_at INTEGER NOT NULL
      )`).run();
      await db.batch([
        db.prepare("CREATE INDEX IF NOT EXISTS user_subscriptions_state_idx ON user_subscriptions (state)"),
        db.prepare("CREATE INDEX IF NOT EXISTS stripe_webhook_events_received_idx ON stripe_webhook_events (received_at)"),
      ]);
    })();
    return initialized;
  };

  return {
    async readForUser(userId) {
      await initialize();
      const row = await db.prepare(`SELECT ${SUBSCRIPTION_COLUMNS} FROM user_subscriptions WHERE user_id = ? LIMIT 1`)
        .bind(userId).first<SubscriptionRow>();
      return row ? rowToSubscription(row) : null;
    },
    async markCheckoutPending(userId, reference, testMode = true, now = Date.now()) {
      await initialize();
      await db.prepare(`INSERT INTO user_subscriptions
        (user_id, account_reference, plan_code, state, test_mode, updated_at)
        VALUES (?, ?, 'free', 'test_checkout_pending', 1, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          account_reference = excluded.account_reference,
          state = CASE WHEN user_subscriptions.state = 'active' THEN user_subscriptions.state ELSE 'test_checkout_pending' END,
          updated_at = excluded.updated_at`)
        .bind(userId, reference, now).run();
      await db.prepare("UPDATE user_subscriptions SET test_mode = ? WHERE user_id = ?")
        .bind(testMode ? 1 : 0, userId).run();
    },
    async applyStripeEvent(event, now = Date.now()) {
      await initialize();
      if (!/^evt_[A-Za-z0-9]+$/.test(event.id)) throw new Error("Invalid Stripe event");
      const object = event.data.object;
      const statements: SubscriptionD1Statement[] = [
        db.prepare("INSERT OR IGNORE INTO stripe_webhook_events (id, type, received_at) VALUES (?, ?, ?)").bind(event.id, event.type, now),
      ];

      if (event.type === "checkout.session.completed") {
        const reference = accountReference(object);
        const customer = stripeId(object.customer, "cus");
        const subscription = stripeId(object.subscription, "sub");
        const paid = object.payment_status === "paid" || object.payment_status === "no_payment_required";
        if (reference && customer && subscription && paid) {
          statements.push(db.prepare(`UPDATE user_subscriptions SET plan_code = 'pro', state = 'active',
            stripe_customer_id = ?, stripe_subscription_id = ?, test_mode = ?, last_stripe_event_created = ?, updated_at = ?
            WHERE account_reference = ? AND last_stripe_event_created <= ?`)
            .bind(customer, subscription, event.livemode ? 0 : 1, event.created, now, reference, event.created));
        }
      } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
        const reference = accountReference(object);
        const subscription = stripeId(object.id, "sub");
        const customer = stripeId(object.customer, "cus");
        const state = event.type === "customer.subscription.deleted" ? "canceled" : subscriptionState(object.status);
        if (reference && subscription && customer) {
          statements.push(db.prepare(`UPDATE user_subscriptions SET plan_code = ?, state = ?, stripe_customer_id = ?,
            stripe_subscription_id = ?, current_period_end = ?, cancel_at_period_end = ?, test_mode = ?,
            last_stripe_event_created = ?, updated_at = ?
            WHERE account_reference = ? AND last_stripe_event_created <= ?`).bind(
              state === "active" ? "pro" : "free", state, customer, subscription, periodEnd(object.current_period_end),
              object.cancel_at_period_end === true ? 1 : 0, event.livemode ? 0 : 1, event.created, now, reference, event.created,
            ));
        }
      } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
        const subscription = stripeId(object.subscription, "sub");
        if (subscription) {
          const state = event.type === "invoice.paid" ? "active" : "past_due";
          statements.push(db.prepare(`UPDATE user_subscriptions SET plan_code = ?, state = ?, last_stripe_event_created = ?, updated_at = ?
            WHERE stripe_subscription_id = ? AND last_stripe_event_created <= ?`)
            .bind(state === "active" ? "pro" : "free", state, event.created, now, subscription, event.created));
        }
      }
      await db.batch(statements);
      await db.prepare("DELETE FROM stripe_webhook_events WHERE received_at <= ?").bind(now - 90 * 24 * 60 * 60 * 1000).run();
    },
  };
}

let storePromise: Promise<SubscriptionStore | null> | null = null;

export async function getSubscriptionStore(): Promise<SubscriptionStore | null> {
  storePromise ??= (async () => {
    try {
      const runtime = await import("cloudflare:workers");
      const db = (runtime.env as unknown as { DB?: SubscriptionD1Database }).DB;
      return db ? createStore(db) : null;
    } catch {
      return null;
    }
  })();
  return storePromise;
}

export async function activePlanForUser(userId: string, store?: SubscriptionStore): Promise<SubscriptionPlanCode> {
  const resolved = store ?? await getSubscriptionStore();
  if (!resolved) return "free";
  const subscription = await resolved.readForUser(userId);
  return subscription?.state === "active" && subscription.planCode === "pro" ? "pro" : "free";
}

export function createSubscriptionStoreForTests(db: SubscriptionD1Database): SubscriptionStore {
  return createStore(db);
}

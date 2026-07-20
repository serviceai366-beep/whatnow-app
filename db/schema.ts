import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const analysisRateLimits = sqliteTable("analysis_rate_limits", {
  bucketKey: text("bucket_key").primaryKey().notNull(),
  count: integer("count").notNull().default(0),
  resetAt: integer("reset_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("analysis_rate_limits_reset_at_idx").on(table.resetAt)]);

export const analysisUsageEvents = sqliteTable("analysis_usage_events", {
  id: text("id").primaryKey().notNull(),
  userKey: text("user_key").notNull(),
  consumedAt: integer("consumed_at").notNull(),
  costUnits: integer("cost_units").notNull(),
}, (table) => [
  index("analysis_usage_events_user_time_idx").on(table.userKey, table.consumedAt),
  index("analysis_usage_events_time_idx").on(table.consumedAt),
]);

export const analysisCostEvents = sqliteTable("analysis_cost_events", {
  id: text("id").primaryKey().notNull(),
  userKeyHash: text("user_key_hash").notNull(),
  recordedAt: integer("recorded_at").notNull(),
  model: text("model").notNull(),
  costKind: text("cost_kind").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  cachedInputTokens: integer("cached_input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  estimatedCostMicrousd: integer("estimated_cost_microusd").notNull(),
}, (table) => [
  index("analysis_cost_events_time_idx").on(table.recordedAt),
  index("analysis_cost_events_user_time_idx").on(table.userKeyHash, table.recordedAt),
  check("analysis_cost_events_input_nonnegative", sql`${table.inputTokens} >= 0`),
  check("analysis_cost_events_cached_input_nonnegative", sql`${table.cachedInputTokens} >= 0`),
  check("analysis_cost_events_output_nonnegative", sql`${table.outputTokens} >= 0`),
  check("analysis_cost_events_cost_nonnegative", sql`${table.estimatedCostMicrousd} >= 0`),
]);

export const userFiles = sqliteTable("user_files", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id").notNull(),
  objectKey: text("object_key").notNull(),
  originalName: text("original_name").notNull(),
  extension: text("extension").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("user_files_object_key_unique").on(table.objectKey),
  uniqueIndex("user_files_user_sha256_unique").on(table.userId, table.sha256),
  index("user_files_user_created_idx").on(table.userId, table.createdAt),
  index("user_files_status_updated_idx").on(table.status, table.updatedAt),
  check("user_files_size_positive", sql`${table.sizeBytes} > 0`),
  check("user_files_status_valid", sql`${table.status} in ('pending', 'ready')`),
]);

export const userFileUploadEvents = sqliteTable("user_file_upload_events", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id").notNull(),
  uploadedAt: integer("uploaded_at").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
}, (table) => [
  index("user_file_upload_events_user_time_idx").on(table.userId, table.uploadedAt),
  index("user_file_upload_events_time_idx").on(table.uploadedAt),
  check("user_file_upload_events_size_positive", sql`${table.sizeBytes} > 0`),
]);

export const userSubscriptions = sqliteTable("user_subscriptions", {
  userId: text("user_id").primaryKey().notNull(),
  accountReference: text("account_reference").notNull(),
  planCode: text("plan_code").notNull().default("free"),
  state: text("state").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodEnd: integer("current_period_end"),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).notNull().default(false),
  testMode: integer("test_mode", { mode: "boolean" }).notNull().default(true),
  lastStripeEventCreated: integer("last_stripe_event_created").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("user_subscriptions_account_reference_unique").on(table.accountReference),
  uniqueIndex("user_subscriptions_customer_unique").on(table.stripeCustomerId),
  uniqueIndex("user_subscriptions_subscription_unique").on(table.stripeSubscriptionId),
  index("user_subscriptions_state_idx").on(table.state),
  check("user_subscriptions_plan_valid", sql`${table.planCode} in ('free', 'pro')`),
  check("user_subscriptions_state_valid", sql`${table.state} in ('free', 'test_checkout_pending', 'active', 'past_due', 'canceled')`),
]);

export const stripeWebhookEvents = sqliteTable("stripe_webhook_events", {
  id: text("id").primaryKey().notNull(),
  type: text("type").notNull(),
  receivedAt: integer("received_at").notNull(),
}, (table) => [index("stripe_webhook_events_received_idx").on(table.receivedAt)]);

export const supportConversations = sqliteTable("support_conversations", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id").notNull(),
  subject: text("subject").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  lastMessageAt: integer("last_message_at").notNull(),
}, (table) => [
  index("support_conversations_user_updated_idx").on(table.userId, table.updatedAt),
  index("support_conversations_updated_idx").on(table.updatedAt),
  check("support_conversations_category_valid", sql`${table.category} in ('question', 'bug', 'feature')`),
  check("support_conversations_status_valid", sql`${table.status} in ('open', 'waiting_for_user', 'resolved')`),
]);

export const supportMessages = sqliteTable("support_messages", {
  id: text("id").primaryKey().notNull(),
  conversationId: text("conversation_id").notNull().references(() => supportConversations.id, { onDelete: "cascade" }),
  senderType: text("sender_type").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("support_messages_conversation_created_idx").on(table.conversationId, table.createdAt),
  check("support_messages_sender_valid", sql`${table.senderType} in ('user', 'support')`),
]);

export const supportMessageEvents = sqliteTable("support_message_events", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("support_message_events_user_created_idx").on(table.userId, table.createdAt)]);

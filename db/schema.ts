import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

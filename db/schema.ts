import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const analysisRateLimits = sqliteTable("analysis_rate_limits", {
  bucketKey: text("bucket_key").primaryKey().notNull(),
  count: integer("count").notNull().default(0),
  resetAt: integer("reset_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("analysis_rate_limits_reset_at_idx").on(table.resetAt)]);

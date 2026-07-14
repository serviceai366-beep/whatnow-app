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

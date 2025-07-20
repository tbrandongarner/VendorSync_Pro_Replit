import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  integer,
  boolean,
  decimal,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: varchar("name").notNull(),
  shopifyStoreUrl: varchar("shopify_store_url").notNull(),
  shopifyAccessToken: varchar("shopify_access_token"),
  shopifyWebhookSecret: varchar("shopify_webhook_secret"),
  shopifyScope: varchar("shopify_scope"),
  currency: varchar("currency").default("USD"),
  timezone: varchar("timezone").default("UTC"),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: varchar("name").notNull(),
  contactEmail: varchar("contact_email").notNull(),
  phone: varchar("phone"),
  website: varchar("website"),
  logoUrl: varchar("logo_url"),
  // Secondary contact information
  secondaryContactName: varchar("secondary_contact_name"),
  secondaryContactEmail: varchar("secondary_contact_email"),
  secondaryContactPhone: varchar("secondary_contact_phone"),
  // Support contact information
  supportEmail: varchar("support_email"),
  supportPhone: varchar("support_phone"),
  // Sales contact information
  salesEmail: varchar("sales_email"),
  salesPhone: varchar("sales_phone"),
  // Business information
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }),
  syncFrequency: varchar("sync_frequency").default("daily"), // hourly, daily, weekly, manual
  dataSourceType: varchar("data_source_type").default("csv_upload"), // csv_upload, excel_upload, google_sheets, api
  dataSourceUrl: varchar("data_source_url"), // URL for Google Sheets or shared files
  dataSourceConfig: jsonb("data_source_config"), // Column mappings and configuration
  notes: text("notes"),
  status: varchar("status").default("active"), // active, inactive, syncing, error
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  storeId: integer("store_id").notNull().references(() => stores.id),
  shopifyProductId: varchar("shopify_product_id"),
  name: varchar("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 15, scale: 2 }),
  compareAtPrice: decimal("compare_at_price", { precision: 15, scale: 2 }),
  sku: varchar("sku").notNull(), // SKU is now primary identifier
  barcode: varchar("barcode"),
  inventory: integer("inventory").default(0),
  category: varchar("category"),
  brand: varchar("brand"), // Brand/vendor name for filtering
  status: varchar("status").default("active"), // active, archived, draft
  tags: jsonb("tags"),
  images: jsonb("images"),
  variants: jsonb("variants"),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  // Change tracking fields
  needsSync: boolean("needs_sync").default(false), // Indicates local changes need sync to Shopify
  lastModifiedBy: varchar("last_modified_by").default("system"), // user, system, shopify
  shopifyUpdatedAt: timestamp("shopify_updated_at"), // Track when Shopify last updated this product
  localChanges: jsonb("local_changes"), // Track what fields were changed locally
  syncConflict: boolean("sync_conflict").default(false), // Both local and Shopify changed since last sync
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const syncJobs = pgTable("sync_jobs", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  storeId: integer("store_id").notNull().references(() => stores.id),
  status: varchar("status").default("pending"), // pending, running, completed, failed
  progress: integer("progress").default(0), // 0-100
  totalItems: integer("total_items").default(0),
  processedItems: integer("processed_items").default(0),
  errors: jsonb("errors"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: varchar("type").notNull(), // vendor_sync, ai_generation, vendor_onboard, etc.
  description: text("description").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiGenerations = pgTable("ai_generations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  productId: integer("product_id").references(() => products.id),
  prompt: text("prompt").notNull(),
  generatedContent: text("generated_content").notNull(),
  model: varchar("model").default("gpt-4o"),
  tokensUsed: integer("tokens_used"),
  success: boolean("success").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  stores: many(stores),
  vendors: many(vendors),
  activities: many(activities),
  aiGenerations: many(aiGenerations),
}));

export const storesRelations = relations(stores, ({ one, many }) => ({
  user: one(users, {
    fields: [stores.userId],
    references: [users.id],
  }),
  products: many(products),
  syncJobs: many(syncJobs),
}));

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  user: one(users, {
    fields: [vendors.userId],
    references: [users.id],
  }),
  products: many(products),
  syncJobs: many(syncJobs),
}));

export const productsRelations = relations(products, ({ one }) => ({
  vendor: one(vendors, {
    fields: [products.vendorId],
    references: [vendors.id],
  }),
  store: one(stores, {
    fields: [products.storeId],
    references: [stores.id],
  }),
}));

export const syncJobsRelations = relations(syncJobs, ({ one }) => ({
  vendor: one(vendors, {
    fields: [syncJobs.vendorId],
    references: [vendors.id],
  }),
  store: one(stores, {
    fields: [syncJobs.storeId],
    references: [stores.id],
  }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  user: one(users, {
    fields: [activities.userId],
    references: [users.id],
  }),
}));

export const aiGenerationsRelations = relations(aiGenerations, ({ one }) => ({
  user: one(users, {
    fields: [aiGenerations.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [aiGenerations.productId],
    references: [products.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertStoreSchema = createInsertSchema(stores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVendorSchema = createInsertSchema(vendors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncAt: true,
}).extend({
  commissionRate: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  phone: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  secondaryContactName: z.string().optional(),
  secondaryContactEmail: z.string().email().optional().or(z.literal('')),
  secondaryContactPhone: z.string().optional(),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncAt: true,
  shopifyUpdatedAt: true,
});

// Schema for product updates (edit form)
export const updateProductSchema = createInsertSchema(products).pick({
  name: true,
  description: true,
  price: true,
  compareAtPrice: true,
  inventory: true,
  category: true,
  status: true,
  tags: true,
}).extend({
  price: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  compareAtPrice: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  inventory: z.union([z.string(), z.number()]).transform(val => Number(val)).optional(),
});

export const insertSyncJobSchema = createInsertSchema(syncJobs).omit({
  id: true,
  createdAt: true,
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true,
});

export const insertAiGenerationSchema = createInsertSchema(aiGenerations).omit({
  id: true,
  createdAt: true,
});

// Types
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof stores.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendors.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type UpdateProduct = z.infer<typeof updateProductSchema>;
export type Product = typeof products.$inferSelect;
export type InsertSyncJob = z.infer<typeof insertSyncJobSchema>;
export type SyncJob = typeof syncJobs.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activities.$inferSelect;
export type InsertAiGeneration = z.infer<typeof insertAiGenerationSchema>;
export type AiGeneration = typeof aiGenerations.$inferSelect;

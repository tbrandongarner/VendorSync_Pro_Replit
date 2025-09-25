import {
  users,
  stores,
  vendors,
  products,
  uploadedProducts,
  syncJobs,
  syncRuns,
  productSyncEvents,
  activities,
  aiGenerations,
  pricingBatches,
  pricingChanges,
  type User,
  type UpsertUser,
  type Store,
  type InsertStore,
  type Vendor,
  type InsertVendor,
  type Product,
  type InsertProduct,
  type SyncJob,
  type InsertSyncJob,
  type SyncRun,
  type InsertSyncRun,
  type ProductSyncEvent,
  type InsertProductSyncEvent,
  type Activity,
  type InsertActivity,
  type AiGeneration,
  type InsertAiGeneration,
  type UploadedProduct,
  type InsertUploadedProduct,
  type PricingBatch,
  type InsertPricingBatch,
  type PricingChange,
  type InsertPricingChange,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Store operations
  getStores(userId: string): Promise<Store[]>;
  getStoresByUser(userId: string): Promise<Store[]>;
  getStore(id: number): Promise<Store | undefined>;
  createStore(store: InsertStore): Promise<Store>;
  updateStore(id: number, updates: Partial<InsertStore>): Promise<Store>;
  deleteStore(id: number): Promise<void>;
  
  // Vendor operations
  getVendors(userId: string): Promise<Vendor[]>;
  getVendor(id: number): Promise<Vendor | undefined>;
  createVendor(vendor: InsertVendor): Promise<Vendor>;
  updateVendor(id: number, updates: Partial<InsertVendor>): Promise<Vendor>;
  deleteVendor(id: number): Promise<void>;
  
  // Product operations
  getProducts(vendorId?: number, storeId?: number): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  getProductBySku(sku: string): Promise<Product | undefined>;
  getProductByShopifyId(shopifyId: string): Promise<Product | undefined>;
  getProductsByVendor(vendorId: number): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, updates: Partial<Product>): Promise<Product>;
  deleteProduct(id: number): Promise<void>;
  updateProductImages(id: number, images: string[], primaryImage?: string | null): Promise<Product>;
  
  // Sync job operations
  getSyncJobs(vendorId?: number): Promise<SyncJob[]>;
  createSyncJob(syncJob: InsertSyncJob): Promise<SyncJob>;
  updateSyncJob(id: number, updates: Partial<InsertSyncJob>): Promise<SyncJob>;
  
  // Sync run lineage operations
  getSyncRuns(syncJobId?: number, vendorId?: number): Promise<SyncRun[]>;
  getSyncRun(id: number): Promise<SyncRun | undefined>;
  getSyncRunByRunId(runId: string): Promise<SyncRun | undefined>;
  createSyncRun(syncRun: InsertSyncRun): Promise<SyncRun>;
  updateSyncRun(id: number, updates: Partial<InsertSyncRun>): Promise<SyncRun>;
  
  // Product sync event operations
  getProductSyncEvents(syncRunId: number): Promise<ProductSyncEvent[]>;
  getProductSyncEventsBySku(sku: string, limit?: number): Promise<ProductSyncEvent[]>;
  createProductSyncEvent(event: InsertProductSyncEvent): Promise<ProductSyncEvent>;
  getLatestProductSyncEvent(sku: string): Promise<ProductSyncEvent | undefined>;
  
  // Activity operations
  getActivities(userId: string, limit?: number): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  
  // AI generation operations
  getAiGenerations(userId: string, limit?: number): Promise<AiGeneration[]>;
  createAiGeneration(generation: InsertAiGeneration): Promise<AiGeneration>;
  
  // Uploaded products operations
  getUploadedProducts(vendorId: number): Promise<any[]>;
  createUploadedProducts(products: any[]): Promise<any[]>;
  updateUploadedProduct(id: number, updates: any): Promise<any>;
  deleteUploadedProducts(vendorId: number): Promise<void>;
  
  // Pricing batch operations
  getPricingBatches(userId: string, vendorId?: number): Promise<PricingBatch[]>;
  getPricingBatch(id: number): Promise<PricingBatch | undefined>;
  createPricingBatch(batch: InsertPricingBatch): Promise<PricingBatch>;
  updatePricingBatch(id: number, updates: Partial<InsertPricingBatch>): Promise<PricingBatch>;
  deletePricingBatch(id: number): Promise<void>;
  
  // Pricing change operations
  getPricingChanges(batchId: number): Promise<PricingChange[]>;
  createPricingChanges(changes: InsertPricingChange[]): Promise<PricingChange[]>;
  updatePricingChange(id: number, updates: Partial<InsertPricingChange>): Promise<PricingChange>;
  applyPricingChanges(batchId: number): Promise<void>;
  revertPricingChanges(batchId: number): Promise<void>;
  
  // Dashboard stats
  getDashboardStats(userId: string): Promise<{
    activeVendors: number;
    syncedProducts: number;
    connectedStores: number;
    aiGenerated: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations (mandatory for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Store operations
  async getStores(userId: string): Promise<Store[]> {
    return await db.select().from(stores).where(eq(stores.userId, userId)).orderBy(desc(stores.createdAt));
  }

  async getStore(id: number): Promise<Store | undefined> {
    const [store] = await db.select().from(stores).where(eq(stores.id, id));
    return store;
  }

  async createStore(store: InsertStore): Promise<Store> {
    const [newStore] = await db.insert(stores).values(store).returning();
    return newStore;
  }

  async updateStore(id: number, updates: Partial<InsertStore>): Promise<Store> {
    const [updatedStore] = await db
      .update(stores)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(stores.id, id))
      .returning();
    return updatedStore;
  }

  async deleteStore(id: number): Promise<void> {
    await db.delete(stores).where(eq(stores.id, id));
  }

  // Vendor operations
  async getVendors(userId: string): Promise<Vendor[]> {
    return await db.select().from(vendors).where(eq(vendors.userId, userId)).orderBy(desc(vendors.createdAt));
  }

  async getVendor(id: number): Promise<Vendor | undefined> {
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id));
    return vendor;
  }

  async createVendor(vendor: InsertVendor): Promise<Vendor> {
    const [newVendor] = await db.insert(vendors).values(vendor).returning();
    return newVendor;
  }

  async updateVendor(id: number, updates: Partial<InsertVendor>): Promise<Vendor> {
    const [updatedVendor] = await db
      .update(vendors)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(vendors.id, id))
      .returning();
    return updatedVendor;
  }

  async deleteVendor(id: number): Promise<void> {
    await db.delete(vendors).where(eq(vendors.id, id));
  }

  // Product operations
  async getProducts(vendorId?: number, storeId?: number): Promise<Product[]> {
    if (vendorId && storeId) {
      return await db.select().from(products)
        .where(and(eq(products.vendorId, vendorId), eq(products.storeId, storeId)))
        .orderBy(desc(products.createdAt));
    } else if (vendorId) {
      return await db.select().from(products)
        .where(eq(products.vendorId, vendorId))
        .orderBy(desc(products.createdAt));
    } else if (storeId) {
      return await db.select().from(products)
        .where(eq(products.storeId, storeId))
        .orderBy(desc(products.createdAt));
    }
    
    return await db.select().from(products).orderBy(desc(products.createdAt));
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async getProductBySku(sku: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.sku, sku));
    return product;
  }

  async getProductByShopifyId(shopifyId: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.shopifyProductId, shopifyId));
    return product;
  }

  async getStoresByUser(userId: string): Promise<Store[]> {
    return await db.select().from(stores).where(eq(stores.userId, userId)).orderBy(desc(stores.createdAt));
  }

  async getProductsByVendor(vendorId: number): Promise<Product[]> {
    return await db.select().from(products)
      .where(eq(products.vendorId, vendorId))
      .orderBy(desc(products.createdAt));
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async updateProduct(id: number, updates: Partial<Product>): Promise<Product> {
    const [updatedProduct] = await db
      .update(products)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return updatedProduct;
  }

  async deleteProduct(id: number): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  async updateProductImages(id: number, images: string[], primaryImage?: string | null): Promise<Product> {
    const [product] = await db
      .update(products)
      .set({ 
        images: images,
        primaryImage: primaryImage || images[0] || null,
        updatedAt: new Date()
      })
      .where(eq(products.id, id))
      .returning();
    return product;
  }

  async deleteAllProducts(): Promise<void> {
    await db.delete(products);
  }

  async deleteVendorProducts(vendorId: number): Promise<void> {
    await db.delete(products).where(eq(products.vendorId, vendorId));
  }

  // Sync job operations
  async getSyncJobs(vendorId?: number): Promise<SyncJob[]> {
    if (vendorId) {
      return await db.select().from(syncJobs)
        .where(eq(syncJobs.vendorId, vendorId))
        .orderBy(desc(syncJobs.createdAt));
    }
    
    return await db.select().from(syncJobs).orderBy(desc(syncJobs.createdAt));
  }

  async createSyncJob(syncJob: InsertSyncJob): Promise<SyncJob> {
    const [newSyncJob] = await db.insert(syncJobs).values(syncJob).returning();
    return newSyncJob;
  }

  async updateSyncJob(id: number, updates: Partial<InsertSyncJob>): Promise<SyncJob> {
    const [updatedSyncJob] = await db
      .update(syncJobs)
      .set(updates)
      .where(eq(syncJobs.id, id))
      .returning();
    return updatedSyncJob;
  }

  // Sync run lineage operations
  async getSyncRuns(syncJobId?: number, vendorId?: number): Promise<SyncRun[]> {
    if (syncJobId && vendorId) {
      return await db.select().from(syncRuns)
        .where(and(eq(syncRuns.syncJobId, syncJobId), eq(syncRuns.vendorId, vendorId)))
        .orderBy(desc(syncRuns.createdAt));
    } else if (syncJobId) {
      return await db.select().from(syncRuns)
        .where(eq(syncRuns.syncJobId, syncJobId))
        .orderBy(desc(syncRuns.createdAt));
    } else if (vendorId) {
      return await db.select().from(syncRuns)
        .where(eq(syncRuns.vendorId, vendorId))
        .orderBy(desc(syncRuns.createdAt));
    }
    
    return await db.select().from(syncRuns).orderBy(desc(syncRuns.createdAt));
  }

  async getSyncRun(id: number): Promise<SyncRun | undefined> {
    const [syncRun] = await db.select().from(syncRuns).where(eq(syncRuns.id, id));
    return syncRun;
  }

  async getSyncRunByRunId(runId: string): Promise<SyncRun | undefined> {
    const [syncRun] = await db.select().from(syncRuns).where(eq(syncRuns.runId, runId));
    return syncRun;
  }

  async createSyncRun(syncRun: InsertSyncRun): Promise<SyncRun> {
    const [newSyncRun] = await db.insert(syncRuns).values(syncRun).returning();
    return newSyncRun;
  }

  async updateSyncRun(id: number, updates: Partial<InsertSyncRun>): Promise<SyncRun> {
    const [updatedSyncRun] = await db
      .update(syncRuns)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(syncRuns.id, id))
      .returning();
    return updatedSyncRun;
  }

  // Product sync event operations
  async getProductSyncEvents(syncRunId: number): Promise<ProductSyncEvent[]> {
    return await db.select().from(productSyncEvents)
      .where(eq(productSyncEvents.syncRunId, syncRunId))
      .orderBy(desc(productSyncEvents.createdAt));
  }

  async getProductSyncEventsBySku(sku: string, limit = 50): Promise<ProductSyncEvent[]> {
    return await db.select().from(productSyncEvents)
      .where(eq(productSyncEvents.sku, sku))
      .orderBy(desc(productSyncEvents.createdAt))
      .limit(limit);
  }

  async createProductSyncEvent(event: InsertProductSyncEvent): Promise<ProductSyncEvent> {
    const [newEvent] = await db.insert(productSyncEvents).values(event).returning();
    return newEvent;
  }

  async getLatestProductSyncEvent(sku: string): Promise<ProductSyncEvent | undefined> {
    const [event] = await db.select().from(productSyncEvents)
      .where(eq(productSyncEvents.sku, sku))
      .orderBy(desc(productSyncEvents.createdAt))
      .limit(1);
    return event;
  }

  // Activity operations
  async getActivities(userId: string, limit = 10): Promise<Activity[]> {
    return await db
      .select()
      .from(activities)
      .where(eq(activities.userId, userId))
      .orderBy(desc(activities.createdAt))
      .limit(limit);
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
    const [newActivity] = await db.insert(activities).values(activity).returning();
    return newActivity;
  }

  // AI generation operations
  async getAiGenerations(userId: string, limit = 20): Promise<AiGeneration[]> {
    return await db
      .select()
      .from(aiGenerations)
      .where(eq(aiGenerations.userId, userId))
      .orderBy(desc(aiGenerations.createdAt))
      .limit(limit);
  }

  async createAiGeneration(generation: InsertAiGeneration): Promise<AiGeneration> {
    const [newGeneration] = await db.insert(aiGenerations).values(generation).returning();
    return newGeneration;
  }

  // Uploaded products operations
  async getUploadedProducts(vendorId: number): Promise<any[]> {
    return await db
      .select()
      .from(uploadedProducts)
      .where(eq(uploadedProducts.vendorId, vendorId))
      .orderBy(desc(uploadedProducts.createdAt));
  }

  async createUploadedProducts(products: any[]): Promise<any[]> {
    if (products.length === 0) return [];
    const insertedProducts = await db.insert(uploadedProducts).values(products).returning();
    return insertedProducts;
  }

  async updateUploadedProduct(id: number, updates: any): Promise<any> {
    const [updatedProduct] = await db
      .update(uploadedProducts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(uploadedProducts.id, id))
      .returning();
    return updatedProduct;
  }

  async deleteUploadedProducts(vendorId: number): Promise<void> {
    await db.delete(uploadedProducts).where(eq(uploadedProducts.vendorId, vendorId));
  }

  // Dashboard stats
  async getDashboardStats(userId: string): Promise<{
    activeVendors: number;
    syncedProducts: number;
    connectedStores: number;
    aiGenerated: number;
  }> {
    const [activeVendorsResult] = await db
      .select({ count: count() })
      .from(vendors)
      .where(and(eq(vendors.userId, userId), eq(vendors.status, 'active')));

    const [connectedStoresResult] = await db
      .select({ count: count() })
      .from(stores)
      .where(and(eq(stores.userId, userId), eq(stores.isActive, true)));

    const [syncedProductsResult] = await db
      .select({ count: count() })
      .from(products)
      .innerJoin(vendors, eq(products.vendorId, vendors.id))
      .where(eq(vendors.userId, userId));

    const [aiGeneratedResult] = await db
      .select({ count: count() })
      .from(aiGenerations)
      .where(eq(aiGenerations.userId, userId));

    return {
      activeVendors: activeVendorsResult.count,
      syncedProducts: syncedProductsResult.count,
      connectedStores: connectedStoresResult.count,
      aiGenerated: aiGeneratedResult.count,
    };
  }

  // Pricing batch operations
  async getPricingBatches(userId: string, vendorId?: number): Promise<PricingBatch[]> {
    if (vendorId) {
      return await db
        .select()
        .from(pricingBatches)
        .where(and(eq(pricingBatches.userId, userId), eq(pricingBatches.vendorId, vendorId)))
        .orderBy(desc(pricingBatches.createdAt));
    }
    
    return await db
      .select()
      .from(pricingBatches)
      .where(eq(pricingBatches.userId, userId))
      .orderBy(desc(pricingBatches.createdAt));
  }

  async getPricingBatch(id: number): Promise<PricingBatch | undefined> {
    const [batch] = await db.select().from(pricingBatches).where(eq(pricingBatches.id, id));
    return batch;
  }

  async createPricingBatch(batch: InsertPricingBatch): Promise<PricingBatch> {
    const [newBatch] = await db.insert(pricingBatches).values(batch).returning();
    return newBatch;
  }

  async updatePricingBatch(id: number, updates: Partial<InsertPricingBatch>): Promise<PricingBatch> {
    const [updatedBatch] = await db
      .update(pricingBatches)
      .set(updates)
      .where(eq(pricingBatches.id, id))
      .returning();
    return updatedBatch;
  }

  async deletePricingBatch(id: number): Promise<void> {
    // Delete all associated pricing changes first
    await db.delete(pricingChanges).where(eq(pricingChanges.batchId, id));
    // Then delete the batch
    await db.delete(pricingBatches).where(eq(pricingBatches.id, id));
  }

  // Pricing change operations
  async getPricingChanges(batchId: number): Promise<PricingChange[]> {
    return await db.select().from(pricingChanges).where(eq(pricingChanges.batchId, batchId));
  }

  async createPricingChanges(changes: InsertPricingChange[]): Promise<PricingChange[]> {
    const newChanges = await db.insert(pricingChanges).values(changes).returning();
    return newChanges;
  }

  async updatePricingChange(id: number, updates: Partial<InsertPricingChange>): Promise<PricingChange> {
    const [updatedChange] = await db
      .update(pricingChanges)
      .set(updates)
      .where(eq(pricingChanges.id, id))
      .returning();
    return updatedChange;
  }

  async applyPricingChanges(batchId: number): Promise<void> {
    // Get all pending changes for this batch
    const changes = await db
      .select()
      .from(pricingChanges)
      .where(and(
        eq(pricingChanges.batchId, batchId),
        eq(pricingChanges.status, 'pending')
      ));

    // Apply each change to the products table
    for (const change of changes) {
      await db
        .update(products)
        .set({
          price: change.newPrice,
          compareAtPrice: change.newCompareAtPrice,
          needsSync: true,
          lastModifiedBy: 'pricing_update',
          updatedAt: new Date(),
        })
        .where(eq(products.id, change.productId));

      // Mark the change as applied
      await db
        .update(pricingChanges)
        .set({
          status: 'applied',
          appliedAt: new Date(),
        })
        .where(eq(pricingChanges.id, change.id));
    }

    // Mark the batch as applied
    await db
      .update(pricingBatches)
      .set({
        status: 'applied',
        appliedAt: new Date(),
      })
      .where(eq(pricingBatches.id, batchId));
  }

  async revertPricingChanges(batchId: number): Promise<void> {
    // Get all applied changes for this batch
    const changes = await db
      .select()
      .from(pricingChanges)
      .where(and(
        eq(pricingChanges.batchId, batchId),
        eq(pricingChanges.status, 'applied')
      ));

    // Revert each change in the products table
    for (const change of changes) {
      await db
        .update(products)
        .set({
          price: change.oldPrice,
          compareAtPrice: change.oldCompareAtPrice,
          needsSync: true,
          lastModifiedBy: 'pricing_revert',
          updatedAt: new Date(),
        })
        .where(eq(products.id, change.productId));

      // Mark the change as reverted
      await db
        .update(pricingChanges)
        .set({
          status: 'reverted',
          revertedAt: new Date(),
        })
        .where(eq(pricingChanges.id, change.id));
    }

    // Mark the batch as reverted
    await db
      .update(pricingBatches)
      .set({
        status: 'reverted',
        revertedAt: new Date(),
      })
      .where(eq(pricingBatches.id, batchId));
  }
}

export const storage = new DatabaseStorage();

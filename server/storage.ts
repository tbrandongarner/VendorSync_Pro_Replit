import {
  users,
  stores,
  vendors,
  products,
  uploadedProducts,
  syncJobs,
  activities,
  aiGenerations,
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
  type Activity,
  type InsertActivity,
  type AiGeneration,
  type InsertAiGeneration,
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
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, updates: Partial<Product>): Promise<Product>;
  deleteProduct(id: number): Promise<void>;
  
  // Sync job operations
  getSyncJobs(vendorId?: number): Promise<SyncJob[]>;
  createSyncJob(syncJob: InsertSyncJob): Promise<SyncJob>;
  updateSyncJob(id: number, updates: Partial<InsertSyncJob>): Promise<SyncJob>;
  
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
    let query = db.select().from(products);
    
    if (vendorId && storeId) {
      query = query.where(and(eq(products.vendorId, vendorId), eq(products.storeId, storeId)));
    } else if (vendorId) {
      query = query.where(eq(products.vendorId, vendorId));
    } else if (storeId) {
      query = query.where(eq(products.storeId, storeId));
    }
    
    return await query.orderBy(desc(products.createdAt));
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async getProductBySku(sku: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.sku, sku));
    return product;
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

  async deleteAllProducts(): Promise<void> {
    await db.delete(products);
  }

  async deleteVendorProducts(vendorId: number): Promise<void> {
    await db.delete(products).where(eq(products.vendorId, vendorId));
  }

  // Sync job operations
  async getSyncJobs(vendorId?: number): Promise<SyncJob[]> {
    let query = db.select().from(syncJobs);
    
    if (vendorId) {
      query = query.where(eq(syncJobs.vendorId, vendorId));
    }
    
    return await query.orderBy(desc(syncJobs.createdAt));
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
}

export const storage = new DatabaseStorage();

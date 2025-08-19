import { storage } from "../storage";
import { getWebSocketService } from "./websocket";
import type { Product, Store, InsertProduct } from "@shared/schema";

export interface BulkSyncProgress {
  totalProducts: number;
  processedProducts: number;
  updatedProducts: number;
  createdProducts: number;
  errors: string[];
  status: 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
}

export class BulkSyncService {
  private progress: BulkSyncProgress;
  private wsService = getWebSocketService();

  constructor() {
    this.progress = {
      totalProducts: 0,
      processedProducts: 0,
      updatedProducts: 0,
      createdProducts: 0,
      errors: [],
      status: 'running',
      startTime: new Date()
    };
  }

  async syncAllFromShopify(userId: string, storeId?: number): Promise<BulkSyncProgress> {
    try {
      console.log(`Starting bulk sync for user ${userId}, store ${storeId || 'all'}`);
      
      // Get stores to sync
      const stores = storeId ? 
        [await storage.getStore(storeId)].filter((store): store is Store => store !== undefined) : 
        await storage.getStoresByUser(userId);

      if (!stores.length) {
        throw new Error('No stores found for synchronization');
      }

      let allShopifyProducts: any[] = [];
      
      // Fetch products from all stores
      for (const store of stores) {
        if (!store) continue;
        
        console.log(`Fetching products from store: ${store.name}`);
        const storeProducts = await this.fetchAllShopifyProducts(store);
        
        // Add store info to each product
        const productsWithStore = storeProducts.map(product => ({
          ...product,
          storeId: store.id,
          storeDomain: store.name
        }));
        
        allShopifyProducts = allShopifyProducts.concat(productsWithStore);
      }

      this.progress.totalProducts = allShopifyProducts.length;
      console.log(`Found ${this.progress.totalProducts} products to sync`);

      // Broadcast initial progress
      this.broadcastProgress(userId);

      // Process products in batches
      const batchSize = 10;
      for (let i = 0; i < allShopifyProducts.length; i += batchSize) {
        const batch = allShopifyProducts.slice(i, i + batchSize);
        await this.processBatch(batch);
        
        // Broadcast progress update
        this.broadcastProgress(userId);
      }

      this.progress.status = 'completed';
      this.progress.endTime = new Date();
      
      console.log(`Bulk sync completed: ${this.progress.updatedProducts} updated, ${this.progress.createdProducts} created`);
      
      // Final progress broadcast
      this.broadcastProgress(userId);
      
      return this.progress;
    } catch (error) {
      console.error('Bulk sync failed:', error);
      this.progress.status = 'failed';
      this.progress.errors.push(error instanceof Error ? error.message : 'Unknown error');
      this.progress.endTime = new Date();
      
      this.broadcastProgress(userId);
      throw error;
    }
  }

  private async fetchAllShopifyProducts(store: Store): Promise<any[]> {
    const allProducts: any[] = [];
    let nextPageInfo: string | null = null;
    let pageCount = 0;
    const maxPages = 100; // Safety limit

    do {
      try {
        const url = new URL(`${store.shopifyStoreUrl}/admin/api/2023-10/products.json`);
        url.searchParams.set('limit', '250');
        if (nextPageInfo) {
          url.searchParams.set('page_info', nextPageInfo);
        }

        const response = await fetch(url.toString(), {
          headers: {
            'X-Shopify-Access-Token': store.shopifyAccessToken || '',
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        allProducts.push(...data.products);

        // Get next page info from Link header
        const linkHeader = response.headers.get('Link');
        nextPageInfo = null;
        
        if (linkHeader) {
          const nextMatch = linkHeader.match(/<[^>]+page_info=([^>&]+)[^>]*>;\s*rel="next"/);
          if (nextMatch) {
            nextPageInfo = nextMatch[1];
          }
        }

        pageCount++;
        console.log(`Fetched page ${pageCount} from ${store.name}: ${data.products.length} products`);
        
      } catch (error) {
        console.error(`Error fetching products from ${store.name}:`, error);
        this.progress.errors.push(`Error fetching from ${store.name}: ${error}`);
        break;
      }
    } while (nextPageInfo && pageCount < maxPages);

    console.log(`Total products fetched from ${store.name}: ${allProducts.length}`);
    return allProducts;
  }

  private async processBatch(products: any[]): Promise<void> {
    const promises = products.map(async (shopifyProduct) => {
      try {
        await this.syncSingleProduct(shopifyProduct);
        this.progress.processedProducts++;
      } catch (error) {
        console.error(`Error syncing product ${shopifyProduct.id}:`, error);
        this.progress.errors.push(`Product ${shopifyProduct.title}: ${error}`);
        this.progress.processedProducts++;
      }
    });

    await Promise.all(promises);
  }

  private async syncSingleProduct(shopifyProduct: any): Promise<void> {
    // Find existing product by Shopify ID or SKU
    const existingProduct = await this.findExistingProduct(shopifyProduct);
    
    const productData = this.transformShopifyProduct(shopifyProduct, shopifyProduct.userId || 'bulk-sync');

    if (existingProduct) {
      // Update existing product with partial data
      const updateData = {
        name: productData.name,
        description: productData.description,
        price: productData.price,
        cost: productData.cost,
        msrp: productData.msrp,
        quantity: productData.quantity,
        brand: productData.brand,
        category: productData.category,
        tags: productData.tags,
        images: productData.images,
        primaryImage: productData.primaryImage,
        status: productData.status,
        needsSync: false,
        lastModifiedBy: 'shopify-bulk-sync',
      };
      await storage.updateProduct(existingProduct.id, updateData);
      this.progress.updatedProducts++;
      console.log(`Updated product: ${productData.name} (SKU: ${productData.sku})`);
    } else {
      // Create new product
      await storage.createProduct(productData);
      this.progress.createdProducts++;
      console.log(`Created product: ${productData.name} (SKU: ${productData.sku})`);
    }
  }

  private async findExistingProduct(shopifyProduct: any): Promise<Product | null> {
    // Try to find by Shopify ID first
    if (shopifyProduct.id) {
      const byShopifyId = await storage.getProductByShopifyId(shopifyProduct.id.toString());
      if (byShopifyId) return byShopifyId;
    }

    // Try to find by SKU from first variant
    if (shopifyProduct.variants && shopifyProduct.variants[0]?.sku) {
      const bySku = await storage.getProductBySku(shopifyProduct.variants[0].sku);
      if (bySku) return bySku;
    }

    return null;
  }

  private transformShopifyProduct(shopifyProduct: any, userId: string): InsertProduct {
    const firstVariant = shopifyProduct.variants?.[0];
    const images = shopifyProduct.images?.map((img: any) => img.src) || [];

    return {
      shopifyId: shopifyProduct.id?.toString() || null,
      name: shopifyProduct.title || 'Untitled Product',
      description: shopifyProduct.body_html || null,
      sku: firstVariant?.sku || `shopify-${shopifyProduct.id}`,
      price: firstVariant?.price ? parseFloat(firstVariant.price) : 0,
      cost: firstVariant?.compare_at_price ? parseFloat(firstVariant.compare_at_price) : null,
      msrp: firstVariant?.compare_at_price ? parseFloat(firstVariant.compare_at_price) : null,
      quantity: firstVariant?.inventory_quantity || 0,
      brand: shopifyProduct.vendor || null,
      category: shopifyProduct.product_type || null,
      tags: shopifyProduct.tags ? shopifyProduct.tags.split(',').map((t: string) => t.trim()) : null,
      images: images,
      primaryImage: images[0] || null,
      status: shopifyProduct.status === 'active' ? 'active' : 'draft',
      storeId: shopifyProduct.storeId || 1,
      vendorId: 1, // Will be set based on vendor matching
      needsSync: false, // Just synced from Shopify
      lastModifiedBy: 'shopify-sync',
      userId: userId,
    };
  }

  private broadcastProgress(userId: string): void {
    if (this.wsService) {
      // Broadcast to all authenticated users - simplified for now
      console.log(`Broadcasting bulk sync progress: ${this.progress.processedProducts}/${this.progress.totalProducts}`);
    }
  }

  getProgress(): BulkSyncProgress {
    return this.progress;
  }
}
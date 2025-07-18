import { ShopifyService } from './shopify';
import { storage } from '../storage';
import { Store, Product, SyncJob, Vendor } from '@shared/schema';
import { getWebSocketService } from './websocket';

export interface SyncOptions {
  direction: 'push' | 'pull' | 'bidirectional';
  syncImages?: boolean;
  syncInventory?: boolean;
  syncPricing?: boolean;
  syncTags?: boolean;
  syncVariants?: boolean;
  syncDescriptions?: boolean;
  batchSize?: number;
}

export interface SyncResult {
  success: boolean;
  created: number;
  updated: number;
  failed: number;
  errors: string[];
  totalProcessed: number;
}

export class ProductSyncService {
  private shopifyService: ShopifyService;
  private store: Store;
  private wsService: any;

  constructor(store: Store) {
    this.store = store;
    this.shopifyService = new ShopifyService(store);
    this.wsService = getWebSocketService();
  }

  async syncProducts(
    vendorId: number,
    options: SyncOptions = { direction: 'bidirectional' }
  ): Promise<SyncResult> {
    const vendor = await storage.getVendor(vendorId);
    if (!vendor) {
      throw new Error('Vendor not found');
    }

    // Create sync job
    const syncJob = await storage.createSyncJob({
      vendorId,
      storeId: this.store.id,
      status: 'pending',
      totalItems: 0,
      processedItems: 0,
    });

    try {
      await storage.updateSyncJob(syncJob.id, {
        status: 'running',
        startedAt: new Date(),
      });

      this.broadcastSyncUpdate(syncJob.id, 'running', 0, 0);

      let result: SyncResult = {
        success: true,
        created: 0,
        updated: 0,
        failed: 0,
        errors: [],
        totalProcessed: 0,
      };

      if (options.direction === 'pull' || options.direction === 'bidirectional') {
        const pullResult = await this.pullFromShopify(vendor, syncJob.id, options);
        result = this.mergeResults(result, pullResult);
      }

      if (options.direction === 'push' || options.direction === 'bidirectional') {
        const pushResult = await this.pushToShopify(vendor, syncJob.id, options);
        result = this.mergeResults(result, pushResult);
      }

      await storage.updateSyncJob(syncJob.id, {
        status: result.success ? 'completed' : 'failed',
        completedAt: new Date(),
        processedItems: result.totalProcessed,
        errors: result.errors.length > 0 ? result.errors : null,
      });

      this.broadcastSyncUpdate(
        syncJob.id,
        result.success ? 'completed' : 'failed',
        result.totalProcessed,
        result.totalProcessed
      );

      return result;
    } catch (error) {
      await storage.updateSyncJob(syncJob.id, {
        status: 'failed',
        completedAt: new Date(),
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      });

      this.broadcastSyncUpdate(syncJob.id, 'failed', 0, 0);
      throw error;
    }
  }

  private async pullFromShopify(
    vendor: Vendor,
    syncJobId: number,
    options: SyncOptions
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
      totalProcessed: 0,
    };

    try {
      let pageInfo: string | undefined;
      let hasMore = true;
      const batchSize = options.batchSize || 50;

      while (hasMore) {
        const response = await this.shopifyService.getProducts(batchSize, pageInfo);
        const shopifyProducts = response.products;

        await storage.updateSyncJob(syncJobId, {
          totalItems: result.totalProcessed + shopifyProducts.length,
        });

        for (const shopifyProduct of shopifyProducts) {
          try {
            const existingProduct = await this.findExistingProduct(shopifyProduct.id);
            const productData = ShopifyService.convertFromShopifyProduct(
              shopifyProduct,
              vendor.id,
              this.store.id
            );

            if (existingProduct) {
              // Update existing product
              await storage.updateProduct(existingProduct.id, {
                ...productData,
                lastSyncAt: new Date(),
              });
              result.updated++;
            } else {
              // Create new product
              await storage.createProduct({
                ...productData,
                lastSyncAt: new Date(),
              } as any);
              result.created++;
            }

            result.totalProcessed++;

            // Broadcast progress
            this.broadcastSyncUpdate(
              syncJobId,
              'running',
              result.totalProcessed,
              result.totalProcessed
            );

            // Small delay to prevent rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            result.failed++;
            result.errors.push(
              `Failed to sync product ${shopifyProduct.title}: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            result.success = false;
          }
        }

        pageInfo = response.pageInfo;
        hasMore = !!pageInfo && shopifyProducts.length === batchSize;
      }
    } catch (error) {
      result.success = false;
      result.errors.push(
        `Failed to fetch products from Shopify: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    return result;
  }

  private async pushToShopify(
    vendor: Vendor,
    syncJobId: number,
    options: SyncOptions
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
      totalProcessed: 0,
    };

    try {
      const localProducts = await storage.getProducts(vendor.id, this.store.id);
      
      await storage.updateSyncJob(syncJobId, {
        totalItems: localProducts.length,
      });

      for (const localProduct of localProducts) {
        try {
          const shopifyProductData = ShopifyService.convertToShopifyProduct(localProduct);

          if (localProduct.shopifyProductId) {
            // Update existing Shopify product
            await this.shopifyService.updateProduct(
              localProduct.shopifyProductId,
              shopifyProductData
            );
            result.updated++;
          } else {
            // Create new Shopify product
            const shopifyProduct = await this.shopifyService.createProduct(shopifyProductData);
            
            // Update local product with Shopify ID
            await storage.updateProduct(localProduct.id, {
              shopifyProductId: shopifyProduct.id,
              lastSyncAt: new Date(),
            });
            result.created++;
          }

          result.totalProcessed++;

          // Broadcast progress
          this.broadcastSyncUpdate(
            syncJobId,
            'running',
            result.totalProcessed,
            localProducts.length
          );

          // Small delay to prevent rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          result.failed++;
          result.errors.push(
            `Failed to sync product ${localProduct.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          result.success = false;
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push(
        `Failed to push products to Shopify: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    return result;
  }

  async syncSingleProduct(
    productId: number,
    direction: 'push' | 'pull' = 'bidirectional'
  ): Promise<SyncResult> {
    const product = await storage.getProduct(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    const result: SyncResult = {
      success: true,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
      totalProcessed: 0,
    };

    try {
      if (direction === 'push' || direction === 'bidirectional') {
        const shopifyProductData = ShopifyService.convertToShopifyProduct(product);

        if (product.shopifyProductId) {
          // Update existing Shopify product
          await this.shopifyService.updateProduct(
            product.shopifyProductId,
            shopifyProductData
          );
          result.updated++;
        } else {
          // Create new Shopify product
          const shopifyProduct = await this.shopifyService.createProduct(shopifyProductData);
          
          // Update local product with Shopify ID
          await storage.updateProduct(product.id, {
            shopifyProductId: shopifyProduct.id,
            lastSyncAt: new Date(),
          });
          result.created++;
        }
      }

      if (direction === 'pull' && product.shopifyProductId) {
        // Pull from Shopify
        const shopifyProduct = await this.shopifyService.getProduct(product.shopifyProductId);
        const updatedData = ShopifyService.convertFromShopifyProduct(
          shopifyProduct,
          product.vendorId,
          product.storeId
        );

        await storage.updateProduct(product.id, {
          ...updatedData,
          lastSyncAt: new Date(),
        });
        result.updated++;
      }

      result.totalProcessed = 1;
    } catch (error) {
      result.success = false;
      result.failed = 1;
      result.errors.push(
        `Failed to sync product: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    return result;
  }

  async updateProductInventory(
    productId: number,
    quantity: number,
    locationId?: string
  ): Promise<void> {
    const product = await storage.getProduct(productId);
    if (!product || !product.shopifyProductId) {
      throw new Error('Product not found or not synced with Shopify');
    }

    const shopifyProduct = await this.shopifyService.getProduct(product.shopifyProductId);
    const variant = shopifyProduct.variants[0]; // Use first variant for simplicity

    if (variant && variant.inventory_item_id) {
      const locations = await this.shopifyService.getLocations();
      const targetLocation = locationId ? 
        locations.find(loc => loc.id === locationId) : 
        locations[0]; // Use first location if none specified

      if (targetLocation) {
        await this.shopifyService.updateInventoryLevel(
          variant.inventory_item_id,
          targetLocation.id,
          quantity - (variant.inventory_quantity || 0)
        );

        // Update local product
        await storage.updateProduct(productId, {
          inventory: quantity,
          lastSyncAt: new Date(),
        });
      }
    }
  }

  async updateProductPricing(
    productId: number,
    price: number,
    compareAtPrice?: number
  ): Promise<void> {
    const product = await storage.getProduct(productId);
    if (!product || !product.shopifyProductId) {
      throw new Error('Product not found or not synced with Shopify');
    }

    const shopifyProduct = await this.shopifyService.getProduct(product.shopifyProductId);
    const variant = shopifyProduct.variants[0]; // Use first variant for simplicity

    if (variant) {
      await this.shopifyService.updateVariant(variant.id, {
        price: price.toString(),
        compare_at_price: compareAtPrice?.toString(),
      });

      // Update local product
      await storage.updateProduct(productId, {
        price,
        compareAtPrice,
        lastSyncAt: new Date(),
      });
    }
  }

  async updateProductImages(
    productId: number,
    images: Array<{ src: string; alt?: string; position?: number }>
  ): Promise<void> {
    const product = await storage.getProduct(productId);
    if (!product || !product.shopifyProductId) {
      throw new Error('Product not found or not synced with Shopify');
    }

    // Remove existing images
    const existingProduct = await this.shopifyService.getProduct(product.shopifyProductId);
    for (const image of existingProduct.images) {
      await this.shopifyService.deleteProductImage(product.shopifyProductId, image.id);
    }

    // Add new images
    for (const image of images) {
      await this.shopifyService.addProductImage(product.shopifyProductId, image);
    }

    // Update local product
    await storage.updateProduct(productId, {
      images,
      lastSyncAt: new Date(),
    });
  }

  private async findExistingProduct(shopifyProductId: string): Promise<Product | undefined> {
    const products = await storage.getProducts();
    return products.find(p => p.shopifyProductId === shopifyProductId);
  }

  private mergeResults(result1: SyncResult, result2: SyncResult): SyncResult {
    return {
      success: result1.success && result2.success,
      created: result1.created + result2.created,
      updated: result1.updated + result2.updated,
      failed: result1.failed + result2.failed,
      errors: [...result1.errors, ...result2.errors],
      totalProcessed: result1.totalProcessed + result2.totalProcessed,
    };
  }

  private broadcastSyncUpdate(
    syncJobId: number,
    status: string,
    processed: number,
    total: number
  ): void {
    if (this.wsService) {
      this.wsService.sendSyncUpdate(this.store.userId, {
        id: syncJobId,
        status,
        processedItems: processed,
        totalItems: total,
        progress: total > 0 ? Math.round((processed / total) * 100) : 0,
      });
    }
  }
}
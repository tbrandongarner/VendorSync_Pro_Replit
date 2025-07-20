import { ShopifyService } from './shopify';
import { storage } from '../storage';
import { Store, Product, SyncJob, Vendor } from '@shared/schema';
import { getWebSocketService } from './websocket';
import { parseCSV, parseExcel, parseGoogleSheets, ParsedProduct, DataSourceConfig } from './file-parser';

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

      // Get vendor product data from their data source
      const vendorProducts = await this.getVendorProducts(vendor);
      
      // If we have vendor products, use SKU-based sync, otherwise pull all products
      if (vendorProducts.length > 0) {
        // Sync with Shopify using SKU-based matching
        result = await this.syncWithShopifyBySKU(vendor, vendorProducts, syncJob.id, options);
      } else {
        // If no vendor file data, pull all products from Shopify for this vendor
        result = await this.pullFromShopify(vendor, syncJob.id, options);
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
        let shopifyProducts = response.products;

        // Filter products that match this vendor
        // Include products where vendor field matches our vendor name or products with no vendor set
        shopifyProducts = shopifyProducts.filter(product => {
          // Check if product vendor matches our vendor name (case insensitive)
          if (product.vendor && product.vendor.toLowerCase() === vendor.name.toLowerCase()) {
            return true;
          }
          
          // For products with no vendor set, check if they might belong to this vendor
          // by looking at product title, tags, or other identifiers
          if (!product.vendor) {
            const productTitle = product.title.toLowerCase();
            const vendorName = vendor.name.toLowerCase();
            
            // Check if vendor name appears in product title
            if (productTitle.includes(vendorName)) {
              return true;
            }
            
            // Check tags for vendor name
            if (product.tags && Array.isArray(product.tags)) {
              const hasVendorTag = product.tags.some(tag => 
                tag.toLowerCase().includes(vendorName)
              );
              if (hasVendorTag) {
                return true;
              }
            }
          }
          
          return false;
        });

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
            
            // Set vendor name as brand for consistency
            productData.brand = vendor.name;
            productData.status = shopifyProduct.status === 'active' ? 'active' : 'archived';

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

  // New methods for file-based sync
  private async getVendorProducts(vendor: Vendor): Promise<ParsedProduct[]> {
    if (!vendor.dataSourceType) {
      return [];
    }

    let config: DataSourceConfig = {};
    if (vendor.dataSourceConfig) {
      try {
        config = JSON.parse(vendor.dataSourceConfig as string);
      } catch (error) {
        console.warn('Failed to parse vendor data source config:', error);
      }
    }

    switch (vendor.dataSourceType) {
      case 'google_sheets':
        if (!vendor.dataSourceUrl) {
          throw new Error('Google Sheets URL is required');
        }
        return await parseGoogleSheets(vendor.dataSourceUrl, config);
      
      case 'csv_upload':
      case 'excel_upload':
        // For file uploads, we'd need to handle the uploaded files
        // For now, return empty array - this would be handled by file upload endpoint
        return [];
      
      case 'api':
        if (!vendor.dataSourceUrl) {
          throw new Error('API endpoint URL is required');
        }
        return await this.fetchFromVendorAPI(vendor.dataSourceUrl, config);
      
      default:
        return [];
    }
  }

  private async fetchFromVendorAPI(apiUrl: string, config: DataSourceConfig): Promise<ParsedProduct[]> {
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      // Assume API returns array of products
      if (!Array.isArray(data)) {
        throw new Error('API must return an array of products');
      }

      return data.map(item => this.mapAPIResponseToProduct(item, config));
    } catch (error) {
      throw new Error(`Failed to fetch from vendor API: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private mapAPIResponseToProduct(item: any, config: DataSourceConfig): ParsedProduct {
    return {
      sku: String(item[config.sku_column || 'sku'] || item.sku || '').trim(),
      name: String(item[config.name_column || 'name'] || item.name || '').trim(),
      description: item[config.description_column || 'description'] || item.description,
      price: parseFloat(item[config.price_column || 'price'] || item.price || 0),
      compareAtPrice: parseFloat(item[config.compare_price_column || 'compareAtPrice'] || item.compareAtPrice || 0),
      inventory: parseInt(item[config.inventory_column || 'inventory'] || item.inventory || 0),
      category: item[config.category_column || 'category'] || item.category,
      barcode: item[config.barcode_column || 'barcode'] || item.barcode,
      images: item[config.images_column || 'images'] || item.images || [],
    };
  }

  private async syncWithShopifyBySKU(
    vendor: Vendor,
    vendorProducts: ParsedProduct[],
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

    if (vendorProducts.length === 0) {
      return result;
    }

    try {
      // Get all products from Shopify
      const shopifyResponse = await this.shopifyService.getAllProducts();
      const shopifyProducts = shopifyResponse.products;

      // Create SKU-based lookup map
      const shopifyProductsBySKU = new Map();
      shopifyProducts.forEach(product => {
        if (product.variants && product.variants.length > 0) {
          product.variants.forEach(variant => {
            if (variant.sku) {
              shopifyProductsBySKU.set(variant.sku, { product, variant });
            }
          });
        }
      });

      await storage.updateSyncJob(syncJobId, {
        totalItems: vendorProducts.length,
      });

      // Process each vendor product
      for (const vendorProduct of vendorProducts) {
        try {
          if (!vendorProduct.sku) {
            result.failed++;
            result.errors.push(`Product "${vendorProduct.name}" has no SKU - skipping`);
            continue;
          }

          const shopifyMatch = shopifyProductsBySKU.get(vendorProduct.sku);
          let dbProduct = await this.findExistingProductBySKU(vendorProduct.sku, vendor.id);

          if (shopifyMatch) {
            // Product exists in Shopify - update it
            const shopifyProductData = this.convertVendorToShopifyProduct(vendorProduct, vendor.name);
            
            if (options.syncPricing && vendorProduct.price) {
              shopifyProductData.variants[0].price = vendorProduct.price.toString();
            }
            if (options.syncInventory && vendorProduct.inventory !== undefined) {
              shopifyProductData.variants[0].inventory_quantity = vendorProduct.inventory;
            }

            await this.shopifyService.updateProduct(shopifyMatch.product.id, shopifyProductData);

            // Update or create database record
            const productData = {
              vendorId: vendor.id,
              storeId: this.store.id,
              shopifyProductId: shopifyMatch.product.id,
              name: vendorProduct.name,
              description: vendorProduct.description || null,
              price: vendorProduct.price || null,
              compareAtPrice: vendorProduct.compareAtPrice || null,
              sku: vendorProduct.sku,
              barcode: vendorProduct.barcode || null,
              inventory: vendorProduct.inventory || 0,
              category: vendorProduct.category || null,
              brand: vendor.name, // Set vendor name as brand
              status: 'active',
              images: vendorProduct.images ? JSON.stringify(vendorProduct.images) : null,
              isActive: true,
              lastSyncAt: new Date(),
            };

            if (dbProduct) {
              await storage.updateProduct(dbProduct.id, productData);
              result.updated++;
            } else {
              await storage.createProduct(productData as any);
              result.created++;
            }
          } else {
            // Product doesn't exist in Shopify - create it if pushing
            if (options.direction === 'push' || options.direction === 'bidirectional') {
              const shopifyProductData = this.convertVendorToShopifyProduct(vendorProduct, vendor.name);
              const newShopifyProduct = await this.shopifyService.createProduct(shopifyProductData);

              // Create database record
              await storage.createProduct({
                vendorId: vendor.id,
                storeId: this.store.id,
                shopifyProductId: newShopifyProduct.id,
                name: vendorProduct.name,
                description: vendorProduct.description || null,
                price: vendorProduct.price || null,
                compareAtPrice: vendorProduct.compareAtPrice || null,
                sku: vendorProduct.sku,
                barcode: vendorProduct.barcode || null,
                inventory: vendorProduct.inventory || 0,
                category: vendorProduct.category || null,
                brand: vendor.name, // Set vendor name as brand
                status: 'active',
                images: vendorProduct.images ? JSON.stringify(vendorProduct.images) : null,
                isActive: true,
                lastSyncAt: new Date(),
              } as any);

              result.created++;
            }
          }

          result.totalProcessed++;
          this.broadcastSyncUpdate(syncJobId, 'running', result.totalProcessed, vendorProducts.length);

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          result.failed++;
          result.errors.push(`Failed to sync product ${vendorProduct.sku}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to sync with Shopify: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  private async pushVendorProductsToShopify(
    vendor: Vendor,
    vendorProducts: ParsedProduct[],
    syncJobId: number,
    options: SyncOptions
  ): Promise<SyncResult> {
    // This method is similar to syncWithShopifyBySKU but focuses only on push operations
    return this.syncWithShopifyBySKU(vendor, vendorProducts, syncJobId, { ...options, direction: 'push' });
  }

  private async findExistingProductBySKU(sku: string, vendorId: number): Promise<Product | null> {
    const products = await storage.getVendorProducts(vendorId);
    return products.find(p => p.sku === sku) || null;
  }

  private convertVendorToShopifyProduct(vendorProduct: ParsedProduct, vendorName?: string): any {
    return {
      title: vendorProduct.name,
      body_html: vendorProduct.description || '',
      product_type: vendorProduct.category || '',
      vendor: vendorName || '', // Set vendor name
      tags: [],
      variants: [{
        sku: vendorProduct.sku,
        price: vendorProduct.price?.toString() || '0',
        compare_at_price: vendorProduct.compareAtPrice?.toString() || null,
        inventory_quantity: vendorProduct.inventory || 0,
        barcode: vendorProduct.barcode || null,
      }],
      images: vendorProduct.images?.map(url => ({ src: url })) || [],
    };
  }
}
import { type Store } from "@shared/schema";
import { ShopifyService } from "./shopify";

export interface SyncResult {
  success: boolean;
  productId?: number;
  created?: boolean;
  error?: string;
}

export interface BulkSyncResult {
  success: boolean;
  created: number;
  updated: number;
  failed: number;
  errors?: string[];
}

export interface SyncOptions {
  direction: 'shopify_to_local' | 'local_to_shopify' | 'bidirectional' | 'pull' | 'push';
  syncImages: boolean;
  syncInventory: boolean;
  syncPricing: boolean;
  syncTags: boolean;
  syncVariants: boolean;
  syncDescriptions: boolean;
  batchSize: number;
}

export interface ProductData {
  sku: string;
  name: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  inventory?: number;
  barcode?: string;
  tags?: string[];
  images?: string[];
}

export class ProductSyncService {
  private store: Store;
  private shopifyService: ShopifyService;

  constructor(store: Store) {
    this.store = store;
    this.shopifyService = new ShopifyService(store);
  }

  async syncSingleProduct(productData: ProductData | number, vendorId?: number | string): Promise<SyncResult> {
    try {
      // For now, simulate a successful sync
      // In a real implementation, this would make actual Shopify API calls
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Simulate 95% success rate
      if (Math.random() < 0.95) {
        return {
          success: true,
          productId: Math.floor(Math.random() * 1000000),
          created: true
        };
      } else {
        return {
          success: false,
          error: "Simulated sync error"
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async syncProducts(vendorId: number, options: SyncOptions): Promise<BulkSyncResult> {
    try {
      console.log(`Starting sync for vendor ${vendorId} with options:`, options);
      
      let created = 0;
      let updated = 0;
      let failed = 0;
      const errors: string[] = [];

      if (options.direction === 'shopify_to_local' || options.direction === 'bidirectional' || options.direction === 'pull') {
        console.log('Fetching products from Shopify...');
        
        // Import storage to access vendor and product data
        const { storage } = await import('../storage');
        const vendor = await storage.getVendor(vendorId);
        
        if (!vendor) {
          throw new Error(`Vendor ${vendorId} not found`);
        }

        console.log(`Syncing products for vendor: ${vendor.name}`);

        try {
          console.log('Fetching products using rate-limited ShopifyService...');
          
          // Fetch products from Shopify using the rate-limited service
          let allProducts: any[] = [];
          let pageCount = 0;
          const maxPages = 10; // Limit to prevent infinite loops
          let pageInfo: string | undefined = undefined;

          do {
            pageCount++;
            console.log(`Fetching page ${pageCount} from Shopify using rate-limited API...`);
            
            const result = await this.shopifyService.getProducts(options.batchSize, pageInfo);
            console.log(`Retrieved ${result.products?.length || 0} products from page ${pageCount}`);
            
            if (result.products?.length > 0) {
              console.log(`Sample product titles:`, result.products.slice(0, 3).map((p: any) => p.title));
              
              // Filter products for this vendor using flexible matching
              const vendorProducts = result.products.filter((product: any) => {
                const titleMatch = product.title?.toLowerCase().includes(vendor.name.toLowerCase());
                const vendorMatch = product.vendor?.toLowerCase().includes(vendor.name.toLowerCase());
                const tagMatch = product.tags?.toLowerCase().includes(vendor.name.toLowerCase());
                
                return titleMatch || vendorMatch || tagMatch;
              });

              console.log(`Found ${vendorProducts.length} products matching vendor ${vendor.name}`);
              allProducts.push(...vendorProducts);
            }

            // Update pageInfo for next iteration - now properly parsed from Link headers
            pageInfo = result.pageInfo;
            
            // If no pageInfo is returned, we've fetched all available products
            if (!pageInfo) {
              console.log('No more pages available - reached end of product catalog');
              break;
            }

          } while (pageInfo && pageCount < maxPages);

          console.log(`Total products found for vendor ${vendor.name}: ${allProducts.length}`);

          // Collect all inventory item IDs for batch cost retrieval
          const inventoryItemIds: string[] = [];
          const inventoryItemMap: Map<string, { sku: string; productIndex: number }> = new Map();
          
          allProducts.forEach((product, index) => {
            const primaryVariant = product.variants?.[0];
            if (primaryVariant?.inventory_item_id) {
              const inventoryItemId = primaryVariant.inventory_item_id.toString();
              inventoryItemIds.push(inventoryItemId);
              inventoryItemMap.set(inventoryItemId, {
                sku: primaryVariant.sku || `shopify-${product.id}`,
                productIndex: index
              });
            }
          });

          // Batch fetch inventory items for cost prices using rate-limited API
          const inventoryCosts: Map<string, string> = new Map();
          if (inventoryItemIds.length > 0) {
            console.log(`Fetching cost data for ${inventoryItemIds.length} inventory items using rate-limited API...`);
            
            // Process in batches of 250 (Shopify API limit)
            const batchSize = 250;
            for (let i = 0; i < inventoryItemIds.length; i += batchSize) {
              const batchIds = inventoryItemIds.slice(i, i + batchSize);
              
              try {
                console.log(`Fetching inventory batch ${i}-${i+batchSize} using ShopifyService...`);
                const inventoryItems = await this.shopifyService.getInventoryItems(batchIds);
                
                if (inventoryItems && inventoryItems.length > 0) {
                  inventoryItems.forEach((item: any) => {
                    if (item.cost && parseFloat(item.cost) > 0) {
                      inventoryCosts.set(item.id.toString(), item.cost);
                      const itemInfo = inventoryItemMap.get(item.id.toString());
                      if (itemInfo) {
                        console.log(`Retrieved cost price for ${itemInfo.sku}: $${item.cost}`);
                      }
                    }
                  });
                } else {
                  console.warn(`No inventory items returned for batch ${i}-${i+batchSize}`);
                }
              } catch (batchError) {
                console.warn(`Error fetching inventory batch ${i}-${i+batchSize}:`, batchError);
              }
            }
          }

          // Process each product
          for (const shopifyProduct of allProducts) {
            try {
              // Extract primary variant data
              const primaryVariant = shopifyProduct.variants?.[0];
              const sku = primaryVariant?.sku || `shopify-${shopifyProduct.id}`;
              const upc = primaryVariant?.barcode || null; // UPC from variant barcode
              
              // Get cost price from the batch fetched data
              let costPrice: string | null = null;
              if (primaryVariant?.inventory_item_id) {
                costPrice = inventoryCosts.get(primaryVariant.inventory_item_id.toString()) || null;
              }

              // Prepare variant data for storage
              const variantData = shopifyProduct.variants?.map((variant: any) => ({
                id: variant.id,
                title: variant.title,
                price: variant.price,
                sku: variant.sku,
                barcode: variant.barcode,
                inventory_quantity: variant.inventory_quantity,
                compare_at_price: variant.compare_at_price,
                position: variant.position,
                option1: variant.option1,
                option2: variant.option2,
                option3: variant.option3,
                weight: variant.weight,
                weight_unit: variant.weight_unit
              })) || [];

              // Check if product already exists locally
              const existingProduct = await storage.getProductBySku(sku);

              if (existingProduct) {
                // Update existing product with new fields
                await storage.updateProduct(existingProduct.id, {
                  name: shopifyProduct.title,
                  description: shopifyProduct.body_html || shopifyProduct.description,
                  price: primaryVariant?.price || '0',
                  compareAtPrice: primaryVariant?.compare_at_price || null,
                  upc: upc,
                  costPrice: costPrice,
                  inventory: primaryVariant?.inventory_quantity || 0,
                  variants: variantData, // Store all variant information
                  tags: shopifyProduct.tags ? shopifyProduct.tags.split(',').map((t: string) => t.trim()) : [],
                  images: shopifyProduct.images?.map((img: any) => img.src) || [],
                  shopifyProductId: shopifyProduct.id.toString(),
                  lastModifiedBy: 'shopify_sync',
                  needsSync: false
                });
                updated++;
                console.log(`Updated product: ${shopifyProduct.title} (UPC: ${upc}, Cost: ${costPrice})`);
              } else {
                // Create new product with all new fields
                await storage.createProduct({
                  vendorId: vendorId,
                  storeId: this.store.id,
                  sku: sku,
                  name: shopifyProduct.title,
                  description: shopifyProduct.body_html || shopifyProduct.description,
                  price: primaryVariant?.price || '0',
                  compareAtPrice: primaryVariant?.compare_at_price || null,
                  upc: upc,
                  costPrice: costPrice,
                  inventory: primaryVariant?.inventory_quantity || 0,
                  variants: variantData, // Store all variant information
                  tags: shopifyProduct.tags ? shopifyProduct.tags.split(',').map((t: string) => t.trim()) : [],
                  images: shopifyProduct.images?.map((img: any) => img.src) || [],
                  shopifyProductId: shopifyProduct.id.toString(),
                  status: shopifyProduct.status === 'active' ? 'active' : 'draft',
                  lastModifiedBy: 'shopify_sync',
                  needsSync: false
                });
                created++;
                console.log(`Created product: ${shopifyProduct.title} (UPC: ${upc}, Cost: ${costPrice})`);
              }
            } catch (productError) {
              console.error(`Error processing product ${shopifyProduct.title}:`, productError);
              failed++;
              errors.push(`Failed to process ${shopifyProduct.title}: ${productError instanceof Error ? productError.message : 'Unknown error'}`);
            }
          }

        } catch (shopifyError) {
          console.error('Shopify API error:', shopifyError);
          errors.push(`Shopify sync failed: ${shopifyError instanceof Error ? shopifyError.message : 'Unknown error'}`);
          failed = 1; // Mark as failed
        }
      }

      console.log(`Sync completed: ${created} created, ${updated} updated, ${failed} failed`);
      
      return {
        success: errors.length === 0 || (created + updated) > 0,
        created,
        updated,
        failed,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      console.error('Sync process error:', error);
      return {
        success: false,
        created: 0,
        updated: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  async updateProductInventory(productId: number, inventory: number): Promise<SyncResult> {
    try {
      // Simulate inventory update to Shopify
      await new Promise(resolve => setTimeout(resolve, 200));
      
      if (Math.random() < 0.9) {
        return {
          success: true,
          productId
        };
      } else {
        return {
          success: false,
          error: "Failed to update inventory in Shopify"
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async updateProductPricing(productId: number, price: number, compareAtPrice?: number): Promise<SyncResult> {
    try {
      // Simulate pricing update to Shopify
      await new Promise(resolve => setTimeout(resolve, 200));
      
      if (Math.random() < 0.9) {
        return {
          success: true,
          productId
        };
      } else {
        return {
          success: false,
          error: "Failed to update pricing in Shopify"
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async updateProductImages(productId: number, images: string[]): Promise<SyncResult> {
    try {
      // Simulate image update to Shopify
      await new Promise(resolve => setTimeout(resolve, 300));
      
      if (Math.random() < 0.85) {
        return {
          success: true,
          productId
        };
      } else {
        return {
          success: false,
          error: "Failed to update images in Shopify"
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
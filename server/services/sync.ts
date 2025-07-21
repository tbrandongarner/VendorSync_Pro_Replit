import { type Store } from "@shared/schema";

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

  constructor(store: Store) {
    this.store = store;
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
          // Build Shopify API request
          const shopifyStoreUrl = this.store.shopifyStoreUrl;
          const accessToken = this.store.shopifyAccessToken;
          
          console.log(`Store credentials check:`, {
            hasStoreUrl: !!shopifyStoreUrl,
            storeUrl: shopifyStoreUrl,
            hasAccessToken: !!accessToken,
            accessTokenLength: accessToken?.length
          });

          if (!shopifyStoreUrl || !accessToken) {
            const error = `Shopify store credentials are missing: storeUrl=${!!shopifyStoreUrl}, accessToken=${!!accessToken}`;
            console.error(error);
            throw new Error(error);
          }

          // Extract domain from URL (e.g., "https://mystore.myshopify.com" -> "mystore.myshopify.com")
          const shopifyDomain = shopifyStoreUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
          console.log(`Fetching from Shopify store: ${shopifyDomain}`);
          
          // Fetch products from Shopify with vendor filtering
          let allProducts: any[] = [];
          let nextPageInfo: string | null = null;
          let pageCount = 0;
          const maxPages = 10; // Limit to prevent infinite loops

          do {
            pageCount++;
            console.log(`Fetching page ${pageCount} from Shopify...`);
            
            let url = `https://${shopifyDomain}/admin/api/2023-10/products.json?limit=${options.batchSize}`;
            if (nextPageInfo) {
              url += `&page_info=${nextPageInfo}`;
            }

            console.log(`Making API request to: ${url}`);
            
            const response = await fetch(url, {
              headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
              }
            });

            console.log(`API response status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
              const errorText = await response.text();
              console.error(`Shopify API error details:`, errorText);
              throw new Error(`Shopify API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            console.log(`Retrieved ${data.products?.length || 0} products from page ${pageCount}`);
            
            if (data.products?.length > 0) {
              console.log(`Sample product titles:`, data.products.slice(0, 3).map((p: any) => p.title));
            }
            
            if (data.products && data.products.length > 0) {
              // Filter products for this vendor using flexible matching
              const vendorProducts = data.products.filter((product: any) => {
                const titleMatch = product.title?.toLowerCase().includes(vendor.name.toLowerCase());
                const vendorMatch = product.vendor?.toLowerCase().includes(vendor.name.toLowerCase());
                const tagMatch = product.tags?.toLowerCase().includes(vendor.name.toLowerCase());
                
                return titleMatch || vendorMatch || tagMatch;
              });

              console.log(`Found ${vendorProducts.length} products matching vendor ${vendor.name}`);
              allProducts.push(...vendorProducts);
            }

            // Check for pagination
            const linkHeader = response.headers.get('Link');
            nextPageInfo = null;
            if (linkHeader) {
              const nextMatch = linkHeader.match(/<[^>]*[&?]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
              if (nextMatch) {
                nextPageInfo = nextMatch[1];
              }
            }

          } while (nextPageInfo && pageCount < maxPages);

          console.log(`Total products found for vendor ${vendor.name}: ${allProducts.length}`);

          // Process each product
          for (const shopifyProduct of allProducts) {
            try {
              // Check if product already exists locally
              const existingProduct = shopifyProduct.variants?.[0]?.sku ? 
                await storage.getProductBySku(shopifyProduct.variants[0].sku) : null;

              if (existingProduct) {
                // Update existing product
                await storage.updateProduct(existingProduct.id, {
                  name: shopifyProduct.title,
                  description: shopifyProduct.body_html || shopifyProduct.description,
                  price: shopifyProduct.variants?.[0]?.price || '0',
                  compareAtPrice: shopifyProduct.variants?.[0]?.compare_at_price || null,
                  inventory: shopifyProduct.variants?.[0]?.inventory_quantity || 0,
                  tags: shopifyProduct.tags ? shopifyProduct.tags.split(',').map((t: string) => t.trim()) : [],
                  images: shopifyProduct.images?.map((img: any) => img.src) || [],
                  shopifyProductId: shopifyProduct.id.toString(),
                  lastModifiedBy: 'shopify_sync',
                  needsSync: false
                });
                updated++;
                console.log(`Updated product: ${shopifyProduct.title}`);
              } else {
                // Create new product
                await storage.createProduct({
                  vendorId: vendorId,
                  storeId: this.store.id,
                  sku: shopifyProduct.variants?.[0]?.sku || `shopify-${shopifyProduct.id}`,
                  name: shopifyProduct.title,
                  description: shopifyProduct.body_html || shopifyProduct.description,
                  price: shopifyProduct.variants?.[0]?.price || '0',
                  compareAtPrice: shopifyProduct.variants?.[0]?.compare_at_price || null,
                  inventory: shopifyProduct.variants?.[0]?.inventory_quantity || 0,
                  tags: shopifyProduct.tags ? shopifyProduct.tags.split(',').map((t: string) => t.trim()) : [],
                  images: shopifyProduct.images?.map((img: any) => img.src) || [],
                  shopifyProductId: shopifyProduct.id.toString(),
                  status: shopifyProduct.status === 'active' ? 'active' : 'draft',
                  lastModifiedBy: 'shopify_sync',
                  needsSync: false
                });
                created++;
                console.log(`Created product: ${shopifyProduct.title}`);
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
import { type Store } from "@shared/schema";
import { ShopifyService } from "./shopify";
import { IStorage } from "../storage";
import { SyncRunManager, ProductSyncEventData } from "./syncRunManager";
import { ConflictDetectionService, ConflictDetectionOptions } from "./conflictDetection";
import { ConflictResolutionService, ResolutionOptions } from "./conflictResolution";
import { computeProductSignatures, ShopifyProduct } from "./productHashing";
import { SyncErrorHandler, SyncError, RetryConfig, CircuitBreakerConfig, RetryExhaustedError } from "./syncErrorHandler";

/**
 * Enhanced Product Sync Service with Idempotent Operations and Event Tracking
 * Provides enterprise-grade sync capabilities with conflict detection and resolution
 */

export interface IdempotentSyncOptions {
  direction: 'shopify_to_local' | 'local_to_shopify' | 'bidirectional';
  batchSize: number;
  
  // Sync configuration
  syncImages: boolean;
  syncInventory: boolean;
  syncPricing: boolean;
  syncTags: boolean;
  syncVariants: boolean;
  syncDescriptions: boolean;
  
  // Conflict detection options
  conflictDetection: ConflictDetectionOptions;
  
  // Resolution options
  resolution: ResolutionOptions;
  
  // Performance options
  maxPages?: number;
  parallel?: boolean;
  dryRun?: boolean;
}

export interface IdempotentSyncResult {
  success: boolean;
  syncRunId: string;
  stats: {
    productsFound: number;
    productsProcessed: number;
    productsCreated: number;
    productsUpdated: number;
    productsFailed: number;
    productsSkipped: number;
    conflictsDetected: number;
    conflictsResolved: number;
    conflictsManualReview: number;
  };
  performance: {
    durationMs: number;
    apiCallsUsed: number;
    rateLimitHits: number;
    avgResponseTimeMs: number;
  };
  errors: string[];
  warnings: string[];
}

export class IdempotentProductSyncService {
  private store: Store;
  private storage: IStorage;
  private shopifyService: ShopifyService;
  private syncRunManager: SyncRunManager;
  private conflictDetection: ConflictDetectionService;
  private conflictResolution: ConflictResolutionService;
  private errorHandler: SyncErrorHandler;

  constructor(
    store: Store, 
    storage: IStorage,
    retryConfig?: Partial<RetryConfig>,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ) {
    this.store = store;
    this.storage = storage;
    this.shopifyService = new ShopifyService(store);
    this.syncRunManager = new SyncRunManager(storage);
    this.conflictDetection = new ConflictDetectionService(storage);
    this.errorHandler = new SyncErrorHandler(storage, retryConfig, circuitBreakerConfig);
    this.conflictResolution = new ConflictResolutionService(storage, this.syncRunManager);
  }

  /**
   * Performs idempotent sync with comprehensive conflict detection and resolution
   */
  async syncProducts(
    vendorId: number, 
    syncJobId: number,
    options: IdempotentSyncOptions
  ): Promise<IdempotentSyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Get vendor information
    const vendor = await this.storage.getVendor(vendorId);
    if (!vendor) {
      throw new Error(`Vendor ${vendorId} not found`);
    }

    // Start sync run with comprehensive tracking
    const syncRun = await this.syncRunManager.startSyncRun({
      syncJobId,
      vendorId,
      storeId: this.store.id,
      syncType: options.direction === 'bidirectional' ? 'bidirectional' : 'pull',
      direction: options.direction,
      batchSize: options.batchSize
    });

    console.log(`Started idempotent sync run ${syncRun.runId} for vendor ${vendor.name}`);

    try {
      let syncResult: IdempotentSyncResult;

      switch (options.direction) {
        case 'shopify_to_local':
          syncResult = await this.performShopifyToLocalSync(syncRun.runId, vendor, options);
          break;
        case 'local_to_shopify':
          syncResult = await this.performLocalToShopifySync(syncRun.runId, vendor, options);
          break;
        case 'bidirectional':
          syncResult = await this.performBidirectionalSync(syncRun.runId, vendor, options);
          break;
        default:
          throw new Error(`Unsupported sync direction: ${options.direction}`);
      }

      // Complete sync run with final metrics
      await this.syncRunManager.completeSyncRun(
        syncRun.runId,
        syncResult.success ? 'completed' : 'failed',
        syncResult.errors.length > 0 ? syncResult.errors.join('; ') : undefined,
        {
          summary: syncResult.stats,
          performance: syncResult.performance,
          warnings: syncResult.warnings
        }
      );

      const durationMs = Date.now() - startTime;
      console.log(`Completed sync run ${syncRun.runId} in ${durationMs}ms`);

      return {
        ...syncResult,
        syncRunId: syncRun.runId,
        performance: {
          ...syncResult.performance,
          durationMs
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
      console.error(`Sync run ${syncRun.runId} failed:`, errorMessage);

      await this.syncRunManager.completeSyncRun(
        syncRun.runId,
        'failed',
        errorMessage
      );

      return {
        success: false,
        syncRunId: syncRun.runId,
        stats: {
          productsFound: 0,
          productsProcessed: 0,
          productsCreated: 0,
          productsUpdated: 0,
          productsFailed: 1,
          productsSkipped: 0,
          conflictsDetected: 0,
          conflictsResolved: 0,
          conflictsManualReview: 0
        },
        performance: {
          durationMs: Date.now() - startTime,
          apiCallsUsed: 0,
          rateLimitHits: 0,
          avgResponseTimeMs: 0
        },
        errors: [errorMessage],
        warnings: []
      };
    }
  }

  /**
   * Performs Shopify to local sync with idempotent operations
   */
  private async performShopifyToLocalSync(
    syncRunId: string,
    vendor: any,
    options: IdempotentSyncOptions
  ): Promise<IdempotentSyncResult> {
    const stats = {
      productsFound: 0,
      productsProcessed: 0,
      productsCreated: 0,
      productsUpdated: 0,
      productsFailed: 0,
      productsSkipped: 0,
      conflictsDetected: 0,
      conflictsResolved: 0,
      conflictsManualReview: 0
    };

    const errors: string[] = [];
    const warnings: string[] = [];
    let apiCallsUsed = 0;
    let rateLimitHits = 0;
    let totalResponseTime = 0;

    console.log(`Fetching products from Shopify for vendor ${vendor.name}...`);

    try {
      // Fetch all products from Shopify with pagination (with retry logic)
      const allProducts = await this.errorHandler.executeWithRetry(
        () => this.fetchAllShopifyProducts(vendor, options, syncRunId),
        `fetch-shopify-products-${vendor.id}`,
        { vendorId: vendor.id, vendorName: vendor.name }
      );
      stats.productsFound = allProducts.length;

      // Update sync run with products found (with retry for database operations)
      await this.errorHandler.executeWithRetry(
        () => this.syncRunManager.setProductsFound(syncRunId, stats.productsFound),
        `update-sync-run-${syncRunId}`,
        { syncRunId, productsFound: stats.productsFound }
      );

      console.log(`Processing ${stats.productsFound} products with idempotent operations...`);

      // Process each product with conflict detection and resolution
      for (const shopifyProduct of allProducts) {
        const productStartTime = Date.now();
        
        try {
          const result = await this.errorHandler.executeWithRetry(
            () => this.processShopifyProduct(shopifyProduct, vendor, options, syncRunId),
            `process-product-${this.extractSku(shopifyProduct)}`,
            { 
              productId: shopifyProduct.id,
              productTitle: shopifyProduct.title,
              vendorId: vendor.id 
            }
          );

          // Update statistics
          stats.productsProcessed++;
          if (result.action === 'created') {
            stats.productsCreated++;
          } else if (result.action === 'updated') {
            stats.productsUpdated++;
          } else if (result.action === 'skipped') {
            stats.productsSkipped++;
          } else if (result.action === 'failed') {
            stats.productsFailed++;
          }

          if (result.conflictDetected) {
            stats.conflictsDetected++;
            if (result.conflictResolved) {
              stats.conflictsResolved++;
            } else {
              stats.conflictsManualReview++;
            }
          }

          // Track API performance
          const processingTime = Date.now() - productStartTime;
          apiCallsUsed += result.apiCallsUsed || 0;
          rateLimitHits += result.rateLimitHits || 0;
          totalResponseTime += processingTime;

          // Record API call metrics (with retry for database operations)
          if (result.apiCallsUsed || 0 > 0) {
            await this.errorHandler.executeWithRetry(
              () => this.syncRunManager.recordApiCall(
                syncRunId,
                processingTime,
                (result.rateLimitHits || 0) > 0
              ),
              `record-api-call-${syncRunId}`,
              { syncRunId, processingTime, rateLimitHit: (result.rateLimitHits || 0) > 0 }
            );
          }

        } catch (productError) {
          // Handle RetryExhaustedError to preserve classification information
          let syncError: SyncError;
          if (productError instanceof RetryExhaustedError) {
            syncError = productError.syncError;
          } else {
            syncError = this.errorHandler.classifyError(productError);
          }
          
          const errorMessage = `Failed to process product ${shopifyProduct.title}: ${syncError.message}`;
          
          console.error(`[${syncError.type.toUpperCase()}] ${errorMessage}`, {
            severity: syncError.severity,
            retryable: syncError.retryable,
            productId: shopifyProduct.id,
            attempts: productError instanceof RetryExhaustedError ? productError.attempts : 1
          });
          
          errors.push(errorMessage);
          stats.productsFailed++;

          // Record failed product sync event (with retry for database operations)
          try {
            await this.errorHandler.executeWithRetry(
              () => this.syncRunManager.recordProductSyncEvent(syncRunId, {
                sku: this.extractSku(shopifyProduct),
                eventType: 'error',
                operation: 'fetch',
                errorMessage: `${syncError.type}: ${syncError.message}`,
                processingTimeMs: Date.now() - productStartTime,
                success: false
              }),
              `record-error-event-${syncRunId}`,
              { syncRunId, productId: shopifyProduct.id, errorType: syncError.type }
            );
          } catch (eventError) {
            console.error(`Failed to record sync event for product ${shopifyProduct.id}:`, eventError);
            // Don't throw here - we want to continue processing other products
          }
        }
      }

    } catch (fetchError) {
      const errorMessage = `Failed to fetch products from Shopify: ${
        fetchError instanceof Error ? fetchError.message : 'Unknown error'
      }`;
      console.error(errorMessage);
      errors.push(errorMessage);
    }

    const avgResponseTime = apiCallsUsed > 0 ? totalResponseTime / apiCallsUsed : 0;

    return {
      success: errors.length === 0 || stats.productsProcessed > 0,
      syncRunId,
      stats,
      performance: {
        durationMs: 0, // Will be set by caller
        apiCallsUsed,
        rateLimitHits,
        avgResponseTimeMs: Math.round(avgResponseTime)
      },
      errors,
      warnings
    };
  }

  /**
   * Processes a single Shopify product with idempotent operations
   */
  private async processShopifyProduct(
    shopifyProduct: ShopifyProduct,
    vendor: any,
    options: IdempotentSyncOptions,
    syncRunId: string
  ): Promise<{
    action: 'created' | 'updated' | 'skipped' | 'failed';
    conflictDetected: boolean;
    conflictResolved: boolean;
    apiCallsUsed: number;
    rateLimitHits: number;
  }> {
    const sku = this.extractSku(shopifyProduct);
    
    try {
      // Skip processing if dry run
      if (options.dryRun) {
        await this.errorHandler.executeWithRetry(
          () => this.syncRunManager.recordProductSyncEvent(syncRunId, {
            sku,
            eventType: 'skip',
            operation: 'save',
            skippedReason: 'Dry run mode enabled'
          }),
          `record-dryrun-event-${syncRunId}-${sku}`,
          { syncRunId, sku, dryRun: true }
        );
        
        return {
          action: 'skipped',
          conflictDetected: false,
          conflictResolved: false,
          apiCallsUsed: 0,
          rateLimitHits: 0
        };
      }

      // Detect conflicts using our conflict detection service (with retry logic)
      const conflictResult = await this.errorHandler.executeWithRetry(
        () => this.conflictDetection.detectConflict(sku, shopifyProduct, options.conflictDetection),
        `detect-conflict-${sku}`,
        { sku, productId: shopifyProduct.id, vendorId: vendor.id }
      );

      let action: 'created' | 'updated' | 'skipped' | 'failed' = 'failed';
      let conflictResolved = true;

      // Record conflict detection event (with retry logic)
      await this.errorHandler.executeWithRetry(
        () => this.syncRunManager.recordProductSyncEvent(syncRunId, {
          sku,
          eventType: conflictResult.hasConflict ? 'conflict' : 'update',
          operation: 'compare',
          beforeData: conflictResult.localProduct,
          afterData: shopifyProduct,
          changedFields: conflictResult.metadata.changedComponents,
          conflictReason: conflictResult.conflictReasons.join('; ') || undefined
        }),
        `record-conflict-event-${syncRunId}-${sku}`,
        { syncRunId, sku, hasConflict: conflictResult.hasConflict }
      );

      if (conflictResult.hasConflict) {
        // Resolve conflict using our resolution service (with retry logic)
        const resolutionResult = await this.errorHandler.executeWithRetry(
          () => this.conflictResolution.resolveConflict(conflictResult, options.resolution, syncRunId),
          `resolve-conflict-${sku}`,
          { sku, syncRunId, resolutionStrategy: options.resolution.strategy }
        );

        if (resolutionResult.resolved) {
          // Apply resolution (with retry logic)
          const applyResult = await this.errorHandler.executeWithRetry(
            () => this.conflictResolution.applyResolution(resolutionResult, sku, syncRunId),
            `apply-resolution-${sku}`,
            { sku, syncRunId, resolutionId: resolutionResult.id }
          );

          if (applyResult.success) {
            action = conflictResult.localProduct ? 'updated' : 'created';
          } else {
            action = 'failed';
            conflictResolved = false;
          }
        } else {
          // Manual review or skip
          action = 'skipped';
          conflictResolved = false;
        }
      } else {
        // No conflict - proceed with sync
        if (!conflictResult.localProduct) {
          // Create new product (with retry logic)
          const productData = await this.buildProductDataFromShopify(
            shopifyProduct,
            vendor,
            options
          );
          
          await this.errorHandler.executeWithRetry(
            () => this.storage.createProduct(productData),
            `create-product-${sku}`,
            { sku, vendorId: vendor.id, productTitle: shopifyProduct.title }
          );
          action = 'created';
        } else {
          // Update existing product with signature tracking (with retry logic)
          const signatures = computeProductSignatures(shopifyProduct);
          const updates = await this.buildProductUpdatesFromShopify(
            shopifyProduct,
            options,
            signatures
          );
          
          await this.errorHandler.executeWithRetry(
            () => this.storage.updateProduct(conflictResult.localProduct.id, updates),
            `update-product-${sku}`,
            { sku, productId: conflictResult.localProduct.id, vendorId: vendor.id }
          );
          action = 'updated';
        }

        // Record successful sync event (with retry logic)
        await this.errorHandler.executeWithRetry(
          () => this.syncRunManager.recordProductSyncEvent(syncRunId, {
            sku,
            eventType: action === 'created' ? 'create' : 'update',
            operation: 'save',
            afterData: shopifyProduct,
            success: true
          }),
          `record-success-event-${syncRunId}-${sku}`,
          { syncRunId, sku, action }
        );
      }

      return {
        action,
        conflictDetected: conflictResult.hasConflict,
        conflictResolved,
        apiCallsUsed: 1, // Approximate API calls for this product
        rateLimitHits: 0
      };

    } catch (error) {
      // Record failed sync event
      await this.syncRunManager.recordProductSyncEvent(syncRunId, {
        sku,
        eventType: 'error',
        operation: 'save',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        success: false
      });

      return {
        action: 'failed',
        conflictDetected: false,
        conflictResolved: false,
        apiCallsUsed: 0,
        rateLimitHits: 0
      };
    }
  }

  /**
   * Fetches all products from Shopify with pagination
   */
  private async fetchAllShopifyProducts(
    vendor: any,
    options: IdempotentSyncOptions,
    syncRunId: string
  ): Promise<ShopifyProduct[]> {
    const allProducts: ShopifyProduct[] = [];
    let pageCount = 0;
    const maxPages = options.maxPages || 20;
    let pageInfo: string | undefined = undefined;

    do {
      pageCount++;
      console.log(`Fetching page ${pageCount} from Shopify using rate-limited API...`);
      
      const result = await this.shopifyService.getProducts(options.batchSize, pageInfo);
      console.log(`Retrieved ${result.products?.length || 0} products from page ${pageCount}`);
      
      if (result.products?.length > 0) {
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

      // Update pageInfo for next iteration
      pageInfo = result.pageInfo;
      
      if (!pageInfo) {
        console.log('No more pages available - reached end of product catalog');
        break;
      }

    } while (pageInfo && pageCount < maxPages);

    return allProducts;
  }

  /**
   * Builds product data from Shopify product for creation
   */
  private async buildProductDataFromShopify(
    shopifyProduct: ShopifyProduct,
    vendor: any,
    options: IdempotentSyncOptions
  ): Promise<any> {
    const primaryVariant = shopifyProduct.variants?.[0];
    const sku = this.extractSku(shopifyProduct);
    const signatures = computeProductSignatures(shopifyProduct);

    return {
      vendorId: vendor.id,
      storeId: this.store.id,
      sku,
      name: shopifyProduct.title || '',
      description: shopifyProduct.body_html,
      price: primaryVariant?.price || '0',
      compareAtPrice: primaryVariant?.compare_at_price || null,
      inventory: primaryVariant?.inventory_quantity || 0,
      barcode: primaryVariant?.barcode || null,
      tags: shopifyProduct.tags ? 
        shopifyProduct.tags.split(',').map(tag => tag.trim()) : [],
      images: shopifyProduct.images?.map(img => img.src) || [],
      primaryImage: shopifyProduct.images?.[0]?.src || null,
      variants: shopifyProduct.variants || [],
      shopifyProductId: shopifyProduct.id?.toString(),
      status: this.mapShopifyStatus(shopifyProduct.status || 'active'),
      lastModifiedBy: 'shopify_sync',
      needsSync: false,
      contentHash: signatures.contentHash,
      variantsHash: signatures.variantsHash,
      imagesHash: signatures.imagesHash,
      lastHashedAt: new Date(),
      syncVersion: 1
    };
  }

  /**
   * Builds product updates from Shopify product
   */
  private async buildProductUpdatesFromShopify(
    shopifyProduct: ShopifyProduct,
    options: IdempotentSyncOptions,
    signatures: { contentHash: string; variantsHash: string; imagesHash: string }
  ): Promise<any> {
    const primaryVariant = shopifyProduct.variants?.[0];

    return {
      name: shopifyProduct.title || '',
      description: shopifyProduct.body_html,
      price: primaryVariant?.price || '0',
      compareAtPrice: primaryVariant?.compare_at_price || null,
      inventory: primaryVariant?.inventory_quantity || 0,
      barcode: primaryVariant?.barcode || null,
      tags: shopifyProduct.tags ? 
        shopifyProduct.tags.split(',').map(tag => tag.trim()) : [],
      images: shopifyProduct.images?.map(img => img.src) || [],
      primaryImage: shopifyProduct.images?.[0]?.src || null,
      variants: shopifyProduct.variants || [],
      status: this.mapShopifyStatus(shopifyProduct.status || 'active'),
      lastModifiedBy: 'shopify_sync',
      needsSync: false,
      contentHash: signatures.contentHash,
      variantsHash: signatures.variantsHash,
      imagesHash: signatures.imagesHash,
      lastHashedAt: new Date(),
      syncVersion: (shopifyProduct as any).syncVersion ? 
        ((shopifyProduct as any).syncVersion + 1) : 1
    };
  }

  /**
   * Stub for local to Shopify sync (future implementation)
   */
  private async performLocalToShopifySync(
    syncRunId: string,
    vendor: any,
    options: IdempotentSyncOptions
  ): Promise<IdempotentSyncResult> {
    // TODO: Implement local to Shopify sync with idempotent operations
    throw new Error('Local to Shopify sync not yet implemented');
  }

  /**
   * Stub for bidirectional sync (future implementation)
   */
  private async performBidirectionalSync(
    syncRunId: string,
    vendor: any,
    options: IdempotentSyncOptions
  ): Promise<IdempotentSyncResult> {
    // TODO: Implement bidirectional sync with conflict resolution
    throw new Error('Bidirectional sync not yet implemented');
  }

  /**
   * Extracts SKU from Shopify product
   */
  private extractSku(shopifyProduct: ShopifyProduct): string {
    const primaryVariant = shopifyProduct.variants?.[0];
    return primaryVariant?.sku || `shopify-${shopifyProduct.id}`;
  }

  /**
   * Maps Shopify status to local status
   */
  private mapShopifyStatus(shopifyStatus: string): string {
    switch (shopifyStatus.toLowerCase()) {
      case 'active':
        return 'active';
      case 'archived':
        return 'archived';
      case 'draft':
        return 'draft';
      default:
        return 'active';
    }
  }

  /**
   * Gets circuit breaker metrics for monitoring and alerting
   */
  getCircuitBreakerMetrics(): Record<string, any> {
    return this.errorHandler.getCircuitBreakerMetrics();
  }

  /**
   * Resets circuit breaker for specific operation (for manual intervention)
   */
  resetCircuitBreaker(operationKey: string): void {
    this.errorHandler.resetCircuitBreaker(operationKey);
  }

  /**
   * Gets current retry configuration
   */
  getRetryConfiguration(): RetryConfig {
    return this.errorHandler.getRetryConfig();
  }

  /**
   * Updates retry configuration for enhanced error handling
   */
  updateRetryConfiguration(config: Partial<RetryConfig>): void {
    this.errorHandler.updateRetryConfig(config);
  }

  /**
   * Provides error classification for external error analysis
   */
  classifyError(error: any): SyncError {
    return this.errorHandler.classifyError(error);
  }
}
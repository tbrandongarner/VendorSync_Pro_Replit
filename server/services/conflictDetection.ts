import { IStorage } from '../storage';
import { Product, SyncRun } from '@shared/schema';
import { ShopifyProduct, computeProductSignatures, hasProductChanged } from './productHashing';

/**
 * Conflict Detection Service for Idempotent Sync Operations
 * Detects conflicts between local and remote product data using signature hashing and version tracking
 */

export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflictType: ConflictType;
  conflictReasons: string[];
  localProduct?: Product;
  remoteProduct?: ShopifyProduct;
  resolutionStrategy: ConflictResolutionStrategy;
  metadata: {
    localLastModified?: Date;
    remoteLastModified?: Date;
    syncVersionDifference?: number;
    changedComponents: string[];
    lastSyncAt?: Date;
  };
}

export enum ConflictType {
  NONE = 'none',
  CONTENT_CHANGE = 'content_change',
  VARIANT_CHANGE = 'variant_change',
  IMAGE_CHANGE = 'image_change',
  VERSION_MISMATCH = 'version_mismatch',
  CONCURRENT_MODIFICATION = 'concurrent_modification',
  SHOPIFY_NEWER = 'shopify_newer',
  LOCAL_NEWER = 'local_newer',
  BOTH_MODIFIED = 'both_modified'
}

export enum ConflictResolutionStrategy {
  ACCEPT_LOCAL = 'accept_local',
  ACCEPT_REMOTE = 'accept_remote',
  VENDOR_PRIORITY = 'vendor_priority',
  TIMESTAMP_BASED = 'timestamp_based',
  MANUAL_REVIEW = 'manual_review',
  MERGE_STRATEGY = 'merge_strategy',
  SKIP_SYNC = 'skip_sync'
}

export interface ConflictDetectionOptions {
  direction: 'shopify_to_local' | 'local_to_shopify';
  vendorPriority?: 'local' | 'remote';
  timestampTolerance?: number; // ms tolerance for timestamp comparisons
  enableAutoMerge?: boolean;
  skipUnchanged?: boolean;
}

export class ConflictDetectionService {
  private storage: IStorage;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  /**
   * Detects conflicts between local and remote product data
   */
  async detectConflict(
    sku: string,
    remoteProduct: ShopifyProduct,
    options: ConflictDetectionOptions
  ): Promise<ConflictDetectionResult> {
    // Get local product data
    const localProduct = await this.storage.getProductBySku(sku);
    
    // If no local product exists, no conflict (new product)
    if (!localProduct) {
      return this.createNoConflictResult(remoteProduct, options);
    }

    // Compute current signatures for remote product
    const remoteSignatures = computeProductSignatures(remoteProduct);
    
    // Get stored signatures from local product
    const storedSignatures = {
      contentHash: localProduct.contentHash || undefined,
      variantsHash: localProduct.variantsHash || undefined,
      imagesHash: localProduct.imagesHash || undefined
    };

    // Check if product has changed based on signatures
    const changeDetection = hasProductChanged(remoteProduct, storedSignatures);
    
    // Determine timestamps for comparison
    const localLastModified = localProduct.updatedAt || localProduct.createdAt || new Date();
    const remoteLastModified = remoteProduct.updated_at ? new Date(remoteProduct.updated_at) : null;
    const lastSyncAt = localProduct.lastSyncAt;
    
    // Analyze conflict scenarios
    const conflictAnalysis = this.analyzeConflicts(
      localProduct,
      remoteProduct,
      changeDetection,
      localLastModified,
      remoteLastModified || undefined,
      lastSyncAt || undefined,
      options
    );

    return conflictAnalysis;
  }

  /**
   * Analyzes potential conflicts and determines resolution strategy
   */
  private analyzeConflicts(
    localProduct: Product,
    remoteProduct: ShopifyProduct,
    changeDetection: { hasChanged: boolean; changedComponents: string[] },
    localLastModified: Date,
    remoteLastModified: Date | undefined,
    lastSyncAt: Date | undefined,
    options: ConflictDetectionOptions
  ): ConflictDetectionResult {
    const conflictReasons: string[] = [];
    let conflictType = ConflictType.NONE;
    let resolutionStrategy = ConflictResolutionStrategy.ACCEPT_REMOTE;

    // Check if either side has been modified since last sync
    const localModifiedSinceSync = lastSyncAt ? localLastModified > lastSyncAt : true;
    const remoteModifiedSinceSync = lastSyncAt && remoteLastModified ? 
      remoteLastModified > lastSyncAt : true;

    // Version mismatch detection
    const versionDifference = localProduct.syncVersion || 1;
    if (versionDifference > 1 && changeDetection.hasChanged) {
      conflictType = ConflictType.VERSION_MISMATCH;
      conflictReasons.push(`Sync version mismatch: local version ${versionDifference}`);
    }

    // Content change detection
    if (changeDetection.changedComponents.length > 0) {
      if (changeDetection.changedComponents.includes('content')) {
        conflictType = ConflictType.CONTENT_CHANGE;
        conflictReasons.push('Product content has changed (title, description, etc.)');
      }
      if (changeDetection.changedComponents.includes('variants')) {
        conflictType = ConflictType.VARIANT_CHANGE;
        conflictReasons.push('Product variants have changed (pricing, inventory, etc.)');
      }
      if (changeDetection.changedComponents.includes('images')) {
        conflictType = ConflictType.IMAGE_CHANGE;
        conflictReasons.push('Product images have changed');
      }
    }

    // Concurrent modification detection
    if (localModifiedSinceSync && remoteModifiedSinceSync) {
      conflictType = ConflictType.CONCURRENT_MODIFICATION;
      conflictReasons.push('Both local and remote product modified since last sync');
      resolutionStrategy = this.determineResolutionStrategy(
        localLastModified,
        remoteLastModified,
        options
      );
    } else if (localModifiedSinceSync && !changeDetection.hasChanged) {
      // Local changes but no remote changes
      conflictType = ConflictType.LOCAL_NEWER;
      conflictReasons.push('Local product modified since last sync');
      resolutionStrategy = options.direction === 'local_to_shopify' ? 
        ConflictResolutionStrategy.ACCEPT_LOCAL : ConflictResolutionStrategy.SKIP_SYNC;
    } else if (remoteModifiedSinceSync && changeDetection.hasChanged) {
      // Remote changes detected
      conflictType = ConflictType.SHOPIFY_NEWER;
      conflictReasons.push('Remote product modified since last sync');
      resolutionStrategy = options.direction === 'shopify_to_local' ? 
        ConflictResolutionStrategy.ACCEPT_REMOTE : ConflictResolutionStrategy.TIMESTAMP_BASED;
    }

    // If both modified and vendor priority is set
    if (conflictType === ConflictType.CONCURRENT_MODIFICATION && options.vendorPriority) {
      resolutionStrategy = options.vendorPriority === 'local' ? 
        ConflictResolutionStrategy.VENDOR_PRIORITY : ConflictResolutionStrategy.VENDOR_PRIORITY;
      conflictReasons.push(`Using vendor priority: ${options.vendorPriority}`);
    }

    // Skip if no changes and option is enabled
    if (!changeDetection.hasChanged && options.skipUnchanged) {
      conflictType = ConflictType.NONE;
      resolutionStrategy = ConflictResolutionStrategy.SKIP_SYNC;
    }

    return {
      hasConflict: conflictType !== ConflictType.NONE,
      conflictType,
      conflictReasons,
      localProduct,
      remoteProduct,
      resolutionStrategy,
      metadata: {
        localLastModified,
        remoteLastModified: remoteLastModified || undefined,
        syncVersionDifference: versionDifference,
        changedComponents: changeDetection.changedComponents,
        lastSyncAt: lastSyncAt || undefined
      }
    };
  }

  /**
   * Determines resolution strategy based on timestamps and options
   */
  private determineResolutionStrategy(
    localLastModified: Date,
    remoteLastModified: Date | undefined,
    options: ConflictDetectionOptions
  ): ConflictResolutionStrategy {
    if (!remoteLastModified) {
      return ConflictResolutionStrategy.ACCEPT_LOCAL;
    }

    const timeDiff = localLastModified.getTime() - remoteLastModified.getTime();
    const tolerance = options.timestampTolerance || 5000; // 5 second default tolerance

    // If timestamps are very close, use vendor priority
    if (Math.abs(timeDiff) < tolerance) {
      return options.vendorPriority === 'local' ? 
        ConflictResolutionStrategy.VENDOR_PRIORITY : ConflictResolutionStrategy.VENDOR_PRIORITY;
    }

    // Use timestamp-based resolution
    if (timeDiff > 0) {
      return ConflictResolutionStrategy.TIMESTAMP_BASED; // Local is newer
    } else {
      return ConflictResolutionStrategy.TIMESTAMP_BASED; // Remote is newer
    }
  }

  /**
   * Creates a no-conflict result for new products
   */
  private createNoConflictResult(
    remoteProduct: ShopifyProduct,
    options: ConflictDetectionOptions
  ): ConflictDetectionResult {
    return {
      hasConflict: false,
      conflictType: ConflictType.NONE,
      conflictReasons: ['New product - no local version exists'],
      remoteProduct,
      resolutionStrategy: ConflictResolutionStrategy.ACCEPT_REMOTE,
      metadata: {
        remoteLastModified: remoteProduct.updated_at ? new Date(remoteProduct.updated_at) : undefined,
        changedComponents: []
      }
    };
  }

  /**
   * Batch conflict detection for multiple products
   */
  async detectBatchConflicts(
    products: Array<{ sku: string; remoteProduct: ShopifyProduct }>,
    options: ConflictDetectionOptions
  ): Promise<ConflictDetectionResult[]> {
    const results: ConflictDetectionResult[] = [];
    
    for (const { sku, remoteProduct } of products) {
      const result = await this.detectConflict(sku, remoteProduct, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Gets conflict statistics for a sync run
   */
  getConflictStatistics(results: ConflictDetectionResult[]): {
    totalProducts: number;
    conflictsFound: number;
    conflictTypes: Record<ConflictType, number>;
    resolutionStrategies: Record<ConflictResolutionStrategy, number>;
  } {
    const stats = {
      totalProducts: results.length,
      conflictsFound: results.filter(r => r.hasConflict).length,
      conflictTypes: {} as Record<ConflictType, number>,
      resolutionStrategies: {} as Record<ConflictResolutionStrategy, number>
    };

    // Initialize counters
    Object.values(ConflictType).forEach(type => {
      stats.conflictTypes[type] = 0;
    });
    Object.values(ConflictResolutionStrategy).forEach(strategy => {
      stats.resolutionStrategies[strategy] = 0;
    });

    // Count occurrences
    results.forEach(result => {
      stats.conflictTypes[result.conflictType]++;
      stats.resolutionStrategies[result.resolutionStrategy]++;
    });

    return stats;
  }

  /**
   * Resolves conflicts according to the determined strategy
   */
  async resolveConflict(
    result: ConflictDetectionResult,
    syncRunId: string
  ): Promise<{
    resolved: boolean;
    action: 'accept_local' | 'accept_remote' | 'skip' | 'manual_review';
    updatedProduct?: Partial<Product>;
    reason: string;
  }> {
    switch (result.resolutionStrategy) {
      case ConflictResolutionStrategy.ACCEPT_LOCAL:
        return {
          resolved: true,
          action: 'accept_local',
          reason: 'Accepting local changes based on conflict resolution strategy'
        };

      case ConflictResolutionStrategy.ACCEPT_REMOTE:
        if (!result.remoteProduct) {
          throw new Error('Remote product data required for ACCEPT_REMOTE strategy');
        }
        
        const remoteSignatures = computeProductSignatures(result.remoteProduct);
        
        return {
          resolved: true,
          action: 'accept_remote',
          updatedProduct: {
            name: result.remoteProduct.title,
            description: result.remoteProduct.body_html,
            contentHash: remoteSignatures.contentHash,
            variantsHash: remoteSignatures.variantsHash,
            imagesHash: remoteSignatures.imagesHash,
            lastHashedAt: new Date(),
            syncVersion: (result.localProduct?.syncVersion || 0) + 1,
            lastSyncAt: new Date(),
            shopifyUpdatedAt: result.remoteProduct.updated_at ? 
              new Date(result.remoteProduct.updated_at) : null
          },
          reason: 'Accepting remote changes based on conflict resolution strategy'
        };

      case ConflictResolutionStrategy.SKIP_SYNC:
        return {
          resolved: true,
          action: 'skip',
          reason: 'Skipping sync based on conflict resolution strategy'
        };

      case ConflictResolutionStrategy.TIMESTAMP_BASED:
        const isLocalNewer = result.metadata.localLastModified && 
          result.metadata.remoteLastModified &&
          result.metadata.localLastModified > result.metadata.remoteLastModified;
          
        return this.resolveConflict({
          ...result,
          resolutionStrategy: isLocalNewer ? 
            ConflictResolutionStrategy.ACCEPT_LOCAL : 
            ConflictResolutionStrategy.ACCEPT_REMOTE
        }, syncRunId);

      case ConflictResolutionStrategy.VENDOR_PRIORITY:
      case ConflictResolutionStrategy.MANUAL_REVIEW:
      default:
        return {
          resolved: false,
          action: 'manual_review',
          reason: 'Conflict requires manual review or vendor priority resolution'
        };
    }
  }
}
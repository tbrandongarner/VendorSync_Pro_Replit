import { IStorage } from '../storage';
import { Product, InsertProduct } from '@shared/schema';
import { ShopifyProduct, computeProductSignatures } from './productHashing';
import { 
  ConflictDetectionResult, 
  ConflictResolutionStrategy, 
  ConflictType 
} from './conflictDetection';
import { SyncRunManager, ProductSyncEventData } from './syncRunManager';

/**
 * Conflict Resolution Service
 * Executes conflict resolution strategies and applies product updates
 */

export interface ResolutionResult {
  resolved: boolean;
  action: 'accepted_local' | 'accepted_remote' | 'merged' | 'skipped' | 'manual_review' | 'error';
  updatedProduct?: Partial<InsertProduct>;
  reason: string;
  metadata?: {
    oldSignatures?: { contentHash?: string; variantsHash?: string; imagesHash?: string };
    newSignatures?: { contentHash: string; variantsHash: string; imagesHash: string };
    mergedFields?: string[];
    conflictDetails?: any;
  };
}

export interface ResolutionOptions {
  vendorPriority: 'local' | 'remote';
  timestampTolerance: number; // milliseconds
  autoMergeEnabled: boolean;
  preserveLocalInventory: boolean;
  preserveLocalPricing: boolean;
  allowManualReview: boolean;
}

export interface ManualReviewItem {
  id: string;
  sku: string;
  conflictType: ConflictType;
  localData: Partial<Product>;
  remoteData: Partial<ShopifyProduct>;
  conflictDetails: ConflictDetectionResult;
  createdAt: Date;
  status: 'pending' | 'resolved' | 'expired';
}

export class ConflictResolutionService {
  private storage: IStorage;
  private syncRunManager: SyncRunManager;
  private manualReviewQueue: Map<string, ManualReviewItem> = new Map();

  constructor(storage: IStorage, syncRunManager: SyncRunManager) {
    this.storage = storage;
    this.syncRunManager = syncRunManager;
  }

  /**
   * Resolves a conflict based on the detection result and resolution options
   */
  async resolveConflict(
    conflictResult: ConflictDetectionResult,
    options: ResolutionOptions,
    syncRunId?: string
  ): Promise<ResolutionResult> {
    try {
      switch (conflictResult.resolutionStrategy) {
        case ConflictResolutionStrategy.ACCEPT_LOCAL:
          return this.acceptLocalChanges(conflictResult, options);

        case ConflictResolutionStrategy.ACCEPT_REMOTE:
          return this.acceptRemoteChanges(conflictResult, options);

        case ConflictResolutionStrategy.VENDOR_PRIORITY:
          return this.applyVendorPriority(conflictResult, options);

        case ConflictResolutionStrategy.TIMESTAMP_BASED:
          return this.applyTimestampResolution(conflictResult, options);

        case ConflictResolutionStrategy.MERGE_STRATEGY:
          return this.applyMergeStrategy(conflictResult, options);

        case ConflictResolutionStrategy.SKIP_SYNC:
          return this.skipSync(conflictResult);

        case ConflictResolutionStrategy.MANUAL_REVIEW:
          return this.queueForManualReview(conflictResult, options);

        default:
          return {
            resolved: false,
            action: 'error',
            reason: `Unknown resolution strategy: ${conflictResult.resolutionStrategy}`
          };
      }
    } catch (error) {
      return {
        resolved: false,
        action: 'error',
        reason: `Resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Accepts local changes and skips remote update
   */
  private async acceptLocalChanges(
    conflictResult: ConflictDetectionResult,
    options: ResolutionOptions
  ): Promise<ResolutionResult> {
    if (!conflictResult.localProduct) {
      return {
        resolved: false,
        action: 'error',
        reason: 'No local product data available for ACCEPT_LOCAL strategy'
      };
    }

    return {
      resolved: true,
      action: 'accepted_local',
      reason: 'Local changes preserved based on conflict resolution strategy',
      metadata: {
        oldSignatures: {
          contentHash: conflictResult.localProduct.contentHash || undefined,
          variantsHash: conflictResult.localProduct.variantsHash || undefined,
          imagesHash: conflictResult.localProduct.imagesHash || undefined
        }
      }
    };
  }

  /**
   * Accepts remote changes and updates local product
   */
  private async acceptRemoteChanges(
    conflictResult: ConflictDetectionResult,
    options: ResolutionOptions
  ): Promise<ResolutionResult> {
    if (!conflictResult.remoteProduct) {
      return {
        resolved: false,
        action: 'error',
        reason: 'No remote product data available for ACCEPT_REMOTE strategy'
      };
    }

    const remoteSignatures = computeProductSignatures(conflictResult.remoteProduct);
    const oldSignatures = conflictResult.localProduct ? {
      contentHash: conflictResult.localProduct.contentHash || undefined,
      variantsHash: conflictResult.localProduct.variantsHash || undefined,
      imagesHash: conflictResult.localProduct.imagesHash || undefined
    } : undefined;

    // Build updated product data from remote
    const updatedProduct: Partial<InsertProduct> = {
      name: conflictResult.remoteProduct.title || '',
      description: conflictResult.remoteProduct.body_html || '',
      tags: conflictResult.remoteProduct.tags ? 
        JSON.stringify(conflictResult.remoteProduct.tags.split(',').map(tag => tag.trim())) : null,
      status: this.mapShopifyStatus(conflictResult.remoteProduct.status || 'active'),
      contentHash: remoteSignatures.contentHash,
      variantsHash: remoteSignatures.variantsHash,
      imagesHash: remoteSignatures.imagesHash,
      lastHashedAt: new Date(),
      syncVersion: (conflictResult.localProduct?.syncVersion || 0) + 1
    };

    // Handle variants and pricing
    if (conflictResult.remoteProduct.variants && conflictResult.remoteProduct.variants.length > 0) {
      const primaryVariant = conflictResult.remoteProduct.variants[0];
      
      // Only update pricing if not preserving local pricing
      if (!options.preserveLocalPricing) {
        updatedProduct.price = primaryVariant.price || null;
        updatedProduct.compareAtPrice = primaryVariant.compare_at_price || null;
      }

      // Only update inventory if not preserving local inventory
      if (!options.preserveLocalInventory) {
        updatedProduct.inventory = primaryVariant.inventory_quantity || 0;
      }

      updatedProduct.variants = JSON.stringify(conflictResult.remoteProduct.variants);
    }

    // Handle images
    if (conflictResult.remoteProduct.images) {
      updatedProduct.images = JSON.stringify(conflictResult.remoteProduct.images);
      if (conflictResult.remoteProduct.images.length > 0) {
        updatedProduct.primaryImage = conflictResult.remoteProduct.images[0].src;
      }
    }

    return {
      resolved: true,
      action: 'accepted_remote',
      updatedProduct,
      reason: 'Remote changes accepted based on conflict resolution strategy',
      metadata: {
        oldSignatures,
        newSignatures: remoteSignatures
      }
    };
  }

  /**
   * Applies vendor priority resolution
   */
  private async applyVendorPriority(
    conflictResult: ConflictDetectionResult,
    options: ResolutionOptions
  ): Promise<ResolutionResult> {
    if (options.vendorPriority === 'local') {
      return this.acceptLocalChanges(conflictResult, options);
    } else {
      return this.acceptRemoteChanges(conflictResult, options);
    }
  }

  /**
   * Applies timestamp-based resolution
   */
  private async applyTimestampResolution(
    conflictResult: ConflictDetectionResult,
    options: ResolutionOptions
  ): Promise<ResolutionResult> {
    const localTime = conflictResult.metadata.localLastModified;
    const remoteTime = conflictResult.metadata.remoteLastModified;

    if (!localTime || !remoteTime) {
      // Fall back to vendor priority if timestamps are missing
      return this.applyVendorPriority(conflictResult, options);
    }

    const timeDiff = localTime.getTime() - remoteTime.getTime();

    // If within tolerance, use vendor priority
    if (Math.abs(timeDiff) <= options.timestampTolerance) {
      return this.applyVendorPriority(conflictResult, options);
    }

    // Use newer timestamp
    if (timeDiff > 0) {
      return this.acceptLocalChanges(conflictResult, {
        ...options,
        reason: `Local version newer by ${Math.abs(timeDiff)}ms`
      } as any);
    } else {
      return this.acceptRemoteChanges(conflictResult, {
        ...options,
        reason: `Remote version newer by ${Math.abs(timeDiff)}ms`
      } as any);
    }
  }

  /**
   * Applies intelligent merge strategy for non-conflicting fields
   */
  private async applyMergeStrategy(
    conflictResult: ConflictDetectionResult,
    options: ResolutionOptions
  ): Promise<ResolutionResult> {
    if (!conflictResult.localProduct || !conflictResult.remoteProduct) {
      return {
        resolved: false,
        action: 'error',
        reason: 'Missing product data for merge strategy'
      };
    }

    const mergedFields: string[] = [];
    const updatedProduct: Partial<InsertProduct> = {};

    // Merge non-conflicting content
    if (!conflictResult.metadata.changedComponents.includes('content')) {
      // Keep local content if remote hasn't changed
      updatedProduct.name = conflictResult.localProduct.name;
      updatedProduct.description = conflictResult.localProduct.description;
      mergedFields.push('content');
    } else {
      // Use remote content if it has changed
      updatedProduct.name = conflictResult.remoteProduct.title || '';
      updatedProduct.description = conflictResult.remoteProduct.body_html || '';
      mergedFields.push('content:remote');
    }

    // Smart pricing merge
    if (options.preserveLocalPricing) {
      updatedProduct.price = conflictResult.localProduct.price;
      updatedProduct.compareAtPrice = conflictResult.localProduct.compareAtPrice;
      mergedFields.push('pricing:local');
    } else if (conflictResult.remoteProduct.variants && conflictResult.remoteProduct.variants.length > 0) {
      const remoteVariant = conflictResult.remoteProduct.variants[0];
      updatedProduct.price = remoteVariant.price || null;
      updatedProduct.compareAtPrice = remoteVariant.compare_at_price || null;
      mergedFields.push('pricing:remote');
    }

    // Smart inventory merge
    if (options.preserveLocalInventory) {
      updatedProduct.inventory = conflictResult.localProduct.inventory;
      mergedFields.push('inventory:local');
    } else if (conflictResult.remoteProduct.variants && conflictResult.remoteProduct.variants.length > 0) {
      updatedProduct.inventory = conflictResult.remoteProduct.variants[0].inventory_quantity || 0;
      mergedFields.push('inventory:remote');
    }

    // Update signatures
    const remoteSignatures = computeProductSignatures(conflictResult.remoteProduct);
    updatedProduct.contentHash = remoteSignatures.contentHash;
    updatedProduct.variantsHash = remoteSignatures.variantsHash;
    updatedProduct.imagesHash = remoteSignatures.imagesHash;
    updatedProduct.lastHashedAt = new Date();
    updatedProduct.syncVersion = (conflictResult.localProduct.syncVersion || 0) + 1;

    return {
      resolved: true,
      action: 'merged',
      updatedProduct,
      reason: `Applied merge strategy for fields: ${mergedFields.join(', ')}`,
      metadata: {
        mergedFields,
        newSignatures: remoteSignatures
      }
    };
  }

  /**
   * Skips sync for this product
   */
  private async skipSync(conflictResult: ConflictDetectionResult): Promise<ResolutionResult> {
    return {
      resolved: true,
      action: 'skipped',
      reason: 'Sync skipped based on conflict resolution strategy'
    };
  }

  /**
   * Queues conflict for manual review
   */
  private async queueForManualReview(
    conflictResult: ConflictDetectionResult,
    options: ResolutionOptions
  ): Promise<ResolutionResult> {
    if (!options.allowManualReview) {
      // Fall back to vendor priority if manual review is disabled
      return this.applyVendorPriority(conflictResult, options);
    }

    const reviewId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const reviewItem: ManualReviewItem = {
      id: reviewId,
      sku: conflictResult.localProduct?.sku || 'unknown',
      conflictType: conflictResult.conflictType,
      localData: conflictResult.localProduct || {},
      remoteData: conflictResult.remoteProduct || {},
      conflictDetails: conflictResult,
      createdAt: new Date(),
      status: 'pending'
    };

    this.manualReviewQueue.set(reviewId, reviewItem);

    return {
      resolved: false,
      action: 'manual_review',
      reason: `Conflict queued for manual review (ID: ${reviewId})`,
      metadata: {
        conflictDetails: conflictResult
      }
    };
  }

  /**
   * Gets pending manual review items
   */
  getManualReviewQueue(): ManualReviewItem[] {
    return Array.from(this.manualReviewQueue.values())
      .filter(item => item.status === 'pending')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /**
   * Resolves a manual review item
   */
  async resolveManualReview(
    reviewId: string,
    decision: 'accept_local' | 'accept_remote' | 'custom',
    customData?: Partial<InsertProduct>
  ): Promise<ResolutionResult> {
    const reviewItem = this.manualReviewQueue.get(reviewId);
    if (!reviewItem) {
      return {
        resolved: false,
        action: 'error',
        reason: `Manual review item ${reviewId} not found`
      };
    }

    reviewItem.status = 'resolved';

    switch (decision) {
      case 'accept_local':
        return {
          resolved: true,
          action: 'accepted_local',
          reason: 'Manual review: accepted local changes'
        };

      case 'accept_remote':
        return this.acceptRemoteChanges(reviewItem.conflictDetails, {
          vendorPriority: 'remote',
          timestampTolerance: 0,
          autoMergeEnabled: false,
          preserveLocalInventory: false,
          preserveLocalPricing: false,
          allowManualReview: false
        });

      case 'custom':
        if (!customData) {
          return {
            resolved: false,
            action: 'error',
            reason: 'Custom data required for custom resolution'
          };
        }

        return {
          resolved: true,
          action: 'accepted_remote',
          updatedProduct: customData,
          reason: 'Manual review: applied custom resolution'
        };

      default:
        return {
          resolved: false,
          action: 'error',
          reason: `Invalid manual review decision: ${decision}`
        };
    }
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
   * Applies resolution and updates the product in storage
   */
  async applyResolution(
    result: ResolutionResult,
    sku: string,
    syncRunId?: string
  ): Promise<{ success: boolean; updatedProduct?: Product; error?: string }> {
    try {
      if (!result.resolved || !result.updatedProduct) {
        return { success: false, error: 'Resolution not applicable or missing update data' };
      }

      // Find existing product
      const existingProduct = await this.storage.getProductBySku(sku);
      if (!existingProduct) {
        return { success: false, error: `Product with SKU ${sku} not found` };
      }

      // Apply updates
      const updatedProduct = await this.storage.updateProduct(existingProduct.id, result.updatedProduct);

      // Log sync event if sync run is provided
      if (syncRunId && this.syncRunManager) {
        const eventData: ProductSyncEventData = {
          sku,
          eventType: result.action === 'accepted_remote' ? 'update' : 'skip',
          operation: 'save',
          productId: updatedProduct.id,
          afterData: updatedProduct,
          success: true,
          processingTimeMs: 0 // Could be measured if needed
        };

        await this.syncRunManager.recordProductSyncEvent(syncRunId, eventData);
      }

      return { success: true, updatedProduct };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Log sync event for failure if sync run is provided
      if (syncRunId && this.syncRunManager) {
        const eventData: ProductSyncEventData = {
          sku,
          eventType: 'error',
          operation: 'save',
          success: false,
          errorMessage,
          processingTimeMs: 0
        };

        await this.syncRunManager.recordProductSyncEvent(syncRunId, eventData);
      }

      return { success: false, error: errorMessage };
    }
  }
}
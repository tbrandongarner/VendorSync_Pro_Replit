import { v4 as uuidv4 } from 'uuid';
import { IStorage } from '../storage';
import { SyncRun, InsertSyncRun, ProductSyncEvent, InsertProductSyncEvent } from '@shared/schema';

/**
 * Sync Run Lifecycle Management Service
 * Manages sync run creation, tracking, lineage, and completion with comprehensive metrics
 */

export interface SyncRunMetrics {
  productsFound: number;
  productsProcessed: number;
  productsCreated: number;
  productsUpdated: number;
  productsFailed: number;
  productsSkipped: number;
  apiCallsMade: number;
  rateLimitHits: number;
  avgResponseTime: number;
}

export interface SyncRunCreateOptions {
  syncJobId: number;
  vendorId: number;
  storeId: number;
  syncType: string; // "pull", "push", "bidirectional"
  direction: string; // "shopify_to_local", "local_to_shopify"
  parentRunId?: string;
  retriedFromRunId?: string;
  batchSize?: number;
}

export interface ProductSyncEventData {
  sku: string;
  eventType: 'create' | 'update' | 'skip' | 'error' | 'conflict';
  operation: 'fetch' | 'compare' | 'hash' | 'save' | 'upload';
  productId?: number;
  shopifyProductId?: string;
  beforeData?: any;
  afterData?: any;
  shopifyData?: any;
  oldContentHash?: string;
  newContentHash?: string;
  oldSyncVersion?: number;
  newSyncVersion?: number;
  changedFields?: string[];
  success?: boolean;
  errorMessage?: string;
  errorCode?: string;
  conflictReason?: string;
  skippedReason?: string;
  processingTimeMs?: number;
  apiCallsUsed?: number;
}

export class SyncRunManager {
  private storage: IStorage;
  private currentRunMetrics: Map<string, SyncRunMetrics> = new Map();

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  /**
   * Starts a new sync run with proper initialization and lineage tracking
   */
  async startSyncRun(options: SyncRunCreateOptions): Promise<SyncRun> {
    const runId = uuidv4();
    const startTime = new Date();

    const syncRunData: InsertSyncRun = {
      runId,
      syncJobId: options.syncJobId,
      vendorId: options.vendorId,
      storeId: options.storeId,
      syncType: options.syncType,
      direction: options.direction,
      batchSize: options.batchSize || 50,
      status: 'running',
      startedAt: startTime,
      parentRunId: options.parentRunId,
      retriedFromRunId: options.retriedFromRunId,
      productsFound: 0,
      productsProcessed: 0,
      productsCreated: 0,
      productsUpdated: 0,
      productsFailed: 0,
      productsSkipped: 0,
      apiCallsMade: 0,
      rateLimitHits: 0,
      avgResponseTime: 0,
      errors: null,
      conflicts: null,
      warnings: null
    };

    const syncRun = await this.storage.createSyncRun(syncRunData);

    // Initialize metrics tracking for this run
    this.currentRunMetrics.set(runId, {
      productsFound: 0,
      productsProcessed: 0,
      productsCreated: 0,
      productsUpdated: 0,
      productsFailed: 0,
      productsSkipped: 0,
      apiCallsMade: 0,
      rateLimitHits: 0,
      avgResponseTime: 0
    });

    return syncRun;
  }

  /**
   * Updates sync run metrics during processing
   */
  async updateSyncRunMetrics(runId: string, updates: Partial<SyncRunMetrics>): Promise<void> {
    const currentMetrics = this.currentRunMetrics.get(runId);
    if (!currentMetrics) {
      throw new Error(`Sync run ${runId} not found in active metrics`);
    }

    // Merge updates with current metrics
    Object.assign(currentMetrics, updates);

    // avgResponseTime is stored directly from the updates parameter
    // It's managed externally based on total processing time and API call count

    // Update the database record
    const syncRun = await this.storage.getSyncRunByRunId(runId);
    if (syncRun) {
      await this.storage.updateSyncRun(syncRun.id, {
        productsFound: currentMetrics.productsFound,
        productsProcessed: currentMetrics.productsProcessed,
        productsCreated: currentMetrics.productsCreated,
        productsUpdated: currentMetrics.productsUpdated,
        productsFailed: currentMetrics.productsFailed,
        productsSkipped: currentMetrics.productsSkipped,
        apiCallsMade: currentMetrics.apiCallsMade,
        rateLimitHits: currentMetrics.rateLimitHits,
        avgResponseTime: currentMetrics.avgResponseTime
      });
    }
  }

  /**
   * Records a product sync event with detailed tracking
   */
  async recordProductSyncEvent(
    runId: string, 
    eventData: ProductSyncEventData
  ): Promise<ProductSyncEvent> {
    const syncRun = await this.storage.getSyncRunByRunId(runId);
    if (!syncRun) {
      throw new Error(`Sync run ${runId} not found`);
    }

    const eventRecord: InsertProductSyncEvent = {
      syncRunId: syncRun.id,
      sku: eventData.sku,
      productId: eventData.productId,
      shopifyProductId: eventData.shopifyProductId,
      eventType: eventData.eventType,
      operation: eventData.operation,
      oldContentHash: eventData.oldContentHash,
      newContentHash: eventData.newContentHash,
      oldSyncVersion: eventData.oldSyncVersion,
      newSyncVersion: eventData.newSyncVersion,
      changedFields: eventData.changedFields ? JSON.stringify(eventData.changedFields) : null,
      beforeData: eventData.beforeData ? JSON.stringify(eventData.beforeData) : null,
      afterData: eventData.afterData ? JSON.stringify(eventData.afterData) : null,
      shopifyData: eventData.shopifyData ? JSON.stringify(eventData.shopifyData) : null,
      success: eventData.success !== false, // Default to true unless explicitly false
      errorMessage: eventData.errorMessage,
      errorCode: eventData.errorCode,
      conflictReason: eventData.conflictReason,
      skippedReason: eventData.skippedReason,
      processingTimeMs: eventData.processingTimeMs || 0,
      apiCallsUsed: eventData.apiCallsUsed || 0
    };

    const event = await this.storage.createProductSyncEvent(eventRecord);

    // Update run metrics based on the event
    const currentMetrics = this.currentRunMetrics.get(runId);
    if (currentMetrics) {
      currentMetrics.productsProcessed++;
      
      switch (eventData.eventType) {
        case 'create':
          currentMetrics.productsCreated++;
          break;
        case 'update':
          currentMetrics.productsUpdated++;
          break;
        case 'skip':
          currentMetrics.productsSkipped++;
          break;
        case 'error':
          currentMetrics.productsFailed++;
          break;
        case 'conflict':
          currentMetrics.productsFailed++; // Conflicts are also failures
          break;
      }

      if (eventData.processingTimeMs && currentMetrics.apiCallsMade > 0) {
        // Update average response time based on cumulative data
        const totalTime = currentMetrics.avgResponseTime * (currentMetrics.apiCallsMade - 1) + eventData.processingTimeMs;
        currentMetrics.avgResponseTime = Math.round(totalTime / currentMetrics.apiCallsMade);
      }

      await this.updateSyncRunMetrics(runId, currentMetrics);
    }

    return event;
  }

  /**
   * Records API call metrics for rate limiting tracking
   */
  async recordApiCall(
    runId: string, 
    responseTimeMs: number, 
    wasRateLimited: boolean = false
  ): Promise<void> {
    const currentMetrics = this.currentRunMetrics.get(runId);
    if (currentMetrics) {
      currentMetrics.apiCallsMade++;
      
      // Update rolling average response time
      if (currentMetrics.apiCallsMade === 1) {
        currentMetrics.avgResponseTime = responseTimeMs;
      } else {
        const totalTime = currentMetrics.avgResponseTime * (currentMetrics.apiCallsMade - 1) + responseTimeMs;
        currentMetrics.avgResponseTime = Math.round(totalTime / currentMetrics.apiCallsMade);
      }
      
      if (wasRateLimited) {
        currentMetrics.rateLimitHits++;
      }

      await this.updateSyncRunMetrics(runId, currentMetrics);
    }
  }

  /**
   * Updates the products found count (usually from initial API discovery)
   */
  async setProductsFound(runId: string, count: number): Promise<void> {
    const currentMetrics = this.currentRunMetrics.get(runId);
    if (currentMetrics) {
      currentMetrics.productsFound = count;
      await this.updateSyncRunMetrics(runId, currentMetrics);
    }
  }

  /**
   * Completes a sync run with final status and summary
   */
  async completeSyncRun(
    runId: string, 
    status: 'completed' | 'failed' | 'cancelled',
    errorDetails?: string,
    resultSummary?: any
  ): Promise<SyncRun> {
    const syncRun = await this.storage.getSyncRunByRunId(runId);
    if (!syncRun) {
      throw new Error(`Sync run ${runId} not found`);
    }

    const completedAt = new Date();
    // No durationMs field in schema - timing is handled via timestamps

    const finalMetrics = this.currentRunMetrics.get(runId);
    
    const updates: Partial<InsertSyncRun> = {
      status,
      completedAt,
      errors: errorDetails ? JSON.stringify([{ message: errorDetails, timestamp: completedAt }]) : null
    };

    // Add final metrics if available
    if (finalMetrics) {
      Object.assign(updates, {
        productsFound: finalMetrics.productsFound,
        productsProcessed: finalMetrics.productsProcessed,
        productsCreated: finalMetrics.productsCreated,
        productsUpdated: finalMetrics.productsUpdated,
        productsFailed: finalMetrics.productsFailed,
        productsSkipped: finalMetrics.productsSkipped,
        apiCallsMade: finalMetrics.apiCallsMade,
        rateLimitHits: finalMetrics.rateLimitHits,
        avgResponseTime: finalMetrics.avgResponseTime
      });
    }

    const updatedSyncRun = await this.storage.updateSyncRun(syncRun.id, updates);

    // Clean up metrics tracking
    this.currentRunMetrics.delete(runId);

    return updatedSyncRun;
  }

  /**
   * Creates a retry sync run linked to a failed run
   */
  async retrySyncRun(
    failedRunId: string,
    syncJobId: number,
    vendorId: number,
    notes?: string
  ): Promise<SyncRun> {
    const failedRun = await this.storage.getSyncRunByRunId(failedRunId);
    if (!failedRun) {
      throw new Error(`Failed sync run ${failedRunId} not found`);
    }

    return this.startSyncRun({
      syncJobId,
      vendorId,
      storeId: failedRun.storeId,
      syncType: failedRun.syncType,
      direction: failedRun.direction,
      retriedFromRunId: failedRunId,
      batchSize: failedRun.batchSize || 50
    });
  }

  /**
   * Creates a continuation sync run for large sync operations
   */
  async continueSyncRun(
    parentRunId: string,
    syncJobId: number,
    vendorId: number,
    notes?: string
  ): Promise<SyncRun> {
    const parentRun = await this.storage.getSyncRunByRunId(parentRunId);
    if (!parentRun) {
      throw new Error(`Parent sync run ${parentRunId} not found`);
    }

    return this.startSyncRun({
      syncJobId,
      vendorId,
      storeId: parentRun.storeId,
      syncType: parentRun.syncType,
      direction: parentRun.direction,
      parentRunId,
      batchSize: parentRun.batchSize || 50
    });
  }

  /**
   * Gets current metrics for an active sync run
   */
  getCurrentMetrics(runId: string): SyncRunMetrics | undefined {
    return this.currentRunMetrics.get(runId);
  }

  /**
   * Gets sync run history for a vendor or sync job
   */
  async getSyncRunHistory(
    vendorId?: number,
    syncJobId?: number,
    limit: number = 50
  ): Promise<SyncRun[]> {
    return this.storage.getSyncRuns(syncJobId, vendorId);
  }

  /**
   * Gets product sync events for a specific sync run
   */
  async getProductSyncEvents(runId: string): Promise<ProductSyncEvent[]> {
    const syncRun = await this.storage.getSyncRunByRunId(runId);
    if (!syncRun) {
      throw new Error(`Sync run ${runId} not found`);
    }

    return this.storage.getProductSyncEvents(syncRun.id);
  }

  /**
   * Gets sync event history for a specific SKU
   */
  async getSkuSyncHistory(sku: string, limit: number = 20): Promise<ProductSyncEvent[]> {
    return this.storage.getProductSyncEventsBySku(sku, limit);
  }
}
import { getWebSocketService } from './websocket';
import { storage } from '../storage';
import { MemoryQueue, MemoryWorker, type MemoryJob } from './memoryQueue';
import type { InsertSyncJob, SyncJob } from '@shared/schema';

// Use in-memory queue system (Redis-free for this environment)
const redisAvailable = false;
console.log('Using in-memory queue system for job processing');

// In-memory queue configuration (no Redis needed)
const queueConfig = {
  maxJobs: 1000,
  retryAttempts: 3,
  retryDelay: 2000
};

// Job types and interfaces
export interface SyncJobData {
  syncJobId: number;
  vendorId: number;
  storeId: number;
  userId: string;
  options: {
    direction: 'shopify_to_local' | 'local_to_shopify' | 'bidirectional' | 'pull' | 'push';
    syncImages: boolean;
    syncInventory: boolean;
    syncPricing: boolean;
    syncTags: boolean;
    syncVariants: boolean;
    syncDescriptions: boolean;
    batchSize: number;
  };
}

export interface FileImportJobData {
  vendorId: number;
  storeId: number;
  userId: string;
  uploadedProductIds: number[];
  importMode: 'new_only' | 'update_existing' | 'both';
}

export interface PricingUpdateJobData {
  batchId: number;
  userId: string;
  action: 'apply' | 'revert';
}

// Create in-memory queues (Redis-free)
export const syncQueue = new MemoryQueue('sync-operations');
export const fileImportQueue = new MemoryQueue('file-import');
export const pricingQueue = new MemoryQueue('pricing-updates');

// Job processing service
export class JobQueueService {
  private static instance: JobQueueService;
  private workers: MemoryWorker[] = [];
  private wsService = getWebSocketService();

  private constructor() {
    this.setupWorkers();
  }

  static getInstance(): JobQueueService {
    if (!JobQueueService.instance) {
      JobQueueService.instance = new JobQueueService();
    }
    return JobQueueService.instance;
  }

  private setupWorkers() {
    // Use in-memory workers (Redis-free)
    const syncWorker = new MemoryWorker('sync-operations', async (job: MemoryJob) => {
      await this.processSyncJobMemory(job);
    });

    const fileImportWorker = new MemoryWorker('file-import', async (job: MemoryJob) => {
      await this.processFileImportJobMemory(job);
    });

    const pricingWorker = new MemoryWorker('pricing-updates', async (job: MemoryJob) => {
        await this.processPricingJob(job);
      }, workerConfig);

      // Setup event handlers for BullMQ workers
      [syncWorker, fileImportWorker, pricingWorker].forEach(worker => {
        worker.on('completed', (job) => {
          console.log(`Job ${job.id} completed successfully`);
          this.broadcastJobUpdate(job, 'completed');
        });

        worker.on('failed', (job, error) => {
          console.error(`Job ${job?.id} failed:`, error);
          this.broadcastJobUpdate(job, 'failed', error.message);
        });

        worker.on('progress', (job, progress) => {
          console.log(`Job ${job.id} progress: ${progress}%`);
          this.broadcastJobUpdate(job, 'running', undefined, typeof progress === 'number' ? progress : undefined);
        });

        worker.on('error', (error) => {
          console.error('Worker error:', error);
        });
      });

      this.workers = [syncWorker, fileImportWorker, pricingWorker];
    } else {
      // Use memory workers when Redis is not available
      const syncWorker = new MemoryWorker('sync-operations', async (job: MemoryJob) => {
        await this.processSyncJobMemory(job);
      }, syncQueue as MemoryQueue);

      const fileImportWorker = new MemoryWorker('file-import', async (job: MemoryJob) => {
        await this.processFileImportJobMemory(job);
      }, fileImportQueue as MemoryQueue);

      const pricingWorker = new MemoryWorker('pricing-updates', async (job: MemoryJob) => {
        await this.processPricingJobMemory(job);
      }, pricingQueue as MemoryQueue);

      // Setup event handlers for memory workers
      [syncWorker, fileImportWorker, pricingWorker].forEach(worker => {
        worker.on('completed', (job) => {
          console.log(`Job ${job.id} completed successfully`);
          this.broadcastJobUpdateMemory(job, 'completed');
        });

        worker.on('failed', (job, error) => {
          console.error(`Job ${job?.id} failed:`, error);
          this.broadcastJobUpdateMemory(job, 'failed', error.message);
        });

        worker.on('progress', (job, progress) => {
          console.log(`Job ${job.id} progress: ${progress}%`);
          this.broadcastJobUpdateMemory(job, 'running', undefined, typeof progress === 'number' ? progress : undefined);
        });

        worker.on('error', (error) => {
          console.error('Worker error:', error);
        });
      });

      this.workers = [syncWorker, fileImportWorker, pricingWorker];
    }
  }

  // Add sync job to queue
  async addSyncJob(data: SyncJobData): Promise<Job<SyncJobData>> {
    const job = await syncQueue.add('sync-products', data, {
      jobId: `sync-${data.syncJobId}`, // Prevent duplicate jobs
      delay: 0,
    });

    console.log(`Added sync job ${job.id} to queue`);
    return job;
  }

  // Add file import job to queue
  async addFileImportJob(data: FileImportJobData): Promise<Job<FileImportJobData>> {
    const job = await fileImportQueue.add('import-file', data, {
      jobId: `import-${data.vendorId}-${Date.now()}`,
      delay: 0,
    });

    console.log(`Added file import job ${job.id} to queue`);
    return job;
  }

  // Add pricing update job to queue
  async addPricingJob(data: PricingUpdateJobData): Promise<Job<PricingUpdateJobData>> {
    const job = await pricingQueue.add('pricing-update', data, {
      jobId: `pricing-${data.batchId}-${data.action}`,
      delay: 0,
    });

    console.log(`Added pricing job ${job.id} to queue`);
    return job;
  }

  // Process sync job
  private async processSyncJob(job: Job<SyncJobData>) {
    const { syncJobId, vendorId, storeId, userId, options } = job.data;

    try {
      // Update job status in database
      await storage.updateSyncJob(syncJobId, {
        status: 'running',
        startedAt: new Date(),
      });

      // Get store and vendor information
      const store = await storage.getStore(storeId);
      const vendor = await storage.getVendor(vendorId);

      if (!store || !vendor) {
        throw new Error('Store or vendor not found');
      }

      // Import idempotent sync service  
      const { IdempotentProductSyncService } = await import('./idempotentSync');
      const syncService = new IdempotentProductSyncService(store, storage);

      // Start sync process
      await job.updateProgress(10);
      
      const idempotentOptions = {
        direction: options.direction || 'shopify_to_local',
        batchSize: options.batchSize || 50,
        syncImages: options.syncImages !== false,
        syncInventory: options.syncInventory !== false,
        syncPricing: options.syncPricing !== false,
        syncTags: options.syncTags !== false,
        syncVariants: options.syncVariants !== false,
        syncDescriptions: options.syncDescriptions !== false,
        conflictDetection: {
          direction: options.direction || 'shopify_to_local',
          vendorPriority: 'remote',
          timestampTolerance: 300000,
          enableAutoMerge: true,
          skipUnchanged: true
        },
        resolution: {
          vendorPriority: 'remote',
          timestampTolerance: 300000,
          autoMergeEnabled: true,
          preserveLocalInventory: false,
          preserveLocalPricing: false,
          allowManualReview: true
        }
      } as const;
      
      const result = await syncService.syncProducts(vendorId, syncJobId, idempotentOptions);
      
      await job.updateProgress(90);

      // Update job completion with IdempotentSyncResult format
      await storage.updateSyncJob(syncJobId, {
        status: result.success ? 'completed' : 'failed',
        completedAt: new Date(),
        processedItems: result.stats.productsProcessed,
        errors: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
      });

      job.updateProgress(100);

      // Log activity
      await storage.createActivity({
        userId,
        type: 'vendor_sync',
        description: `Synchronized ${result.stats.productsCreated + result.stats.productsUpdated} products for ${vendor.name}`,
        metadata: {
          vendorId,
          storeId,
          created: result.stats.productsCreated,
          updated: result.stats.productsUpdated,
          failed: result.stats.productsFailed,
          skipped: result.stats.productsSkipped,
          found: result.stats.productsFound,
          conflictsDetected: result.stats.conflictsDetected,
          conflictsResolved: result.stats.conflictsResolved,
        },
      });

      return result;
    } catch (error) {
      // Update job as failed
      await storage.updateSyncJob(syncJobId, {
        status: 'failed',
        completedAt: new Date(),
        errors: JSON.stringify([error instanceof Error ? error.message : 'Unknown error']),
      });

      throw error;
    }
  }

  // Process file import job
  private async processFileImportJob(job: Job<FileImportJobData>) {
    const { vendorId, storeId, userId, uploadedProductIds, importMode } = job.data;

    try {
      job.updateProgress(10);

      // Get uploaded products
      const uploadedProducts = await storage.getUploadedProducts(vendorId);
      const filteredProducts = uploadedProducts.filter(p => 
        uploadedProductIds.includes(p.id)
      );

      if (!filteredProducts.length) {
        throw new Error('No uploaded products found for import');
      }

      job.updateProgress(20);

      // Get store information
      const store = await storage.getStore(storeId);
      if (!store) {
        throw new Error('Store not found');
      }

      // Import sync service
      const { ProductSyncService } = await import('./sync');
      const syncService = new ProductSyncService(store);

      let processed = 0;
      let created = 0;
      let updated = 0;
      let failed = 0;

      // Process products in batches
      const batchSize = 10;
      for (let i = 0; i < filteredProducts.length; i += batchSize) {
        const batch = filteredProducts.slice(i, i + batchSize);
        
        for (const uploadedProduct of batch) {
          try {
            // Convert uploaded product to sync format
            const productData = {
              sku: uploadedProduct.sku,
              name: uploadedProduct.name,
              description: uploadedProduct.description,
              price: parseFloat(uploadedProduct.price || '0'),
              compareAtPrice: uploadedProduct.compareAtPrice ? parseFloat(uploadedProduct.compareAtPrice) : undefined,
              inventory: uploadedProduct.inventory || 0,
              barcode: uploadedProduct.barcode,
              tags: uploadedProduct.tags ? JSON.parse(uploadedProduct.tags as string) : [],
              images: uploadedProduct.images ? JSON.parse(uploadedProduct.images as string) : [],
            };

            // Sync to Shopify
            const result = await syncService.syncSingleProduct(productData, vendorId);
            
            if (result.success) {
              created++;
              
              // Update uploaded product status
              await storage.updateUploadedProduct(uploadedProduct.id, {
                status: 'synced',
                syncedProductId: result.productId,
              });
            } else {
              failed++;
              
              // Update uploaded product with error
              await storage.updateUploadedProduct(uploadedProduct.id, {
                status: 'failed',
                syncError: result.error || 'Unknown sync error',
              });
            }
          } catch (error) {
            failed++;
            console.error('Error processing uploaded product:', error);
          }
          
          processed++;
          
          // Update progress
          const progressPercent = Math.round((processed / filteredProducts.length) * 80) + 20;
          job.updateProgress(progressPercent);
        }
      }

      job.updateProgress(100);

      // Log activity
      const vendor = await storage.getVendor(vendorId);
      await storage.createActivity({
        userId,
        type: 'file_import',
        description: `Imported ${created} products from file for ${vendor?.name}`,
        metadata: {
          vendorId,
          storeId,
          created,
          updated,
          failed,
          totalProcessed: processed,
        },
      });

      return { created, updated, failed, processed };
    } catch (error) {
      throw error;
    }
  }

  // Process pricing job
  private async processPricingJob(job: Job<PricingUpdateJobData>) {
    const { batchId, userId, action } = job.data;

    try {
      job.updateProgress(25);

      if (action === 'apply') {
        await storage.applyPricingChanges(batchId);
      } else if (action === 'revert') {
        await storage.revertPricingChanges(batchId);
      }

      job.updateProgress(75);

      // Log activity
      const batch = await storage.getPricingBatch(batchId);
      await storage.createActivity({
        userId,
        type: 'pricing_update',
        description: `${action === 'apply' ? 'Applied' : 'Reverted'} pricing batch: ${batch?.name}`,
        metadata: {
          batchId,
          action,
          totalProducts: batch?.totalProducts || 0,
        },
      });

      job.updateProgress(100);

      return { success: true, action, batchId };
    } catch (error) {
      throw error;
    }
  }

  // Broadcast job updates via WebSocket
  private broadcastJobUpdate(job: Job | undefined, status: string, error?: string, progress?: number) {
    if (!job) return;

    const wsService = getWebSocketService();
    if (wsService) {
      wsService.broadcastToAll({
        type: 'job_update',
        data: {
          jobId: job.id,
          name: job.name,
          status,
          progress: progress || (status === 'completed' ? 100 : undefined),
          error,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // Get job status
  async getJobStatus(queueName: string, jobId: string) {
    let queue: Queue;
    
    switch (queueName) {
      case 'sync-operations':
        queue = syncQueue;
        break;
      case 'file-import':
        queue = fileImportQueue;
        break;
      case 'pricing-updates':
        queue = pricingQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }

    const job = await queue.getJob(jobId);
    if (!job) return null;

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      state: await job.getState(),
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }

  // Cancel job
  async cancelJob(queueName: string, jobId: string) {
    let queue: Queue;
    
    switch (queueName) {
      case 'sync-operations':
        queue = syncQueue;
        break;
      case 'file-import':
        queue = fileImportQueue;
        break;
      case 'pricing-updates':
        queue = pricingQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }

    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`Job ${jobId} cancelled`);
      return true;
    }
    
    return false;
  }

  // Pause queue
  async pauseQueue(queueName: string) {
    let queue: Queue;
    
    switch (queueName) {
      case 'sync-operations':
        queue = syncQueue;
        break;
      case 'file-import':
        queue = fileImportQueue;
        break;
      case 'pricing-updates':
        queue = pricingQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }

    await queue.pause();
    console.log(`Queue ${queueName} paused`);
  }

  // Resume queue
  async resumeQueue(queueName: string) {
    let queue: Queue;
    
    switch (queueName) {
      case 'sync-operations':
        queue = syncQueue;
        break;
      case 'file-import':
        queue = fileImportQueue;
        break;
      case 'pricing-updates':
        queue = pricingQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }

    await queue.resume();
    console.log(`Queue ${queueName} resumed`);
  }

  // Get queue statistics
  async getQueueStats(queueName: string) {
    let queue: Queue;
    
    switch (queueName) {
      case 'sync-operations':
        queue = syncQueue;
        break;
      case 'file-import':
        queue = fileImportQueue;
        break;
      case 'pricing-updates':
        queue = pricingQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  // Clean up resources
  async close() {
    console.log('Closing job queue service...');
    
    // Close all workers
    await Promise.all(this.workers.map(worker => worker.close()));
    
    // Close queues
    await Promise.all([
      syncQueue.close(),
      fileImportQueue.close(),
      pricingQueue.close(),
    ]);

    // Close Redis connection
    await connection.quit();
    
    console.log('Job queue service closed');
  }
}

// Export singleton instance
export const jobQueueService = JobQueueService.getInstance();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  await jobQueueService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await jobQueueService.close();
  process.exit(0);
});
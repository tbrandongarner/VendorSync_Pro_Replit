import { EventEmitter } from 'events';
import { getWebSocketService } from './websocket';
import { storage } from '../storage';
import type { InsertSyncJob } from '@shared/schema';

// Simple in-memory job queue for now - can be upgraded to BullMQ later when Redis is available
interface SimpleJob {
  id: string;
  type: 'sync' | 'file-import' | 'pricing';
  data: any;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  error?: string;
  result?: any;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  attempts: number;
  maxAttempts: number;
}

class SimpleJobQueue extends EventEmitter {
  private jobs = new Map<string, SimpleJob>();
  private runningJobs = new Set<string>();
  private processing = true;
  private concurrency = 3;

  constructor() {
    super();
    this.startProcessing();
  }

  async add(type: 'sync' | 'file-import' | 'pricing', data: any, options: { jobId?: string; delay?: number } = {}): Promise<SimpleJob> {
    const job: SimpleJob = {
      id: options.jobId || `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      status: 'pending',
      progress: 0,
      createdAt: Date.now(),
      attempts: 0,
      maxAttempts: 3,
    };

    this.jobs.set(job.id, job);
    console.log(`[SimpleQueue] Added ${type} job ${job.id}`);

    // Broadcast job creation
    this.broadcastJobUpdate(job);

    if (options.delay && options.delay > 0) {
      setTimeout(() => this.processNext(), options.delay);
    } else {
      setImmediate(() => this.processNext());
    }

    return job;
  }

  async getJob(jobId: string): Promise<SimpleJob | undefined> {
    return this.jobs.get(jobId);
  }

  async getStats() {
    const pending = Array.from(this.jobs.values()).filter(j => j.status === 'pending').length;
    const running = Array.from(this.jobs.values()).filter(j => j.status === 'running').length;
    const completed = Array.from(this.jobs.values()).filter(j => j.status === 'completed').length;
    const failed = Array.from(this.jobs.values()).filter(j => j.status === 'failed').length;

    return { pending, running, completed, failed };
  }

  async pause() {
    this.processing = false;
    console.log('[SimpleQueue] Paused');
  }

  async resume() {
    this.processing = true;
    this.processNext();
    console.log('[SimpleQueue] Resumed');
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (job && job.status === 'pending') {
      job.status = 'failed';
      job.error = 'Cancelled by user';
      job.completedAt = Date.now();
      this.broadcastJobUpdate(job);
      console.log(`[SimpleQueue] Cancelled job ${jobId}`);
      return true;
    }
    return false;
  }

  private async processNext() {
    if (!this.processing || this.runningJobs.size >= this.concurrency) {
      return;
    }

    // Find next pending job
    const pendingJob = Array.from(this.jobs.values()).find(j => j.status === 'pending');
    if (!pendingJob) return;

    // Start processing
    pendingJob.status = 'running';
    pendingJob.startedAt = Date.now();
    this.runningJobs.add(pendingJob.id);

    console.log(`[SimpleQueue] Processing ${pendingJob.type} job ${pendingJob.id}`);
    this.broadcastJobUpdate(pendingJob);

    try {
      // Process the job based on type
      let result;
      switch (pendingJob.type) {
        case 'sync':
          result = await this.processSyncJob(pendingJob);
          break;
        case 'file-import':
          result = await this.processFileImportJob(pendingJob);
          break;
        case 'pricing':
          result = await this.processPricingJob(pendingJob);
          break;
        default:
          throw new Error(`Unknown job type: ${pendingJob.type}`);
      }

      // Job completed successfully
      pendingJob.status = 'completed';
      pendingJob.progress = 100;
      pendingJob.result = result;
      pendingJob.completedAt = Date.now();
      
      console.log(`[SimpleQueue] Completed ${pendingJob.type} job ${pendingJob.id}`);
      this.broadcastJobUpdate(pendingJob);

    } catch (error) {
      // Job failed
      pendingJob.attempts++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (pendingJob.attempts < pendingJob.maxAttempts) {
        // Retry with exponential backoff
        console.log(`[SimpleQueue] Retrying ${pendingJob.type} job ${pendingJob.id} (attempt ${pendingJob.attempts}/${pendingJob.maxAttempts})`);
        pendingJob.status = 'pending';
        pendingJob.startedAt = undefined;
        
        const delay = Math.pow(2, pendingJob.attempts) * 2000; // 2s, 4s, 8s
        setTimeout(() => this.processNext(), delay);
      } else {
        // Max attempts reached, mark as failed
        pendingJob.status = 'failed';
        pendingJob.error = errorMessage;
        pendingJob.completedAt = Date.now();
        
        console.error(`[SimpleQueue] Failed ${pendingJob.type} job ${pendingJob.id}:`, errorMessage);
        this.broadcastJobUpdate(pendingJob);
      }
    } finally {
      this.runningJobs.delete(pendingJob.id);
      
      // Process next job
      setImmediate(() => this.processNext());
    }
  }

  private async processSyncJob(job: SimpleJob) {
    const { syncJobId, vendorId, storeId, userId, options } = job.data;

    // Update progress
    job.progress = 10;
    this.broadcastJobUpdate(job);

    // Get store and vendor information
    const store = await storage.getStore(storeId);
    const vendor = await storage.getVendor(vendorId);

    if (!store || !vendor) {
      throw new Error('Store or vendor not found');
    }

    // Update database sync job status
    await storage.updateSyncJob(syncJobId, {
      status: 'running',
      startedAt: new Date(),
    });

    job.progress = 20;
    this.broadcastJobUpdate(job);

    // Import and run sync service
    const { ProductSyncService } = await import('./sync');
    const syncService = new ProductSyncService(store);

    job.progress = 30;
    this.broadcastJobUpdate(job);

    const result = await syncService.syncProducts(vendorId, options);

    job.progress = 90;
    this.broadcastJobUpdate(job);

    // Update database sync job completion
    await storage.updateSyncJob(syncJobId, {
      status: result.success ? 'completed' : 'failed',
      completedAt: new Date(),
      processedItems: result.created + result.updated,
      errors: result.errors ? JSON.stringify(result.errors) : null,
    });

    // Log activity
    await storage.createActivity({
      userId,
      type: 'vendor_sync',
      description: `Synchronized ${result.created + result.updated} products for ${vendor.name}`,
      metadata: {
        vendorId,
        storeId,
        created: result.created,
        updated: result.updated,
        failed: result.failed,
      },
    });

    return result;
  }

  private async processFileImportJob(job: SimpleJob) {
    const { vendorId, storeId, userId, uploadedProductIds, importMode } = job.data;

    job.progress = 10;
    this.broadcastJobUpdate(job);

    // Get uploaded products
    const uploadedProducts = await storage.getUploadedProducts(vendorId);
    const filteredProducts = uploadedProducts.filter(p => 
      uploadedProductIds.includes(p.id)
    );

    if (!filteredProducts.length) {
      throw new Error('No uploaded products found for import');
    }

    job.progress = 20;
    this.broadcastJobUpdate(job);

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

    // Process products
    for (const uploadedProduct of filteredProducts) {
      try {
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

        const result = await syncService.syncSingleProduct(productData, vendorId);
        
        if (result.success) {
          created++;
          await storage.updateUploadedProduct(uploadedProduct.id, {
            status: 'synced',
            syncedProductId: result.productId,
          });
        } else {
          failed++;
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
      job.progress = Math.round((processed / filteredProducts.length) * 70) + 20;
      this.broadcastJobUpdate(job);
    }

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
  }

  private async processPricingJob(job: SimpleJob) {
    const { batchId, userId, action } = job.data;

    job.progress = 25;
    this.broadcastJobUpdate(job);

    if (action === 'apply') {
      await storage.applyPricingChanges(batchId);
    } else if (action === 'revert') {
      await storage.revertPricingChanges(batchId);
    }

    job.progress = 75;
    this.broadcastJobUpdate(job);

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

    return { success: true, action, batchId };
  }

  private broadcastJobUpdate(job: SimpleJob) {
    const wsService = getWebSocketService();
    if (wsService) {
      wsService.broadcastToAll({
        type: 'job_update',
        data: {
          jobId: job.id,
          name: `${job.type}-job`,
          status: job.status,
          progress: job.progress,
          error: job.error,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  private startProcessing() {
    this.processing = true;
    // Start processing loop
    setInterval(() => {
      if (this.processing) {
        this.processNext();
      }
    }, 1000);
  }
}

// Export singleton
export const simpleQueue = new SimpleJobQueue();

// Simple service wrapper
export class SimpleJobQueueService {
  async addSyncJob(data: any): Promise<any> {
    return await simpleQueue.add('sync', data, {
      jobId: `sync-${data.syncJobId}`,
    });
  }

  async addFileImportJob(data: any): Promise<any> {
    return await simpleQueue.add('file-import', data, {
      jobId: `import-${data.vendorId}-${Date.now()}`,
    });
  }

  async addPricingJob(data: any): Promise<any> {
    return await simpleQueue.add('pricing', data, {
      jobId: `pricing-${data.batchId}-${data.action}`,
    });
  }

  async getJobStatus(queueName: string, jobId: string) {
    const job = await simpleQueue.getJob(jobId);
    if (!job) return null;

    return {
      id: job.id,
      name: `${job.type}-job`,
      data: job.data,
      progress: job.progress,
      state: job.status,
      returnvalue: job.result,
      failedReason: job.error,
      timestamp: job.createdAt,
      processedOn: job.startedAt,
      finishedOn: job.completedAt,
    };
  }

  async cancelJob(queueName: string, jobId: string) {
    return await simpleQueue.cancelJob(jobId);
  }

  async pauseQueue(queueName: string) {
    await simpleQueue.pause();
  }

  async resumeQueue(queueName: string) {
    await simpleQueue.resume();
  }

  async getQueueStats(queueName: string) {
    return await simpleQueue.getStats();
  }

  async close() {
    console.log('Simple queue service closed');
  }
}

export const jobQueueService = new SimpleJobQueueService();
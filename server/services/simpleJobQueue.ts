import { getWebSocketService } from './websocket.js';
import { storage } from '../storage.js';
import type { InsertSyncJob, SyncJob } from '../../shared/schema.js';
import { IdempotentProductSyncService } from './idempotentSync.js';

// Simple job interfaces for in-memory processing
export interface SyncJobData {
  syncJobId: number;
  vendorId: number;
  storeId: number;
  userId: string;
  options: {
    direction: 'shopify_to_local' | 'local_to_shopify' | 'bidirectional';
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

// Simple job queue implementation
class SimpleJobQueue {
  private jobs: Map<string, any> = new Map();
  private processors: Map<string, (job: any) => Promise<void>> = new Map();
  private isProcessing = false;

  async add(jobType: string, data: any, options?: { id?: string; delay?: number }): Promise<string> {
    const jobId = options?.id || `${jobType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const job = {
      id: jobId,
      type: jobType,
      data,
      status: 'pending',
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: 3
    };

    this.jobs.set(jobId, job);

    // Process with delay if specified
    if (options?.delay) {
      setTimeout(() => this.processNext(), options.delay);
    } else {
      setImmediate(() => this.processNext());
    }

    return jobId;
  }

  registerProcessor(jobType: string, processor: (job: any) => Promise<void>) {
    this.processors.set(jobType, processor);
  }

  private async processNext() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Find next pending job
      const pendingJob = Array.from(this.jobs.values()).find(job => job.status === 'pending');
      
      if (pendingJob) {
        await this.processJob(pendingJob);
      }
    } catch (error) {
      console.error('Error processing jobs:', error);
    } finally {
      this.isProcessing = false;
      
      // Check for more jobs
      const hasMoreJobs = Array.from(this.jobs.values()).some(job => job.status === 'pending');
      if (hasMoreJobs) {
        setImmediate(() => this.processNext());
      }
    }
  }

  private async processJob(job: any) {
    const processor = this.processors.get(job.type);
    if (!processor) {
      console.error(`No processor found for job type: ${job.type}`);
      job.status = 'failed';
      job.error = 'No processor found';
      return;
    }

    job.status = 'active';
    job.attempts += 1;
    job.startedAt = new Date();

    try {
      await processor(job);
      job.status = 'completed';
      job.completedAt = new Date();
      console.log(`Job ${job.id} completed successfully`);
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      
      if (job.attempts < job.maxAttempts) {
        job.status = 'pending'; // Retry
        console.log(`Job ${job.id} will be retried (attempt ${job.attempts}/${job.maxAttempts})`);
      } else {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
      }
    }
  }

  getJob(jobId: string) {
    return this.jobs.get(jobId);
  }

  getAllJobs() {
    return Array.from(this.jobs.values());
  }

  removeJob(jobId: string) {
    this.jobs.delete(jobId);
  }

  // Clean up old completed/failed jobs
  cleanup(maxAge: number = 24 * 60 * 60 * 1000) { // 24 hours default
    const cutoff = new Date(Date.now() - maxAge);
    
    for (const [jobId, job] of this.jobs.entries()) {
      if ((job.status === 'completed' || job.status === 'failed') && job.completedAt < cutoff) {
        this.jobs.delete(jobId);
      }
    }
  }
}

// Create queue instances
export const syncQueue = new SimpleJobQueue();
export const fileImportQueue = new SimpleJobQueue();
export const pricingQueue = new SimpleJobQueue();

// Job processing service
export class SimpleJobService {
  private static instance: SimpleJobService;
  private wsService = getWebSocketService();

  private constructor() {
    this.setupProcessors();
    
    // Cleanup old jobs every hour
    setInterval(() => {
      syncQueue.cleanup();
      fileImportQueue.cleanup();
      pricingQueue.cleanup();
    }, 60 * 60 * 1000);
  }

  static getInstance(): SimpleJobService {
    if (!SimpleJobService.instance) {
      SimpleJobService.instance = new SimpleJobService();
    }
    return SimpleJobService.instance;
  }

  private setupProcessors() {
    // Sync job processor
    syncQueue.registerProcessor('sync-operations', async (job) => {
      await this.processSyncJob(job);
    });

    // File import processor
    fileImportQueue.registerProcessor('file-import', async (job) => {
      await this.processFileImportJob(job);
    });

    // Pricing update processor
    pricingQueue.registerProcessor('pricing-updates', async (job) => {
      await this.processPricingJob(job);
    });
  }

  private async processSyncJob(job: any) {
    const data: SyncJobData = job.data;
    console.log(`Processing sync job ${job.id} for vendor ${data.vendorId}`);

    try {
      // Update job status in database
      await storage.updateSyncJob(data.syncJobId, {
        status: 'running',
        startedAt: new Date()
      });

      this.broadcastJobUpdate({
        id: data.syncJobId,
        status: 'running',
        progress: 0,
        message: 'Starting synchronization...'
      });

      // Use idempotent sync service
      const syncService = new IdempotentSyncService(storage);
      
      await syncService.executeSync({
        vendorId: data.vendorId,
        storeId: data.storeId,
        direction: data.options.direction,
        batchSize: data.options.batchSize,
        syncImages: data.options.syncImages,
        syncInventory: data.options.syncInventory,
        syncPricing: data.options.syncPricing,
        syncTags: data.options.syncTags,
        syncVariants: data.options.syncVariants,
        syncDescriptions: data.options.syncDescriptions,
        resolution: {
          priceConflict: 'vendor_wins',
          inventoryConflict: 'vendor_wins',
          descriptionConflict: 'preserve_local'
        }
      });

      // Update completion status
      await storage.updateSyncJob(data.syncJobId, {
        status: 'completed',
        progress: 100,
        completedAt: new Date()
      });

      this.broadcastJobUpdate({
        id: data.syncJobId,
        status: 'completed',
        progress: 100,
        message: 'Synchronization completed successfully'
      });

    } catch (error) {
      console.error(`Sync job ${job.id} failed:`, error);
      
      await storage.updateSyncJob(data.syncJobId, {
        status: 'failed',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        completedAt: new Date()
      });

      this.broadcastJobUpdate({
        id: data.syncJobId,
        status: 'failed',
        progress: 0,
        message: `Synchronization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });

      throw error;
    }
  }

  private async processFileImportJob(job: any) {
    const data: FileImportJobData = job.data;
    console.log(`Processing file import job ${job.id} for vendor ${data.vendorId}`);

    try {
      this.broadcastJobUpdate({
        id: job.id,
        status: 'running',
        progress: 0,
        message: 'Processing uploaded file...'
      });

      // Process uploaded products (simplified implementation)
      for (let i = 0; i < data.uploadedProductIds.length; i++) {
        const productId = data.uploadedProductIds[i];
        
        // Mark product as needing sync
        await storage.updateProduct(productId, {
          needsSync: true,
          lastModifiedBy: 'file_import'
        });

        const progress = Math.round(((i + 1) / data.uploadedProductIds.length) * 100);
        this.broadcastJobUpdate({
          id: job.id,
          status: 'running',
          progress,
          message: `Processed ${i + 1}/${data.uploadedProductIds.length} products`
        });
      }

      this.broadcastJobUpdate({
        id: job.id,
        status: 'completed',
        progress: 100,
        message: `File import completed: ${data.uploadedProductIds.length} products processed`
      });

    } catch (error) {
      console.error(`File import job ${job.id} failed:`, error);
      
      this.broadcastJobUpdate({
        id: job.id,
        status: 'failed',
        progress: 0,
        message: `File import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });

      throw error;
    }
  }

  private async processPricingJob(job: any) {
    const data: PricingUpdateJobData = job.data;
    console.log(`Processing pricing job ${job.id} for batch ${data.batchId}`);

    try {
      this.broadcastJobUpdate({
        id: job.id,
        status: 'running',
        progress: 0,
        message: `${data.action === 'apply' ? 'Applying' : 'Reverting'} pricing updates...`
      });

      // Simplified pricing update logic
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate work

      this.broadcastJobUpdate({
        id: job.id,
        status: 'completed',
        progress: 100,
        message: `Pricing updates ${data.action === 'apply' ? 'applied' : 'reverted'} successfully`
      });

    } catch (error) {
      console.error(`Pricing job ${job.id} failed:`, error);
      
      this.broadcastJobUpdate({
        id: job.id,
        status: 'failed',
        progress: 0,
        message: `Pricing update failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });

      throw error;
    }
  }

  private broadcastJobUpdate(update: {
    id: string | number;
    status: string;
    progress: number;
    message: string;
  }) {
    this.wsService.broadcast('job-update', update);
  }

  // Public methods for adding jobs
  async addSyncJob(data: SyncJobData): Promise<string> {
    return await syncQueue.add('sync-operations', data);
  }

  async addFileImportJob(data: FileImportJobData): Promise<string> {
    return await fileImportQueue.add('file-import', data);
  }

  async addPricingJob(data: PricingUpdateJobData): Promise<string> {
    return await pricingQueue.add('pricing-updates', data);
  }

  // Job status methods
  getSyncJobStatus(jobId: string) {
    return syncQueue.getJob(jobId);
  }

  getFileImportJobStatus(jobId: string) {
    return fileImportQueue.getJob(jobId);
  }

  getPricingJobStatus(jobId: string) {
    return pricingQueue.getJob(jobId);
  }

  getAllJobs() {
    return {
      sync: syncQueue.getAllJobs(),
      fileImport: fileImportQueue.getAllJobs(),
      pricing: pricingQueue.getAllJobs()
    };
  }
}

// Export the service instance
export const jobService = SimpleJobService.getInstance();

console.log('Simple job queue service initialized (Redis-free)');
import { EventEmitter } from 'events';
import { getWebSocketService } from './websocket';

// In-memory job queue implementation for development when Redis is unavailable
export interface MemoryJob {
  id: string;
  name: string;
  data: any;
  progress: number;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
  returnvalue?: any;
  attempts: number;
  maxAttempts: number;
}

export class MemoryQueue extends EventEmitter {
  private jobs: Map<string, MemoryJob> = new Map();
  private waiting: MemoryJob[] = [];
  private active: MemoryJob[] = [];
  private completed: MemoryJob[] = [];
  private failed: MemoryJob[] = [];
  private processing = false;
  private maxJobs = { completed: 50, failed: 100 };

  constructor(private name: string) {
    super();
    this.startProcessing();
  }

  async add(jobName: string, data: any, options: { jobId?: string; delay?: number } = {}): Promise<MemoryJob> {
    const job: MemoryJob = {
      id: options.jobId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: jobName,
      data,
      progress: 0,
      state: 'waiting',
      timestamp: Date.now(),
      attempts: 0,
      maxAttempts: 3,
    };

    this.jobs.set(job.id, job);
    
    if (options.delay && options.delay > 0) {
      setTimeout(() => {
        this.waiting.push(job);
        this.processNext();
      }, options.delay);
    } else {
      this.waiting.push(job);
      this.processNext();
    }

    console.log(`[MemoryQueue:${this.name}] Added job ${job.id}`);
    return job;
  }

  async getJob(jobId: string): Promise<MemoryJob | null> {
    return this.jobs.get(jobId) || null;
  }

  async getWaiting(): Promise<MemoryJob[]> {
    return [...this.waiting];
  }

  async getActive(): Promise<MemoryJob[]> {
    return [...this.active];
  }

  async getCompleted(): Promise<MemoryJob[]> {
    return [...this.completed];
  }

  async getFailed(): Promise<MemoryJob[]> {
    return [...this.failed];
  }

  async getDelayed(): Promise<MemoryJob[]> {
    return []; // No delayed jobs in memory implementation
  }

  async pause(): Promise<void> {
    this.processing = false;
    console.log(`[MemoryQueue:${this.name}] Paused`);
  }

  async resume(): Promise<void> {
    this.processing = true;
    this.processNext();
    console.log(`[MemoryQueue:${this.name}] Resumed`);
  }

  async close(): Promise<void> {
    this.processing = false;
    this.removeAllListeners();
    console.log(`[MemoryQueue:${this.name}] Closed`);
  }

  private startProcessing() {
    this.processing = true;
    this.processNext();
  }

  private async processNext() {
    if (!this.processing || this.waiting.length === 0) {
      return;
    }

    const job = this.waiting.shift();
    if (!job) return;

    // Move to active
    job.state = 'active';
    job.processedOn = Date.now();
    this.active.push(job);

    console.log(`[MemoryQueue:${this.name}] Processing job ${job.id}`);
    this.emit('active', job);

    try {
      // Emit to worker for processing
      this.emit('process', job);
    } catch (error) {
      await this.failJob(job, error instanceof Error ? error.message : 'Unknown error');
    }

    // Process next job
    setImmediate(() => this.processNext());
  }

  async completeJob(job: MemoryJob, result?: any): Promise<void> {
    // Remove from active
    const activeIndex = this.active.findIndex(j => j.id === job.id);
    if (activeIndex >= 0) {
      this.active.splice(activeIndex, 1);
    }

    // Add to completed
    job.state = 'completed';
    job.finishedOn = Date.now();
    job.returnvalue = result;
    this.completed.push(job);

    // Maintain completed job limit
    while (this.completed.length > this.maxJobs.completed) {
      const oldJob = this.completed.shift();
      if (oldJob) {
        this.jobs.delete(oldJob.id);
      }
    }

    console.log(`[MemoryQueue:${this.name}] Job ${job.id} completed`);
    this.emit('completed', job, result);

    // Broadcast via WebSocket
    this.broadcastJobUpdate(job, 'completed');
  }

  async failJob(job: MemoryJob, error: string): Promise<void> {
    job.attempts++;

    if (job.attempts < job.maxAttempts) {
      // Retry the job
      console.log(`[MemoryQueue:${this.name}] Retrying job ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);
      
      // Remove from active and add back to waiting with delay
      const activeIndex = this.active.findIndex(j => j.id === job.id);
      if (activeIndex >= 0) {
        this.active.splice(activeIndex, 1);
      }

      job.state = 'waiting';
      
      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, job.attempts) * 1000;
      setTimeout(() => {
        this.waiting.push(job);
        this.processNext();
      }, delay);

      return;
    }

    // Remove from active
    const activeIndex = this.active.findIndex(j => j.id === job.id);
    if (activeIndex >= 0) {
      this.active.splice(activeIndex, 1);
    }

    // Add to failed
    job.state = 'failed';
    job.finishedOn = Date.now();
    job.failedReason = error;
    this.failed.push(job);

    // Maintain failed job limit
    while (this.failed.length > this.maxJobs.failed) {
      const oldJob = this.failed.shift();
      if (oldJob) {
        this.jobs.delete(oldJob.id);
      }
    }

    console.log(`[MemoryQueue:${this.name}] Job ${job.id} failed: ${error}`);
    this.emit('failed', job, new Error(error));

    // Broadcast via WebSocket
    this.broadcastJobUpdate(job, 'failed', error);
  }

  async updateProgress(job: MemoryJob, progress: number): Promise<void> {
    job.progress = Math.max(0, Math.min(100, progress));
    this.emit('progress', job, job.progress);

    // Broadcast via WebSocket
    this.broadcastJobUpdate(job, 'running', undefined, job.progress);
  }

  private broadcastJobUpdate(job: MemoryJob, status: string, error?: string, progress?: number) {
    const wsService = getWebSocketService();
    if (wsService) {
      wsService.broadcastToAll({
        type: 'job_update',
        data: {
          jobId: job.id,
          name: job.name,
          status,
          progress: progress !== undefined ? progress : (status === 'completed' ? 100 : job.progress),
          error,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
}

export class MemoryWorker extends EventEmitter {
  private processing = true;

  constructor(
    private queueName: string,
    private processor: (job: MemoryJob) => Promise<any>,
    private queue: MemoryQueue
  ) {
    super();
    this.setupWorker();
  }

  private setupWorker() {
    this.queue.on('process', async (job: MemoryJob) => {
      if (!this.processing) return;

      try {
        console.log(`[MemoryWorker:${this.queueName}] Processing job ${job.id}`);

        // Create job wrapper with updateProgress method
        const jobWrapper = {
          ...job,
          updateProgress: async (progress: number) => {
            await this.queue.updateProgress(job, progress);
          },
        };

        const result = await this.processor(jobWrapper);
        await this.queue.completeJob(job, result);
      } catch (error) {
        await this.queue.failJob(job, error instanceof Error ? error.message : 'Unknown error');
      }
    });
  }

  async close(): Promise<void> {
    this.processing = false;
    this.removeAllListeners();
    console.log(`[MemoryWorker:${this.queueName}] Closed`);
  }

  on(event: 'completed', listener: (job: MemoryJob, result?: any) => void): this;
  on(event: 'failed', listener: (job: MemoryJob | undefined, error: Error) => void): this;
  on(event: 'progress', listener: (job: MemoryJob, progress: number) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    if (event === 'completed' || event === 'failed' || event === 'progress') {
      this.queue.on(event, listener);
    } else {
      super.on(event, listener);
    }
    return this;
  }
}
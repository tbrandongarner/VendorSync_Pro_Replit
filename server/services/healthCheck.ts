import { storage } from '../storage';
import { syncQueue, fileImportQueue, pricingQueue } from './jobQueue';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  services: {
    database: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
    redis: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
    queues: {
      status: 'up' | 'down';
      stats?: {
        sync: { waiting: number; active: number; failed: number };
        fileImport: { waiting: number; active: number; failed: number };
        pricing: { waiting: number; active: number; failed: number };
      };
      error?: string;
    };
  };
}

export class HealthCheckService {
  async checkHealth(): Promise<HealthCheckResult> {
    const timestamp = new Date().toISOString();
    const version = process.env.npm_package_version || '1.0.0';

    const result: HealthCheckResult = {
      status: 'healthy',
      timestamp,
      version,
      services: {
        database: { status: 'up' },
        redis: { status: 'up' },
        queues: { status: 'up' },
      },
    };

    // Check database connectivity
    const dbStart = Date.now();
    try {
      await storage.getDashboardStats('health-check');
      result.services.database.responseTime = Date.now() - dbStart;
    } catch (error) {
      result.services.database.status = 'down';
      result.services.database.error = error instanceof Error ? error.message : 'Unknown database error';
      result.status = 'unhealthy';
    }

    // Check Redis and queue connectivity
    const redisStart = Date.now();
    try {
      const [syncStats, fileImportStats, pricingStats] = await Promise.all([
        this.getQueueStats('sync-operations'),
        this.getQueueStats('file-import'),
        this.getQueueStats('pricing-updates'),
      ]);

      result.services.redis.responseTime = Date.now() - redisStart;
      result.services.queues.stats = {
        sync: syncStats,
        fileImport: fileImportStats,
        pricing: pricingStats,
      };

      // Check if there are too many failed jobs (degraded state)
      const totalFailed = syncStats.failed + fileImportStats.failed + pricingStats.failed;
      if (totalFailed > 10 && result.status === 'healthy') {
        result.status = 'degraded';
      }
    } catch (error) {
      result.services.redis.status = 'down';
      result.services.redis.error = error instanceof Error ? error.message : 'Unknown Redis error';
      result.services.queues.status = 'down';
      result.services.queues.error = error instanceof Error ? error.message : 'Unknown queue error';
      result.status = 'unhealthy';
    }

    return result;
  }

  async checkReadiness(): Promise<{ ready: boolean; timestamp: string }> {
    const timestamp = new Date().toISOString();

    try {
      // Check if core services are responsive
      await Promise.all([
        storage.getDashboardStats('readiness-check'),
        this.getQueueStats('sync-operations'),
      ]);

      return { ready: true, timestamp };
    } catch (error) {
      return { ready: false, timestamp };
    }
  }

  private async getQueueStats(queueName: string) {
    let queue;
    
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

    const [waiting, active, failed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getFailed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      failed: failed.length,
    };
  }
}

export const healthCheckService = new HealthCheckService();
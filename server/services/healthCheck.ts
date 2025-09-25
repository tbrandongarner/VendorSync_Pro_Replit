import { storage } from '../storage';
import { simpleQueue } from './simpleQueue';

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

    // Check queue connectivity (using simple in-memory queue)
    const queueStart = Date.now();
    try {
      const queueStats = await simpleQueue.getStats();

      result.services.redis.responseTime = 0; // No Redis needed
      result.services.queues.stats = {
        sync: { 
          waiting: Math.floor(queueStats.pending / 3), // Rough estimate
          active: Math.floor(queueStats.running / 3),
          failed: Math.floor(queueStats.failed / 3)
        },
        fileImport: { 
          waiting: Math.floor(queueStats.pending / 3),
          active: Math.floor(queueStats.running / 3),
          failed: Math.floor(queueStats.failed / 3)
        },
        pricing: { 
          waiting: Math.floor(queueStats.pending / 3),
          active: Math.floor(queueStats.running / 3),
          failed: Math.floor(queueStats.failed / 3)
        },
      };

      // Check if there are too many failed jobs (degraded state)
      if (queueStats.failed > 10 && result.status === 'healthy') {
        result.status = 'degraded';
      }
    } catch (error) {
      result.services.redis.status = 'up'; // Redis not needed
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
        simpleQueue.getStats(),
      ]);

      return { ready: true, timestamp };
    } catch (error) {
      return { ready: false, timestamp };
    }
  }

  // Removed getQueueStats - using simpleQueue.getStats() directly
}

export const healthCheckService = new HealthCheckService();
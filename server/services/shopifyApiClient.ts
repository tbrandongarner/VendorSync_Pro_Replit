import { Store } from '@shared/schema';

// Shopify API rate limiting configuration
interface RateLimitConfig {
  maxBucketSize: number; // Maximum tokens in bucket (40 for REST API)
  refillRate: number; // Tokens per second (2 per second for REST API)
  leakyBucketSize: number; // Shopify's leaky bucket size (40)
  retryDelayBase: number; // Base delay for exponential backoff (ms)
  maxRetries: number; // Maximum retry attempts
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  requestQueue: QueuedRequest[];
  isProcessing: boolean;
}

interface QueuedRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  requestFn: () => Promise<Response>;
  retryCount: number;
  priority: 'high' | 'normal' | 'low';
  timestamp: number;
}

interface ShopifyApiMetrics {
  totalRequests: number;
  successfulRequests: number;
  rateLimitedRequests: number;
  avgResponseTime: number;
  currentBucketLevel: number;
  queueDepth: number;
}

/**
 * Centralized Shopify API client with adaptive rate limiting
 * Implements token bucket algorithm that respects Shopify's leaky bucket headers
 */
export class ShopifyApiClient {
  private store: Store;
  private baseUrl: string;
  private accessToken: string;
  private apiVersion: string = '2024-01';
  
  // Rate limiting state
  private config: RateLimitConfig;
  private bucket: TokenBucket;
  private storeId: string;
  
  // Metrics and monitoring
  private metrics: ShopifyApiMetrics;
  private lastHealthCheck: number = 0;
  
  // Static store for per-store rate limiters
  private static rateLimiters = new Map<string, ShopifyApiClient>();

  constructor(store: Store, config?: Partial<RateLimitConfig>) {
    this.store = store;
    // Handle case where store.id might be undefined (for validation)
    this.storeId = store.id ? store.id.toString() : `temp-${store.shopifyStoreUrl || 'unknown'}`;
    
    // Validate store credentials
    if (!store.shopifyAccessToken) {
      throw new Error('Shopify access token is required');
    }
    if (!store.shopifyStoreUrl) {
      throw new Error('Shopify store URL is required');
    }
    
    // Normalize the store URL
    const normalizedUrl = store.shopifyStoreUrl.replace(/^https?:\/\//, '');
    this.baseUrl = `https://${normalizedUrl}/admin/api/${this.apiVersion}`;
    this.accessToken = store.shopifyAccessToken;
    
    // Configure rate limiting based on Shopify's REST API limits
    this.config = {
      maxBucketSize: 40, // Shopify REST API bucket size
      refillRate: 2, // 2 calls per second
      leakyBucketSize: 40,
      retryDelayBase: 1000, // 1 second base delay
      maxRetries: 3,
      ...config,
    };
    
    // Initialize token bucket
    this.bucket = {
      tokens: this.config.maxBucketSize,
      lastRefill: Date.now(),
      requestQueue: [],
      isProcessing: false,
    };
    
    // Initialize metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      rateLimitedRequests: 0,
      avgResponseTime: 0,
      currentBucketLevel: this.config.maxBucketSize,
      queueDepth: 0,
    };
    
    // Register this client for the store
    ShopifyApiClient.rateLimiters.set(this.storeId, this);
    
    console.log(`Initialized Shopify API client for store ${store.name || 'validation-temp'} with rate limit: ${this.config.maxBucketSize} calls, ${this.config.refillRate}/sec refill`);
  }

  /**
   * Get or create a rate-limited API client for a store
   */
  static getClient(store: Store): ShopifyApiClient {
    // Handle case where store.id might be undefined (for validation)
    const storeId = store.id ? store.id.toString() : `temp-${store.shopifyStoreUrl || 'unknown'}`;
    let client = ShopifyApiClient.rateLimiters.get(storeId);
    
    if (!client) {
      client = new ShopifyApiClient(store);
    }
    
    return client;
  }

  /**
   * Make a rate-limited API request to Shopify
   */
  async request<T>(
    endpoint: string,
    options: RequestInit = {},
    priority: 'high' | 'normal' | 'low' = 'normal',
    includeHeaders: boolean = false
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestFn = async () => {
        const url = `${this.baseUrl}${endpoint}`;
        const startTime = Date.now();
        
        try {
          const response = await fetch(url, {
            ...options,
            headers: {
              'X-Shopify-Access-Token': this.accessToken,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              ...options.headers,
            },
          });

          const responseTime = Date.now() - startTime;
          this.updateMetrics(responseTime, response.ok);
          
          // Process Shopify rate limit headers
          this.processRateLimitHeaders(response.headers);
          
          if (!response.ok) {
            const errorText = await response.text();
            
            // Handle rate limiting specifically
            if (response.status === 429) {
              this.metrics.rateLimitedRequests++;
              console.warn(`Rate limited on ${endpoint}, will retry. Queue depth: ${this.bucket.requestQueue.length}`);
              throw new Error(`RATE_LIMITED: ${response.status} - ${errorText}`);
            }
            
            throw new Error(`Shopify API error: ${response.status} ${response.statusText} - ${errorText}`);
          }

          const data = await response.json();
          
          if (includeHeaders) {
            return {
              data,
              headers: response.headers,
            } as any;
          }
          
          return data;
        } catch (error) {
          if (error instanceof Error && error.message.includes('RATE_LIMITED')) {
            throw error; // Re-throw rate limit errors for retry logic
          }
          throw new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      };

      const queuedRequest: QueuedRequest = {
        resolve,
        reject,
        requestFn,
        retryCount: 0,
        priority,
        timestamp: Date.now(),
      };

      this.enqueueRequest(queuedRequest);
    });
  }

  /**
   * Process Shopify's rate limit headers to update bucket state
   */
  private processRateLimitHeaders(headers: Headers): void {
    const bucketSize = headers.get('X-Shopify-Shop-Api-Call-Limit');
    
    if (bucketSize) {
      // Format: "32/40" meaning 32 calls used out of 40
      const [used, max] = bucketSize.split('/').map(Number);
      
      if (!isNaN(used) && !isNaN(max)) {
        // Update our bucket to match Shopify's state
        this.bucket.tokens = Math.max(0, max - used);
        this.metrics.currentBucketLevel = this.bucket.tokens;
        
        console.log(`Updated bucket from Shopify headers: ${this.bucket.tokens}/${max} tokens available`);
      }
    }
  }

  /**
   * Add request to the queue and process if possible
   */
  private enqueueRequest(request: QueuedRequest): void {
    // Insert by priority (high -> normal -> low) and then by timestamp
    const insertIndex = this.bucket.requestQueue.findIndex(req => {
      if (request.priority === 'high' && req.priority !== 'high') return true;
      if (request.priority === 'normal' && req.priority === 'low') return true;
      if (request.priority === req.priority) return request.timestamp < req.timestamp;
      return false;
    });

    if (insertIndex === -1) {
      this.bucket.requestQueue.push(request);
    } else {
      this.bucket.requestQueue.splice(insertIndex, 0, request);
    }

    this.metrics.queueDepth = this.bucket.requestQueue.length;
    this.processQueue();
  }

  /**
   * Process the request queue with rate limiting
   */
  private async processQueue(): Promise<void> {
    if (this.bucket.isProcessing || this.bucket.requestQueue.length === 0) {
      return;
    }

    this.bucket.isProcessing = true;

    while (this.bucket.requestQueue.length > 0) {
      this.refillBucket();

      if (this.bucket.tokens < 1) {
        // Wait for token refill
        const waitTime = (1 / this.config.refillRate) * 1000;
        console.log(`Rate limit reached, waiting ${waitTime}ms for token refill`);
        await this.sleep(waitTime);
        continue;
      }

      const request = this.bucket.requestQueue.shift()!;
      this.metrics.queueDepth = this.bucket.requestQueue.length;
      this.bucket.tokens--;
      this.metrics.currentBucketLevel = this.bucket.tokens;

      try {
        const result = await request.requestFn();
        request.resolve(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Handle retries for rate limiting
        if (errorMessage.includes('RATE_LIMITED') && request.retryCount < this.config.maxRetries) {
          request.retryCount++;
          const delay = this.config.retryDelayBase * Math.pow(2, request.retryCount - 1);
          
          console.log(`Retrying request ${request.retryCount}/${this.config.maxRetries} after ${delay}ms`);
          
          // Re-add to queue after delay
          setTimeout(() => {
            this.enqueueRequest(request);
          }, delay);
        } else {
          request.reject(error instanceof Error ? error : new Error(errorMessage));
        }
      }

      // Small delay between requests to avoid overwhelming
      await this.sleep(50);
    }

    this.bucket.isProcessing = false;
  }

  /**
   * Refill the token bucket based on elapsed time
   */
  private refillBucket(): void {
    const now = Date.now();
    const elapsed = (now - this.bucket.lastRefill) / 1000; // Convert to seconds
    const tokensToAdd = elapsed * this.config.refillRate;
    
    if (tokensToAdd >= 1) {
      this.bucket.tokens = Math.min(
        this.config.maxBucketSize,
        this.bucket.tokens + Math.floor(tokensToAdd)
      );
      this.bucket.lastRefill = now;
      this.metrics.currentBucketLevel = this.bucket.tokens;
    }
  }

  /**
   * Update request metrics
   */
  private updateMetrics(responseTime: number, success: boolean): void {
    this.metrics.totalRequests++;
    
    if (success) {
      this.metrics.successfulRequests++;
    }
    
    // Update average response time using exponential smoothing
    if (this.metrics.avgResponseTime === 0) {
      this.metrics.avgResponseTime = responseTime;
    } else {
      this.metrics.avgResponseTime = (this.metrics.avgResponseTime * 0.9) + (responseTime * 0.1);
    }
  }

  /**
   * Get current API client metrics
   */
  getMetrics(): ShopifyApiMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if the API client is healthy
   */
  isHealthy(): boolean {
    const now = Date.now();
    
    // Update health check timestamp
    this.lastHealthCheck = now;
    
    // Consider healthy if:
    // - Queue depth is manageable (< 50 requests)
    // - Success rate is good (> 90%)
    // - Average response time is reasonable (< 5 seconds)
    const queueHealthy = this.metrics.queueDepth < 50;
    const successRateHealthy = this.metrics.totalRequests === 0 || 
      (this.metrics.successfulRequests / this.metrics.totalRequests) > 0.9;
    const responseTimeHealthy = this.metrics.avgResponseTime < 5000;
    
    return queueHealthy && successRateHealthy && responseTimeHealthy;
  }

  /**
   * Clear the request queue (emergency use only)
   */
  clearQueue(): number {
    const queuedCount = this.bucket.requestQueue.length;
    
    // Reject all queued requests
    this.bucket.requestQueue.forEach(request => {
      request.reject(new Error('Request queue cleared'));
    });
    
    this.bucket.requestQueue = [];
    this.metrics.queueDepth = 0;
    
    console.log(`Cleared ${queuedCount} queued requests for store ${this.store.name}`);
    return queuedCount;
  }

  /**
   * Close the API client and clean up resources
   */
  close(): void {
    this.clearQueue();
    ShopifyApiClient.rateLimiters.delete(this.storeId);
    console.log(`Closed Shopify API client for store ${this.store.name}`);
  }

  /**
   * Get statistics for all active API clients
   */
  static getGlobalStats(): Record<string, ShopifyApiMetrics> {
    const stats: Record<string, ShopifyApiMetrics> = {};
    
    Array.from(ShopifyApiClient.rateLimiters.entries()).forEach(([storeId, client]) => {
      stats[storeId] = client.getMetrics();
    });
    
    return stats;
  }

  /**
   * Utility function for sleeping/delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export interface for type checking
export interface ShopifyApiClientInterface {
  request<T>(endpoint: string, options?: RequestInit, priority?: 'high' | 'normal' | 'low'): Promise<T>;
  getMetrics(): ShopifyApiMetrics;
  isHealthy(): boolean;
  clearQueue(): number;
  close(): void;
}
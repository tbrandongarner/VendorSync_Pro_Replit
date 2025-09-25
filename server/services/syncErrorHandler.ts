import { IStorage } from '../storage';

export interface SyncError {
  type: 'network' | 'rate_limit' | 'validation' | 'auth' | 'server' | 'unknown';
  code?: string;
  message: string;
  retryable: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  originalError?: any;
}

/**
 * Custom error class that preserves SyncError classification information
 */
export class RetryExhaustedError extends Error {
  public readonly syncError: SyncError;
  public readonly operationName: string;
  public readonly attempts: number;

  constructor(syncError: SyncError, operationName: string, attempts: number) {
    super(`Operation ${operationName} failed after ${attempts} attempts: ${syncError.message}`);
    this.name = 'RetryExhaustedError';
    this.syncError = syncError;
    this.operationName = operationName;
    this.attempts = attempts;
    
    // Maintain proper error stack
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RetryExhaustedError);
    }
  }
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterEnabled: boolean;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  monitoringWindowMs: number;
}

export interface RetryContext {
  attempt: number;
  totalAttempts: number;
  lastError: SyncError;
  backoffDelayMs: number;
  operation: string;
  metadata?: Record<string, any>;
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  nextAttemptTime?: Date;
}

/**
 * Enterprise-grade error handling and retry service for sync operations
 */
export class SyncErrorHandler {
  private retryConfig: RetryConfig;
  private circuitBreakerConfig: CircuitBreakerConfig;
  private circuitBreakerStates: Map<string, CircuitBreakerState>;
  private storage: IStorage;

  constructor(
    storage: IStorage,
    retryConfig?: Partial<RetryConfig>,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ) {
    this.storage = storage;
    this.circuitBreakerStates = new Map();
    
    this.retryConfig = {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitterEnabled: true,
      ...retryConfig
    };

    this.circuitBreakerConfig = {
      failureThreshold: 10,
      resetTimeoutMs: 60000,
      monitoringWindowMs: 300000,
      ...circuitBreakerConfig
    };
  }

  /**
   * Classifies and enriches error information for intelligent handling
   */
  classifyError(error: any): SyncError {
    let syncError: SyncError = {
      type: 'unknown',
      message: error?.message || 'Unknown error occurred',
      retryable: false,
      severity: 'medium',
      originalError: error
    };

    // Network and connectivity errors
    if (this.isNetworkError(error)) {
      syncError = {
        ...syncError,
        type: 'network',
        retryable: true,
        severity: 'medium'
      };
    }
    // Rate limiting errors
    else if (this.isRateLimitError(error)) {
      syncError = {
        ...syncError,
        type: 'rate_limit',
        retryable: true,
        severity: 'low',
        code: '429'
      };
    }
    // Authentication errors
    else if (this.isAuthError(error)) {
      syncError = {
        ...syncError,
        type: 'auth',
        retryable: false,
        severity: 'high',
        code: '401'
      };
    }
    // Validation errors
    else if (this.isValidationError(error)) {
      syncError = {
        ...syncError,
        type: 'validation',
        retryable: false,
        severity: 'medium',
        code: '400'
      };
    }
    // Server errors
    else if (this.isServerError(error)) {
      syncError = {
        ...syncError,
        type: 'server',
        retryable: true,
        severity: 'high',
        code: error.status?.toString() || '500'
      };
    }

    return syncError;
  }

  /**
   * Executes operation with retry logic and circuit breaker protection
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    metadata?: Record<string, any>
  ): Promise<T> {
    const circuitKey = operationName;
    
    // Check circuit breaker before attempting operation
    if (this.isCircuitOpen(circuitKey)) {
      throw new Error(`Circuit breaker is open for operation: ${operationName}`);
    }

    let lastError: SyncError | null = null;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        // Record success for circuit breaker
        this.recordSuccess(circuitKey);
        
        return result;
        
      } catch (error) {
        lastError = this.classifyError(error);
        
        // Record failure for circuit breaker
        this.recordFailure(circuitKey);
        
        console.warn(`Attempt ${attempt}/${this.retryConfig.maxAttempts} failed for ${operationName}:`, {
          error: lastError,
          metadata
        });

        // Don't retry if error is not retryable or we've hit max attempts
        if (!lastError.retryable || attempt === this.retryConfig.maxAttempts) {
          break;
        }

        // Calculate backoff delay for next attempt
        const delayMs = this.calculateBackoffDelay(attempt);
        
        console.log(`Retrying ${operationName} in ${delayMs}ms (attempt ${attempt + 1}/${this.retryConfig.maxAttempts})`);
        
        // Wait before next attempt
        await this.sleep(delayMs);
      }
    }

    // All attempts failed - throw RetryExhaustedError to preserve classification
    if (!lastError) {
      throw new Error(`Operation ${operationName} failed after ${this.retryConfig.maxAttempts} attempts with no error details`);
    }
    
    throw new RetryExhaustedError(lastError, operationName, this.retryConfig.maxAttempts);
  }

  /**
   * Calculates exponential backoff delay with jitter
   */
  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = this.retryConfig.baseDelayMs * 
      Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
    
    const cappedDelay = Math.min(exponentialDelay, this.retryConfig.maxDelayMs);
    
    if (this.retryConfig.jitterEnabled) {
      // Add up to 25% jitter to prevent thundering herd
      const jitter = cappedDelay * 0.25 * Math.random();
      return Math.floor(cappedDelay + jitter);
    }
    
    return cappedDelay;
  }

  /**
   * Checks if circuit breaker is open for given operation
   */
  private isCircuitOpen(operationKey: string): boolean {
    const state = this.getCircuitBreakerState(operationKey);
    
    if (state.state === 'closed') {
      return false;
    }
    
    if (state.state === 'open') {
      // Check if enough time has passed to try half-open
      if (state.nextAttemptTime && new Date() >= state.nextAttemptTime) {
        state.state = 'half-open';
        return false;
      }
      return true;
    }
    
    // half-open state allows one attempt
    return false;
  }

  /**
   * Records successful operation for circuit breaker
   */
  private recordSuccess(operationKey: string): void {
    const state = this.getCircuitBreakerState(operationKey);
    state.failures = 0;
    state.lastSuccessTime = new Date();
    state.state = 'closed';
    state.nextAttemptTime = undefined;
  }

  /**
   * Records failed operation for circuit breaker
   */
  private recordFailure(operationKey: string): void {
    const state = this.getCircuitBreakerState(operationKey);
    state.failures++;
    state.lastFailureTime = new Date();

    if (state.state === 'half-open') {
      // Failed during half-open, go back to open
      state.state = 'open';
      state.nextAttemptTime = new Date(Date.now() + this.circuitBreakerConfig.resetTimeoutMs);
    } else if (state.failures >= this.circuitBreakerConfig.failureThreshold) {
      // Exceeded failure threshold, open circuit
      state.state = 'open';
      state.nextAttemptTime = new Date(Date.now() + this.circuitBreakerConfig.resetTimeoutMs);
    }
  }

  /**
   * Gets or creates circuit breaker state for operation
   */
  private getCircuitBreakerState(operationKey: string): CircuitBreakerState {
    if (!this.circuitBreakerStates.has(operationKey)) {
      this.circuitBreakerStates.set(operationKey, {
        state: 'closed',
        failures: 0
      });
    }
    return this.circuitBreakerStates.get(operationKey)!;
  }

  /**
   * Error classification helper methods
   */
  private isNetworkError(error: any): boolean {
    const networkCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT'];
    return networkCodes.includes(error?.code) || 
           error?.message?.includes('network') ||
           error?.message?.includes('connection');
  }

  private isRateLimitError(error: any): boolean {
    return error?.status === 429 || 
           error?.message?.includes('rate limit') ||
           error?.message?.includes('throttled');
  }

  private isAuthError(error: any): boolean {
    return error?.status === 401 || 
           error?.status === 403 ||
           error?.message?.includes('unauthorized') ||
           error?.message?.includes('authentication');
  }

  private isValidationError(error: any): boolean {
    return error?.status === 400 || 
           error?.status === 422 ||
           error?.message?.includes('validation') ||
           error?.message?.includes('invalid');
  }

  private isServerError(error: any): boolean {
    return (error?.status >= 500 && error?.status < 600) ||
           error?.message?.includes('internal server error');
  }

  /**
   * Utility sleep function for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets circuit breaker metrics for monitoring
   */
  getCircuitBreakerMetrics(): Record<string, CircuitBreakerState> {
    const metrics: Record<string, CircuitBreakerState> = {};
    Array.from(this.circuitBreakerStates.entries()).forEach(([key, state]) => {
      metrics[key] = { ...state };
    });
    return metrics;
  }

  /**
   * Resets circuit breaker for specific operation (for manual intervention)
   */
  resetCircuitBreaker(operationKey: string): void {
    this.circuitBreakerStates.set(operationKey, {
      state: 'closed',
      failures: 0
    });
  }

  /**
   * Gets retry configuration
   */
  getRetryConfig(): RetryConfig {
    return { ...this.retryConfig };
  }

  /**
   * Updates retry configuration
   */
  updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }
}
import { storage } from '../storage';
import type { Product, InsertPricingBatch, InsertPricingChange, PricingBatch, PricingChange } from '@shared/schema';

export interface PricingUpdateOptions {
  vendorId?: number;
  priceChangeType: 'percentage' | 'fixed' | 'margin_based';
  priceChangeValue: number;
  compareAtPriceChange?: number;
  includeCompareAtPrice: boolean;
  reason: string;
  preview: boolean;
  batchSize?: number;
}

export interface PricingPreview {
  batchId?: number;
  changes: Array<{
    productId: number;
    productName: string;
    sku: string;
    oldPrice: string;
    newPrice: string;
    oldCompareAtPrice: string | null;
    newCompareAtPrice: string | null;
    priceChangePercent: number;
    priceChangeDollar: number;
  }>;
  summary: {
    totalProducts: number;
    averagePriceIncrease: number;
    totalValueChange: number;
    maxPriceIncrease: number;
    minPriceIncrease: number;
  };
}

export class PricingService {
  /**
   * Calculate pricing changes for products and create a preview
   */
  async calculatePricingChanges(
    userId: string,
    options: PricingUpdateOptions
  ): Promise<PricingPreview> {
    console.log('Calculating pricing changes with options:', options);

    // Get products to update
    let products: Product[] = [];
    if (options.vendorId) {
      products = await storage.getProductsByVendor(options.vendorId);
    } else {
      products = await storage.getProducts();
    }

    console.log(`Found ${products.length} products to analyze`);

    // Limit to batch size for preview if specified
    if (options.batchSize && options.batchSize > 0) {
      products = products.slice(0, options.batchSize);
      console.log(`Limited to ${products.length} products for preview`);
    }

    const changes = [];
    let totalPriceChange = 0;
    const priceIncreases: number[] = [];

    for (const product of products) {
      const oldPrice = parseFloat(product.price || '0');
      const oldCompareAtPrice = product.compareAtPrice ? parseFloat(product.compareAtPrice) : null;

      let newPrice = oldPrice;
      let newCompareAtPrice = oldCompareAtPrice;

      // Calculate new price based on change type
      switch (options.priceChangeType) {
        case 'percentage':
          newPrice = oldPrice * (1 + options.priceChangeValue / 100);
          break;
        case 'fixed':
          newPrice = oldPrice + options.priceChangeValue;
          break;
        case 'margin_based':
          // Assuming cost is stored in a cost field (we might need to add this)
          // For now, use a simple percentage calculation
          newPrice = oldPrice * (1 + options.priceChangeValue / 100);
          break;
      }

      // Update compare at price if needed
      if (options.includeCompareAtPrice && options.compareAtPriceChange) {
        if (oldCompareAtPrice) {
          newCompareAtPrice = oldCompareAtPrice * (1 + options.compareAtPriceChange / 100);
        } else {
          // Set compare at price as percentage above new price
          newCompareAtPrice = newPrice * (1 + Math.abs(options.compareAtPriceChange) / 100);
        }
      }

      const priceChangePercent = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;
      const priceChangeDollar = newPrice - oldPrice;

      changes.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        oldPrice: oldPrice.toFixed(2),
        newPrice: newPrice.toFixed(2),
        oldCompareAtPrice: oldCompareAtPrice?.toFixed(2) || null,
        newCompareAtPrice: newCompareAtPrice?.toFixed(2) || null,
        priceChangePercent: parseFloat(priceChangePercent.toFixed(2)),
        priceChangeDollar: parseFloat(priceChangeDollar.toFixed(2)),
      });

      totalPriceChange += priceChangeDollar;
      priceIncreases.push(priceChangePercent);
    }

    const summary = {
      totalProducts: changes.length,
      averagePriceIncrease: priceIncreases.length > 0 ? 
        parseFloat((priceIncreases.reduce((a, b) => a + b, 0) / priceIncreases.length).toFixed(2)) : 0,
      totalValueChange: parseFloat(totalPriceChange.toFixed(2)),
      maxPriceIncrease: priceIncreases.length > 0 ? parseFloat(Math.max(...priceIncreases).toFixed(2)) : 0,
      minPriceIncrease: priceIncreases.length > 0 ? parseFloat(Math.min(...priceIncreases).toFixed(2)) : 0,
    };

    console.log('Pricing calculation summary:', summary);

    return {
      changes,
      summary,
    };
  }

  /**
   * Create a pricing batch with changes for preview or application
   */
  async createPricingBatch(
    userId: string,
    options: PricingUpdateOptions,
    batchName: string,
    description?: string
  ): Promise<{ batch: PricingBatch; preview: PricingPreview }> {
    console.log('Creating pricing batch:', batchName);

    // Calculate the pricing changes
    const preview = await this.calculatePricingChanges(userId, options);

    // Create the pricing batch
    const batchData: InsertPricingBatch = {
      userId,
      vendorId: options.vendorId || null,
      name: batchName,
      description: description || `${options.priceChangeType} price change of ${options.priceChangeValue}${options.priceChangeType === 'percentage' ? '%' : '$'}`,
      status: options.preview ? 'preview' : 'preview', // Always start as preview
      totalProducts: preview.changes.length,
    };

    const batch = await storage.createPricingBatch(batchData);

    // Create pricing changes
    const changeData: InsertPricingChange[] = preview.changes.map(change => ({
      batchId: batch.id,
      productId: change.productId,
      oldPrice: change.oldPrice,
      newPrice: change.newPrice,
      oldCompareAtPrice: change.oldCompareAtPrice,
      newCompareAtPrice: change.newCompareAtPrice,
      priceChangePercent: change.priceChangePercent.toString(),
      reason: options.reason,
      status: 'pending',
    }));

    await storage.createPricingChanges(changeData);

    console.log(`Created pricing batch ${batch.id} with ${changeData.length} changes`);

    return {
      batch,
      preview: {
        ...preview,
        batchId: batch.id,
      },
    };
  }

  /**
   * Apply a pricing batch to update product prices
   */
  async applyPricingBatch(batchId: number): Promise<void> {
    console.log(`Applying pricing batch ${batchId}`);

    // Verify batch exists and is in preview status
    const batch = await storage.getPricingBatch(batchId);
    if (!batch) {
      throw new Error('Pricing batch not found');
    }

    if (batch.status !== 'preview') {
      throw new Error(`Cannot apply batch with status: ${batch.status}`);
    }

    // Apply the changes
    await storage.applyPricingChanges(batchId);

    console.log(`Successfully applied pricing batch ${batchId}`);
  }

  /**
   * Revert a pricing batch to restore original prices
   */
  async revertPricingBatch(batchId: number): Promise<void> {
    console.log(`Reverting pricing batch ${batchId}`);

    // Verify batch exists and is applied
    const batch = await storage.getPricingBatch(batchId);
    if (!batch) {
      throw new Error('Pricing batch not found');
    }

    if (batch.status !== 'applied') {
      throw new Error(`Cannot revert batch with status: ${batch.status}`);
    }

    // Revert the changes
    await storage.revertPricingChanges(batchId);

    console.log(`Successfully reverted pricing batch ${batchId}`);
  }

  /**
   * Get detailed pricing batch information with changes
   */
  async getPricingBatchDetails(batchId: number): Promise<{
    batch: PricingBatch;
    changes: PricingChange[];
  }> {
    const batch = await storage.getPricingBatch(batchId);
    if (!batch) {
      throw new Error('Pricing batch not found');
    }

    const changes = await storage.getPricingChanges(batchId);

    return {
      batch,
      changes,
    };
  }

  /**
   * Get all pricing batches for a user
   */
  async getUserPricingBatches(userId: string, vendorId?: number): Promise<PricingBatch[]> {
    return await storage.getPricingBatches(userId, vendorId);
  }
}

export const pricingService = new PricingService();
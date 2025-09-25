import { ParsedProduct } from './file-parser.js';
import { IStorage } from '../storage.js';
import { Product } from '../../shared/schema.js';

export interface SKUMatchResult {
  sku: string;
  matchType: 'exact' | 'none';
  existingProduct?: Product;
  vendorData: ParsedProduct;
  recommendedAction: 'update' | 'create' | 'review';
  conflicts?: string[];
}

export interface ProductProcessingResult {
  matches: SKUMatchResult[];
  summary: {
    toUpdate: number;
    toCreate: number;
    needsReview: number;
    eolProducts: number;
  };
  eolProducts: EOLProduct[];
}

export interface EOLProduct {
  sku: string;
  productId: number;
  name: string;
  lastSeenInVendorSheet: Date;
  currentStatus: string;
  recommendedAction: 'discontinue' | 'archive' | 'review';
  daysWithoutUpdate: number;
}

export interface EOLPolicy {
  gracePeriodDays: number;
  autoActions: {
    discontinue: boolean;
    reduceInventory: boolean;
    markAsArchived: boolean;
    removeFromPlatform: boolean;
  };
  notificationSettings: {
    notifyOnDetection: boolean;
    requireApproval: boolean;
  };
}

export interface UpdateOperation {
  productId: number;
  updates: Partial<Product>;
  conflicts: string[];
  autoResolved: boolean;
}

export interface CreateOperation {
  vendorData: ParsedProduct;
  productData: Partial<Product>;
}

/**
 * Enhanced product processor for SKU-based matching and updates
 */
export class ProductProcessor {
  private storage: IStorage;
  private vendorId: number;
  private storeId: number;

  constructor(storage: IStorage, vendorId: number, storeId: number) {
    this.storage = storage;
    this.vendorId = vendorId;
    this.storeId = storeId;
  }

  /**
   * Process vendor products with intelligent SKU matching
   */
  async processVendorProducts(
    products: ParsedProduct[], 
    eolPolicy?: EOLPolicy
  ): Promise<ProductProcessingResult> {
    console.log(`Processing ${products.length} products for vendor ${this.vendorId}`);

    // Get all existing products for this vendor
    const existingProducts = await this.storage.getProductsByVendor(this.vendorId);
    console.log(`Found ${existingProducts.length} existing products`);

    // Create SKU maps for efficient matching
    const existingSkuMap = new Map<string, Product>();
    existingProducts.forEach(product => {
      existingSkuMap.set(product.sku, product);
    });

    // Extract vendor SKUs for EOL detection
    const vendorSkus = new Set(products.map(p => p.sku).filter(Boolean));

    // Perform SKU matching
    const matches = await this.matchProductsBySku(products, existingSkuMap);

    // Detect end-of-life products
    const eolProducts = this.detectEndOfLifeProducts(
      existingProducts, 
      vendorSkus, 
      eolPolicy
    );

    // Calculate summary
    const summary = {
      toUpdate: matches.filter(m => m.recommendedAction === 'update').length,
      toCreate: matches.filter(m => m.recommendedAction === 'create').length,
      needsReview: matches.filter(m => m.recommendedAction === 'review').length,
      eolProducts: eolProducts.length
    };

    console.log('Processing summary:', summary);

    return {
      matches,
      summary,
      eolProducts
    };
  }

  /**
   * Match vendor products against existing products by SKU
   */
  private async matchProductsBySku(
    vendorProducts: ParsedProduct[], 
    existingSkuMap: Map<string, Product>
  ): Promise<SKUMatchResult[]> {
    const matches: SKUMatchResult[] = [];

    for (const vendorData of vendorProducts) {
      if (!vendorData.sku || !vendorData.name) {
        console.warn(`Skipping product with missing SKU or name:`, vendorData);
        continue;
      }

      const existingProduct = existingSkuMap.get(vendorData.sku);

      if (existingProduct) {
        // Product exists - check for conflicts and determine update action
        const conflicts = this.detectUpdateConflicts(vendorData, existingProduct);
        
        matches.push({
          sku: vendorData.sku,
          matchType: 'exact',
          existingProduct,
          vendorData,
          recommendedAction: conflicts.length > 0 ? 'review' : 'update',
          conflicts: conflicts.length > 0 ? conflicts : undefined
        });
      } else {
        // New product - recommend creation
        matches.push({
          sku: vendorData.sku,
          matchType: 'none',
          vendorData,
          recommendedAction: 'create'
        });
      }
    }

    return matches;
  }

  /**
   * Detect conflicts between vendor data and existing product
   */
  private detectUpdateConflicts(vendorData: ParsedProduct, existingProduct: Product): string[] {
    const conflicts: string[] = [];

    // Price change threshold (10% change triggers review)
    if (vendorData.price && existingProduct.price) {
      const priceChange = Math.abs(
        (vendorData.price - parseFloat(existingProduct.price)) / parseFloat(existingProduct.price)
      );
      if (priceChange > 0.1) {
        conflicts.push(`Significant price change: ${existingProduct.price} → ${vendorData.price}`);
      }
    }

    // Large inventory changes (more than 50% difference)
    if (vendorData.inventory !== undefined && existingProduct.inventory) {
      const inventoryChange = Math.abs(
        (vendorData.inventory - existingProduct.inventory) / existingProduct.inventory
      );
      if (inventoryChange > 0.5) {
        conflicts.push(`Large inventory change: ${existingProduct.inventory} → ${vendorData.inventory}`);
      }
    }

    // Name changes (could indicate different product)
    if (vendorData.name && existingProduct.name !== vendorData.name) {
      conflicts.push(`Product name changed: "${existingProduct.name}" → "${vendorData.name}"`);
    }

    return conflicts;
  }

  /**
   * Detect products that are missing from vendor sheet (end-of-life)
   */
  private detectEndOfLifeProducts(
    existingProducts: Product[], 
    vendorSkus: Set<string>,
    eolPolicy?: EOLPolicy
  ): EOLProduct[] {
    const defaultPolicy: EOLPolicy = {
      gracePeriodDays: 30,
      autoActions: {
        discontinue: false,
        reduceInventory: false,
        markAsArchived: false,
        removeFromPlatform: false
      },
      notificationSettings: {
        notifyOnDetection: true,
        requireApproval: true
      }
    };

    const policy = { ...defaultPolicy, ...eolPolicy };
    const eolProducts: EOLProduct[] = [];
    const now = new Date();

    for (const product of existingProducts) {
      // Skip if product is in vendor sheet
      if (vendorSkus.has(product.sku)) {
        continue;
      }

      // Skip if already archived
      if (product.status === 'archived') {
        continue;
      }

      // Calculate days since last update
      const lastUpdate = product.updatedAt || product.createdAt;
      const daysWithoutUpdate = Math.floor(
        (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24)
      );

      let recommendedAction: 'discontinue' | 'archive' | 'review' = 'review';

      if (daysWithoutUpdate > policy.gracePeriodDays) {
        if (policy.autoActions.markAsArchived) {
          recommendedAction = 'archive';
        } else if (policy.autoActions.discontinue) {
          recommendedAction = 'discontinue';
        }
      }

      eolProducts.push({
        sku: product.sku,
        productId: product.id,
        name: product.name,
        lastSeenInVendorSheet: now,
        currentStatus: product.status || 'active',
        recommendedAction,
        daysWithoutUpdate
      });
    }

    return eolProducts;
  }

  /**
   * Execute product updates for matched products
   */
  async executeUpdates(matches: SKUMatchResult[]): Promise<UpdateOperation[]> {
    const updateOperations: UpdateOperation[] = [];

    for (const match of matches) {
      if (match.recommendedAction !== 'update' || !match.existingProduct) {
        continue;
      }

      const updates = this.prepareProductUpdates(match.vendorData, match.existingProduct);
      
      try {
        await this.storage.updateProduct(match.existingProduct.id, {
          ...updates,
          needsSync: true,
          lastModifiedBy: 'vendor_import',
          updatedAt: new Date()
        });

        updateOperations.push({
          productId: match.existingProduct.id,
          updates,
          conflicts: match.conflicts || [],
          autoResolved: true
        });

        console.log(`Updated product ${match.sku}: ${match.existingProduct.name}`);
      } catch (error) {
        console.error(`Failed to update product ${match.sku}:`, error);
        updateOperations.push({
          productId: match.existingProduct.id,
          updates,
          conflicts: [`Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
          autoResolved: false
        });
      }
    }

    return updateOperations;
  }

  /**
   * Execute product creation for new products
   */
  async executeCreations(matches: SKUMatchResult[]): Promise<CreateOperation[]> {
    const createOperations: CreateOperation[] = [];

    for (const match of matches) {
      if (match.recommendedAction !== 'create') {
        continue;
      }

      const productData = this.prepareNewProduct(match.vendorData);
      
      try {
        await this.storage.createProduct({
          ...productData,
          vendorId: this.vendorId,
          storeId: this.storeId,
          needsSync: true,
          lastModifiedBy: 'vendor_import',
          createdAt: new Date(),
          updatedAt: new Date()
        });

        createOperations.push({
          vendorData: match.vendorData,
          productData
        });

        console.log(`Created new product ${match.sku}: ${match.vendorData.name}`);
      } catch (error) {
        console.error(`Failed to create product ${match.sku}:`, error);
      }
    }

    return createOperations;
  }

  /**
   * Prepare update data from vendor data
   */
  private prepareProductUpdates(vendorData: ParsedProduct, existingProduct: Product): Partial<Product> {
    const updates: Partial<Product> = {};

    // Update core product fields
    if (vendorData.name && vendorData.name !== existingProduct.name) {
      updates.name = vendorData.name;
    }

    if (vendorData.description && vendorData.description !== existingProduct.description) {
      updates.description = vendorData.description;
    }

    // Update pricing fields
    if (vendorData.price !== undefined) {
      updates.price = vendorData.price.toString();
    }

    if (vendorData.compareAtPrice !== undefined) {
      updates.compareAtPrice = vendorData.compareAtPrice.toString();
    }

    if (vendorData.costPrice !== undefined) {
      updates.costPrice = vendorData.costPrice.toString();
    }

    if (vendorData.msrp !== undefined) {
      updates.msrp = vendorData.msrp.toString();
    }

    // Update inventory
    if (vendorData.inventory !== undefined) {
      updates.inventory = vendorData.inventory;
    }

    // Update other fields
    if (vendorData.category && vendorData.category !== existingProduct.category) {
      updates.category = vendorData.category;
    }

    if (vendorData.barcode && vendorData.barcode !== existingProduct.barcode) {
      updates.barcode = vendorData.barcode;
    }

    return updates;
  }

  /**
   * Prepare new product data from vendor data
   */
  private prepareNewProduct(vendorData: ParsedProduct): Partial<Product> {
    return {
      sku: vendorData.sku,
      name: vendorData.name,
      description: vendorData.description,
      price: vendorData.price?.toString() || '0',
      compareAtPrice: vendorData.compareAtPrice?.toString(),
      costPrice: vendorData.costPrice?.toString(),
      msrp: vendorData.msrp?.toString(),
      inventory: vendorData.inventory || 0,
      category: vendorData.category,
      barcode: vendorData.barcode,
      status: 'active'
    };
  }

  /**
   * Execute end-of-life actions for products
   */
  async executeEOLActions(eolProducts: EOLProduct[], policy: EOLPolicy): Promise<void> {
    for (const eolProduct of eolProducts) {
      const updates: Partial<Product> = {};

      switch (eolProduct.recommendedAction) {
        case 'archive':
          updates.status = 'archived';
          updates.needsSync = true;
          break;
        case 'discontinue':
          updates.status = 'draft';
          updates.inventory = 0;
          updates.needsSync = true;
          break;
        default:
          continue; // Skip review items
      }

      try {
        await this.storage.updateProduct(eolProduct.productId, {
          ...updates,
          lastModifiedBy: 'eol_processor',
          updatedAt: new Date()
        });

        console.log(`EOL action ${eolProduct.recommendedAction} applied to ${eolProduct.sku}`);
      } catch (error) {
        console.error(`Failed to apply EOL action to ${eolProduct.sku}:`, error);
      }
    }
  }
}
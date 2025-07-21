// Conflict Resolution Service for VendorSync Pro
// Handles data precedence when changes exist on multiple sides

export interface ConflictResolutionRules {
  precedence: 'vendor' | 'local' | 'shopify' | 'ask_user';
  mandatoryFields: string[];
  vendorOnlyFields: string[];
  shopifyOnlyFields: string[];
}

export interface ProductConflict {
  productId: number;
  sku: string;
  conflictingFields: ConflictField[];
  recommendedAction: 'accept_vendor' | 'keep_local' | 'merge' | 'ask_user';
}

export interface ConflictField {
  field: string;
  vendorValue: any;
  localValue: any;
  shopifyValue: any;
  lastModified: {
    vendor?: Date;
    local?: Date;
    shopify?: Date;
  };
}

export class ConflictResolver {
  private rules: ConflictResolutionRules = {
    precedence: 'vendor', // Default: vendor pricing takes precedence
    mandatoryFields: ['sku', 'price', 'cost', 'msrp'],
    vendorOnlyFields: ['price', 'cost', 'msrp', 'inventory'], // Vendor is authoritative
    shopifyOnlyFields: ['shopifyProductId', 'status'], // Shopify is authoritative
  };

  constructor(customRules?: Partial<ConflictResolutionRules>) {
    if (customRules) {
      this.rules = { ...this.rules, ...customRules };
    }
  }

  /**
   * Analyze conflicts between vendor import, local changes, and Shopify data
   */
  analyzeConflicts(
    vendorData: any,
    localProduct: any,
    shopifyData?: any
  ): ProductConflict | null {
    const conflictingFields: ConflictField[] = [];
    const allFields = new Set([
      ...Object.keys(vendorData || {}),
      ...Object.keys(localProduct || {}),
      ...Object.keys(shopifyData || {}),
    ]);

    for (const field of allFields) {
      if (field === 'id' || field === 'createdAt') continue;

      const vendorValue = vendorData?.[field];
      const localValue = localProduct?.[field];
      const shopifyValue = shopifyData?.[field];

      // Check for conflicts
      const hasVendorChange = vendorValue !== undefined && vendorValue !== localValue;
      const hasLocalChange = localProduct?.localChanges?.includes(field);
      const hasShopifyChange = shopifyValue !== undefined && shopifyValue !== localValue;

      if ((hasVendorChange && hasLocalChange) || 
          (hasVendorChange && hasShopifyChange) || 
          (hasLocalChange && hasShopifyChange)) {
        conflictingFields.push({
          field,
          vendorValue,
          localValue,
          shopifyValue,
          lastModified: {
            vendor: vendorData?.lastVendorUpdate,
            local: localProduct?.updatedAt,
            shopify: shopifyData?.updatedAt,
          },
        });
      }
    }

    if (conflictingFields.length === 0) {
      return null;
    }

    return {
      productId: localProduct?.id,
      sku: localProduct?.sku || vendorData?.sku,
      conflictingFields,
      recommendedAction: this.getRecommendedAction(conflictingFields),
    };
  }

  /**
   * Resolve conflicts automatically based on rules
   */
  resolveConflicts(
    vendorData: any,
    localProduct: any,
    shopifyData?: any
  ): {
    resolvedData: any;
    conflicts: ProductConflict[];
    autoResolved: boolean;
  } {
    const conflict = this.analyzeConflicts(vendorData, localProduct, shopifyData);
    
    if (!conflict) {
      // No conflicts - merge all data with vendor precedence for mandatory fields
      return {
        resolvedData: this.mergeWithoutConflicts(vendorData, localProduct, shopifyData),
        conflicts: [],
        autoResolved: true,
      };
    }

    // Apply resolution rules
    const resolvedData = { ...localProduct };
    const unresolvedConflicts: ProductConflict[] = [];

    for (const conflictField of conflict.conflictingFields) {
      const resolution = this.resolveField(conflictField);
      
      if (resolution.autoResolve) {
        resolvedData[conflictField.field] = resolution.value;
        // Track the source of resolution
        resolvedData.lastModifiedBy = resolution.source;
      } else {
        unresolvedConflicts.push(conflict);
        resolvedData.conflictState = 'pending_resolution';
      }
    }

    return {
      resolvedData,
      conflicts: unresolvedConflicts,
      autoResolved: unresolvedConflicts.length === 0,
    };
  }

  private resolveField(conflictField: ConflictField): {
    autoResolve: boolean;
    value: any;
    source: string;
  } {
    const { field, vendorValue, localValue, shopifyValue, lastModified } = conflictField;

    // Rule 1: Vendor pricing fields always take precedence
    if (this.rules.vendorOnlyFields.includes(field) && vendorValue !== undefined) {
      return {
        autoResolve: true,
        value: vendorValue,
        source: 'vendor_import',
      };
    }

    // Rule 2: Shopify-only fields maintain Shopify values
    if (this.rules.shopifyOnlyFields.includes(field) && shopifyValue !== undefined) {
      return {
        autoResolve: true,
        value: shopifyValue,
        source: 'shopify_sync',
      };
    }

    // Rule 3: Mandatory fields use vendor data
    if (this.rules.mandatoryFields.includes(field) && vendorValue !== undefined) {
      return {
        autoResolve: true,
        value: vendorValue,
        source: 'vendor_import',
      };
    }

    // Rule 4: Use most recent timestamp
    const timestamps = {
      vendor: lastModified.vendor?.getTime() || 0,
      local: lastModified.local?.getTime() || 0,
      shopify: lastModified.shopify?.getTime() || 0,
    };

    const mostRecent = Object.entries(timestamps).reduce((a, b) => 
      timestamps[a[0]] > timestamps[b[0]] ? a : b
    );

    switch (mostRecent[0]) {
      case 'vendor':
        return { autoResolve: true, value: vendorValue, source: 'vendor_import' };
      case 'local':
        return { autoResolve: true, value: localValue, source: 'user' };
      case 'shopify':
        return { autoResolve: true, value: shopifyValue, source: 'shopify_sync' };
      default:
        // Cannot auto-resolve - requires user intervention
        return { autoResolve: false, value: localValue, source: 'user' };
    }
  }

  private mergeWithoutConflicts(vendorData: any, localProduct: any, shopifyData?: any): any {
    const merged = { ...localProduct };

    // Apply vendor data with precedence rules
    if (vendorData) {
      for (const [key, value] of Object.entries(vendorData)) {
        if (value !== undefined) {
          if (this.rules.mandatoryFields.includes(key) || 
              this.rules.vendorOnlyFields.includes(key)) {
            merged[key] = value;
          } else if (!merged[key]) {
            merged[key] = value;
          }
        }
      }
      merged.vendorData = vendorData;
      merged.lastVendorUpdate = new Date();
    }

    // Apply Shopify data for Shopify-only fields
    if (shopifyData) {
      for (const field of this.rules.shopifyOnlyFields) {
        if (shopifyData[field] !== undefined) {
          merged[field] = shopifyData[field];
        }
      }
      merged.shopifyData = shopifyData;
    }

    merged.conflictState = 'none';
    merged.needsSync = true;
    merged.lastModifiedBy = 'vendor_import';

    return merged;
  }

  private getRecommendedAction(conflictingFields: ConflictField[]): 'accept_vendor' | 'keep_local' | 'merge' | 'ask_user' {
    const hasVendorPricing = conflictingFields.some(f => 
      this.rules.vendorOnlyFields.includes(f.field)
    );

    const hasCriticalChanges = conflictingFields.some(f => 
      this.rules.mandatoryFields.includes(f.field)
    );

    if (hasVendorPricing && hasCriticalChanges) {
      return 'accept_vendor'; // Vendor pricing is authoritative
    }

    if (conflictingFields.length <= 2) {
      return 'merge'; // Simple conflicts can be auto-merged
    }

    return 'ask_user'; // Complex conflicts need user decision
  }
}

export const conflictResolver = new ConflictResolver();
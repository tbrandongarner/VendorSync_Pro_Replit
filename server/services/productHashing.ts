import { createHash } from 'crypto';

/**
 * Product signature hashing utilities for idempotent sync operations
 * Provides consistent hash computation for detecting product changes
 */

export interface ShopifyProduct {
  id?: number;
  title?: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  handle?: string;
  status?: string;
  tags?: string;
  options?: Array<{
    id?: number;
    name?: string;
    position?: number;
    values?: string[];
  }>;
  variants?: ShopifyVariant[];
  images?: ShopifyImage[];
  created_at?: string;
  updated_at?: string;
  published_at?: string;
  template_suffix?: string;
  published_scope?: string;
}

export interface ShopifyVariant {
  id?: number;
  product_id?: number;
  title?: string;
  price?: string;
  sku?: string;
  position?: number;
  inventory_policy?: string;
  compare_at_price?: string;
  fulfillment_service?: string;
  inventory_management?: string;
  option1?: string;
  option2?: string;
  option3?: string;
  created_at?: string;
  updated_at?: string;
  taxable?: boolean;
  barcode?: string;
  grams?: number;
  image_id?: number;
  inventory_quantity?: number;
  weight?: number;
  weight_unit?: string;
  inventory_item_id?: number;
  old_inventory_quantity?: number;
  requires_shipping?: boolean;
}

export interface ShopifyImage {
  id?: number;
  product_id?: number;
  position?: number;
  created_at?: string;
  updated_at?: string;
  alt?: string;
  width?: number;
  height?: number;
  src?: string;
  variant_ids?: number[];
}

/**
 * Normalizes a value for consistent hashing by handling nulls, trimming strings,
 * and ensuring consistent ordering for arrays and objects
 */
function normalizeValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  
  if (Array.isArray(value)) {
    // Sort arrays to ensure consistent ordering
    return value
      .map(normalizeValue)
      .sort()
      .join('|');
  }
  
  if (typeof value === 'object') {
    // Sort object keys for consistent ordering
    const keys = Object.keys(value).sort();
    return keys
      .map(key => `${key}:${normalizeValue(value[key])}`)
      .join('|');
  }
  
  return String(value);
}

/**
 * Creates a SHA-256 hash from normalized input data
 */
function createHashFromData(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Computes content hash for core product information
 * Includes: title, body_html, vendor, product_type, handle, status, tags, options
 */
export function computeContentHash(product: ShopifyProduct): string {
  const contentFields = {
    title: product.title,
    body_html: product.body_html,
    vendor: product.vendor,
    product_type: product.product_type,
    handle: product.handle,
    status: product.status,
    tags: product.tags,
    template_suffix: product.template_suffix,
    published_scope: product.published_scope,
    // Include options but not their IDs (focus on structure)
    options: product.options?.map(opt => ({
      name: opt.name,
      position: opt.position,
      values: opt.values
    }))
  };
  
  const normalizedData = normalizeValue(contentFields);
  return createHashFromData(normalizedData);
}

/**
 * Computes variants hash for all product variants
 * Includes pricing, inventory, SKUs, and variant options
 */
export function computeVariantsHash(variants: ShopifyVariant[] = []): string {
  // Sort variants by position to ensure consistent ordering
  const sortedVariants = [...variants].sort((a, b) => {
    if (a.position && b.position) {
      return a.position - b.position;
    }
    return (a.sku || '').localeCompare(b.sku || '');
  });
  
  const variantData = sortedVariants.map(variant => ({
    title: variant.title,
    price: variant.price,
    sku: variant.sku,
    position: variant.position,
    inventory_policy: variant.inventory_policy,
    compare_at_price: variant.compare_at_price,
    fulfillment_service: variant.fulfillment_service,
    inventory_management: variant.inventory_management,
    option1: variant.option1,
    option2: variant.option2,
    option3: variant.option3,
    taxable: variant.taxable,
    barcode: variant.barcode,
    grams: variant.grams,
    inventory_quantity: variant.inventory_quantity,
    weight: variant.weight,
    weight_unit: variant.weight_unit,
    requires_shipping: variant.requires_shipping
  }));
  
  const normalizedData = normalizeValue(variantData);
  return createHashFromData(normalizedData);
}

/**
 * Computes images hash for product images
 * Includes: src URLs, alt text, positions, and variant associations
 */
export function computeImagesHash(images: ShopifyImage[] = []): string {
  // Sort images by position to ensure consistent ordering
  const sortedImages = [...images].sort((a, b) => {
    if (a.position && b.position) {
      return a.position - b.position;
    }
    return (a.src || '').localeCompare(b.src || '');
  });
  
  const imageData = sortedImages.map(image => ({
    position: image.position,
    alt: image.alt,
    width: image.width,
    height: image.height,
    src: image.src,
    // Sort variant_ids for consistent ordering
    variant_ids: image.variant_ids ? [...image.variant_ids].sort() : []
  }));
  
  const normalizedData = normalizeValue(imageData);
  return createHashFromData(normalizedData);
}

/**
 * Computes all signature hashes for a product
 * Returns an object with contentHash, variantsHash, and imagesHash
 */
export function computeProductSignatures(product: ShopifyProduct): {
  contentHash: string;
  variantsHash: string;
  imagesHash: string;
} {
  return {
    contentHash: computeContentHash(product),
    variantsHash: computeVariantsHash(product.variants),
    imagesHash: computeImagesHash(product.images)
  };
}

/**
 * Checks if a product has changed by comparing current hashes with stored hashes
 */
export function hasProductChanged(
  currentProduct: ShopifyProduct,
  storedSignatures: {
    contentHash?: string;
    variantsHash?: string;
    imagesHash?: string;
  }
): {
  hasChanged: boolean;
  changedComponents: string[];
  currentSignatures: {
    contentHash: string;
    variantsHash: string;
    imagesHash: string;
  };
} {
  const currentSignatures = computeProductSignatures(currentProduct);
  const changedComponents: string[] = [];
  
  if (currentSignatures.contentHash !== storedSignatures.contentHash) {
    changedComponents.push('content');
  }
  
  if (currentSignatures.variantsHash !== storedSignatures.variantsHash) {
    changedComponents.push('variants');
  }
  
  if (currentSignatures.imagesHash !== storedSignatures.imagesHash) {
    changedComponents.push('images');
  }
  
  return {
    hasChanged: changedComponents.length > 0,
    changedComponents,
    currentSignatures
  };
}

/**
 * Utility to create a combined hash from all product components
 * Useful for quick comparison or cache keys
 */
export function computeCombinedHash(product: ShopifyProduct): string {
  const signatures = computeProductSignatures(product);
  const combinedData = `${signatures.contentHash}|${signatures.variantsHash}|${signatures.imagesHash}`;
  return createHashFromData(combinedData);
}
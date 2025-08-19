import { Store, Product } from "@shared/schema";

export interface ShopifyProduct {
  id: string;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  created_at: string;
  handle: string;
  updated_at: string;
  published_at: string;
  template_suffix: string;
  tags: string;
  status: string;
  published_scope: string;
  admin_graphql_api_id: string;
  variants: ShopifyVariant[];
  options: ShopifyOption[];
  images: ShopifyImage[];
}

export interface ShopifyVariant {
  id: string;
  product_id: string;
  title: string;
  price: string;
  sku: string;
  position: number;
  inventory_policy: string;
  compare_at_price: string;
  fulfillment_service: string;
  inventory_management: string;
  option1: string;
  option2: string;
  option3: string;
  created_at: string;
  updated_at: string;
  taxable: boolean;
  barcode: string;
  grams: number;
  image_id: string;
  weight: number;
  weight_unit: string;
  inventory_item_id: string;
  inventory_quantity: number;
  old_inventory_quantity: number;
  requires_shipping: boolean;
  admin_graphql_api_id: string;
}

export interface ShopifyInventoryItem {
  id: string;
  sku: string;
  created_at: string;
  updated_at: string;
  requires_shipping: boolean;
  cost: string; // Cost per item
  country_code_of_origin: string;
  province_code_of_origin: string;
  harmonized_system_code: string;
  tracked: boolean;
  country_harmonized_system_codes: any[];
}

export interface ShopifyOption {
  id: string;
  product_id: string;
  name: string;
  position: number;
  values: string[];
}

export interface ShopifyImage {
  id: string;
  product_id: string;
  position: number;
  created_at: string;
  updated_at: string;
  alt: string;
  width: number;
  height: number;
  src: string;
  variant_ids: string[];
  admin_graphql_api_id: string;
}

export interface ShopifyInventoryLevel {
  inventory_item_id: string;
  location_id: string;
  available: number;
  updated_at: string;
  admin_graphql_api_id: string;
}

export interface ShopifyProductCreate {
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  tags?: string;
  status?: 'active' | 'archived' | 'draft';
  published_scope?: 'web' | 'global';
  variants: {
    price: string;
    compare_at_price?: string;
    sku?: string;
    barcode?: string;
    inventory_quantity?: number;
    weight?: number;
    weight_unit?: string;
    requires_shipping?: boolean;
    taxable?: boolean;
    inventory_management?: 'shopify' | 'not_managed';
    inventory_policy?: 'deny' | 'continue';
    fulfillment_service?: 'manual' | 'third_party';
    option1?: string;
    option2?: string;
    option3?: string;
  }[];
  images?: {
    src: string;
    alt?: string;
    position?: number;
  }[];
  options?: {
    name: string;
    values: string[];
  }[];
}

export class ShopifyService {
  private baseUrl: string;
  private accessToken: string;
  private apiVersion: string = '2024-01';

  constructor(store: Store) {
    if (!store.shopifyAccessToken) {
      throw new Error('Shopify access token is required');
    }
    
    // Normalize the store URL - remove protocol if present, then add https://
    const normalizedUrl = store.shopifyStoreUrl.replace(/^https?:\/\//, '');
    this.baseUrl = `https://${normalizedUrl}/admin/api/${this.apiVersion}`;
    this.accessToken = store.shopifyAccessToken;
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  // Product operations
  async getProducts(
    limit: number = 50,
    pageInfo?: string
  ): Promise<{ products: ShopifyProduct[]; pageInfo?: string }> {
    let endpoint = `/products.json?limit=${limit}`;
    if (pageInfo) {
      endpoint += `&page_info=${pageInfo}`;
    }

    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    // Extract page info from Link header
    const linkHeader = response.headers.get('link');
    const nextPageInfo = this.extractPageInfoFromHeader(linkHeader);

    return {
      products: data.products,
      pageInfo: nextPageInfo,
    };
  }

  async getProduct(productId: string): Promise<ShopifyProduct> {
    const response = await this.makeRequest<{ product: ShopifyProduct }>(
      `/products/${productId}.json`
    );
    return response.product;
  }

  async createProduct(product: ShopifyProductCreate): Promise<ShopifyProduct> {
    const response = await this.makeRequest<{ product: ShopifyProduct }>(
      '/products.json',
      {
        method: 'POST',
        body: JSON.stringify({ product }),
      }
    );
    return response.product;
  }

  async updateProduct(
    productId: string,
    updates: Partial<ShopifyProductCreate>
  ): Promise<ShopifyProduct> {
    const response = await this.makeRequest<{ product: ShopifyProduct }>(
      `/products/${productId}.json`,
      {
        method: 'PUT',
        body: JSON.stringify({ product: updates }),
      }
    );
    return response.product;
  }

  async deleteProduct(productId: string): Promise<void> {
    await this.makeRequest(`/products/${productId}.json`, {
      method: 'DELETE',
    });
  }

  // Inventory operations
  async getInventoryLevels(
    inventoryItemIds: string[]
  ): Promise<ShopifyInventoryLevel[]> {
    const response = await this.makeRequest<{ inventory_levels: ShopifyInventoryLevel[] }>(
      `/inventory_levels.json?inventory_item_ids=${inventoryItemIds.join(',')}`
    );
    return response.inventory_levels;
  }

  async updateInventoryLevel(
    inventoryItemId: string,
    locationId: string,
    quantity: number
  ): Promise<ShopifyInventoryLevel> {
    const response = await this.makeRequest<{ inventory_level: ShopifyInventoryLevel }>(
      '/inventory_levels/adjust.json',
      {
        method: 'POST',
        body: JSON.stringify({
          location_id: locationId,
          inventory_item_id: inventoryItemId,
          available_adjustment: quantity,
        }),
      }
    );
    return response.inventory_level;
  }

  // Variant operations
  async updateVariant(
    variantId: string,
    updates: Partial<ShopifyVariant>
  ): Promise<ShopifyVariant> {
    const response = await this.makeRequest<{ variant: ShopifyVariant }>(
      `/variants/${variantId}.json`,
      {
        method: 'PUT',
        body: JSON.stringify({ variant: updates }),
      }
    );
    return response.variant;
  }

  // Image operations
  async addProductImage(
    productId: string,
    imageData: {
      src: string;
      alt?: string;
      position?: number;
    }
  ): Promise<ShopifyImage> {
    const response = await this.makeRequest<{ image: ShopifyImage }>(
      `/products/${productId}/images.json`,
      {
        method: 'POST',
        body: JSON.stringify({ image: imageData }),
      }
    );
    return response.image;
  }

  async updateProductImage(
    productId: string,
    imageId: string,
    updates: Partial<ShopifyImage>
  ): Promise<ShopifyImage> {
    const response = await this.makeRequest<{ image: ShopifyImage }>(
      `/products/${productId}/images/${imageId}.json`,
      {
        method: 'PUT',
        body: JSON.stringify({ image: updates }),
      }
    );
    return response.image;
  }

  async deleteProductImage(productId: string, imageId: string): Promise<void> {
    await this.makeRequest(`/products/${productId}/images/${imageId}.json`, {
      method: 'DELETE',
    });
  }

  // Sales channel operations
  async getProductPublications(productId: string): Promise<any[]> {
    const response = await this.makeRequest<{ product_publications: any[] }>(
      `/products/${productId}/product_publications.json`
    );
    return response.product_publications;
  }

  async publishProduct(
    productId: string,
    publicationIds: string[]
  ): Promise<void> {
    await this.makeRequest('/product_publications.json', {
      method: 'POST',
      body: JSON.stringify({
        product_publication: {
          product_id: productId,
          publication_ids: publicationIds,
        },
      }),
    });
  }

  async unpublishProduct(
    productId: string,
    publicationIds: string[]
  ): Promise<void> {
    for (const publicationId of publicationIds) {
      await this.makeRequest(
        `/products/${productId}/product_publications/${publicationId}.json`,
        {
          method: 'DELETE',
        }
      );
    }
  }

  // Locations (for inventory management)
  async getLocations(): Promise<any[]> {
    const response = await this.makeRequest<{ locations: any[] }>('/locations.json');
    return response.locations;
  }

  // Utility methods
  private extractPageInfoFromHeader(linkHeader: string | null): string | undefined {
    if (!linkHeader) return undefined;
    
    // Parse Link header to extract page_info for next page
    const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    return nextMatch ? nextMatch[1] : undefined;
  }

  // Convert internal product to Shopify format
  static convertToShopifyProduct(product: Product): ShopifyProductCreate {
    const variants = product.variants as any[] || [];
    const images = product.images as any[] || [];
    const tags = product.tags as string[] || [];

    return {
      title: product.name,
      body_html: product.description || '',
      vendor: product.category || '',
      product_type: product.category || '',
      tags: tags.join(', '),
      status: product.isActive ? 'active' : 'draft',
      published_scope: 'web',
      variants: variants.length > 0 ? variants.map(v => ({
        price: v.price || product.price?.toString() || '0',
        compare_at_price: v.compareAtPrice || product.compareAtPrice?.toString(),
        sku: v.sku || product.sku || '',
        barcode: v.barcode || product.barcode || '',
        inventory_quantity: v.inventory || product.inventory || 0,
        weight: v.weight || 0,
        weight_unit: v.weightUnit || 'kg',
        requires_shipping: v.requiresShipping !== false,
        taxable: v.taxable !== false,
        inventory_management: 'shopify',
        inventory_policy: 'deny',
        fulfillment_service: 'manual',
        option1: v.option1,
        option2: v.option2,
        option3: v.option3,
      })) : [{
        price: product.price?.toString() || '0',
        compare_at_price: product.compareAtPrice?.toString(),
        sku: product.sku || '',
        barcode: product.barcode || '',
        inventory_quantity: product.inventory || 0,
        weight: 0,
        weight_unit: 'kg',
        requires_shipping: true,
        taxable: true,
        inventory_management: 'shopify',
        inventory_policy: 'deny',
        fulfillment_service: 'manual',
      }],
      images: images.map(img => ({
        src: img.src || img.url,
        alt: img.alt || product.name,
        position: img.position || 1,
      })),
      options: variants.length > 0 ? this.extractOptions(variants) : [],
    };
  }

  // Convert Shopify product to internal format
  static convertFromShopifyProduct(
    shopifyProduct: ShopifyProduct,
    vendorId: number,
    storeId: number
  ): Partial<Product> {
    const primaryVariant = shopifyProduct.variants[0];
    const tags = shopifyProduct.tags ? shopifyProduct.tags.split(', ') : [];

    return {
      shopifyProductId: shopifyProduct.id,
      name: shopifyProduct.title,
      description: shopifyProduct.body_html,
      price: primaryVariant?.price ? parseFloat(primaryVariant.price) : 0,
      compareAtPrice: primaryVariant?.compare_at_price ? parseFloat(primaryVariant.compare_at_price) : null,
      sku: primaryVariant?.sku || '',
      barcode: primaryVariant?.barcode || '',
      inventory: primaryVariant?.inventory_quantity || 0,
      category: shopifyProduct.product_type || shopifyProduct.vendor,
      tags: tags,
      images: shopifyProduct.images.map(img => ({
        id: img.id,
        src: img.src,
        alt: img.alt,
        position: img.position,
        width: img.width,
        height: img.height,
      })),
      variants: shopifyProduct.variants.map(variant => ({
        id: variant.id,
        title: variant.title,
        price: variant.price,
        compareAtPrice: variant.compare_at_price,
        sku: variant.sku,
        barcode: variant.barcode,
        inventory: variant.inventory_quantity,
        weight: variant.weight,
        weightUnit: variant.weight_unit,
        option1: variant.option1,
        option2: variant.option2,
        option3: variant.option3,
      })),
      isActive: shopifyProduct.status === 'active',
      vendorId,
      storeId,
    };
  }

  private static extractOptions(variants: any[]): { name: string; values: string[] }[] {
    const options: { name: string; values: string[] }[] = [];
    
    if (variants.some(v => v.option1)) {
      const values = [...new Set(variants.map(v => v.option1).filter(Boolean))];
      options.push({ name: 'Option 1', values });
    }
    
    if (variants.some(v => v.option2)) {
      const values = [...new Set(variants.map(v => v.option2).filter(Boolean))];
      options.push({ name: 'Option 2', values });
    }
    
    if (variants.some(v => v.option3)) {
      const values = [...new Set(variants.map(v => v.option3).filter(Boolean))];
      options.push({ name: 'Option 3', values });
    }
    
    return options;
  }
}
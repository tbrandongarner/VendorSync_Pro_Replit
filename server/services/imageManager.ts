import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads/images';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// File filter for images only
const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

// Configure multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Maximum 10 files at once
  }
});

export interface ProductImage {
  id: string;
  url: string;
  alt?: string;
  isPrimary: boolean;
  source: 'upload' | 'shopify' | 'vendor';
  shopifyImageId?: string;
  position?: number;
}

export class ImageManager {
  // Convert Shopify image format to our format
  static normalizeShopifyImages(shopifyImages: any[]): ProductImage[] {
    return shopifyImages.map((img, index) => ({
      id: img.id?.toString() || randomUUID(),
      url: img.src || img.url,
      alt: img.alt || '',
      isPrimary: index === 0,
      source: 'shopify' as const,
      shopifyImageId: img.id?.toString(),
      position: img.position || index + 1
    }));
  }

  // Get all images for a product
  static async getProductImages(productId: number): Promise<ProductImage[]> {
    // This would integrate with your storage layer to get product images
    // For now, return empty array since we need to integrate with the database
    return [];
  }

  // Upload and save new images
  static async uploadProductImages(
    productId: number,
    files: Express.Multer.File[]
  ): Promise<ProductImage[]> {
    const uploadedImages: ProductImage[] = files.map((file, index) => ({
      id: randomUUID(),
      url: `/uploads/images/${file.filename}`,
      alt: file.originalname.replace(path.extname(file.originalname), ''),
      isPrimary: index === 0,
      source: 'upload' as const,
      position: index + 1
    }));

    // TODO: Save to database through storage layer
    // await storage.addProductImages(productId, uploadedImages);

    return uploadedImages;
  }

  // Set primary image for a product
  static async setPrimaryImage(productId: number, imageId: string): Promise<void> {
    // TODO: Update database to set new primary image
    // await storage.updateProductPrimaryImage(productId, imageId);
  }

  // Delete an image
  static async deleteImage(imageId: string): Promise<void> {
    // TODO: Remove from database and optionally delete file
    // const image = await storage.getProductImage(imageId);
    // if (image.source === 'upload') {
    //   // Delete physical file
    //   const filePath = path.join(process.cwd(), image.url);
    //   if (fs.existsSync(filePath)) {
    //     fs.unlinkSync(filePath);
    //   }
    // }
    // await storage.deleteProductImage(imageId);
  }

  // Sync images from Shopify
  static async syncFromShopify(productId: number, shopifyImages: any[]): Promise<ProductImage[]> {
    const normalizedImages = this.normalizeShopifyImages(shopifyImages);
    
    // TODO: Update database with Shopify images
    // await storage.updateProductImages(productId, normalizedImages);
    
    return normalizedImages;
  }

  // Get image URL - handle relative URLs for uploads
  static getImageUrl(image: ProductImage): string {
    if (image.source === 'upload' && !image.url.startsWith('http')) {
      return `http://localhost:3000${image.url}`;
    }
    return image.url;
  }
}
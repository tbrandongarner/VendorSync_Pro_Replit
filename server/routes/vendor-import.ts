import { Router } from 'express';
import { isAuthenticated } from '../replitAuth.js';
import { storage } from '../storage.js';
import { parseCSV, parseExcel } from '../services/file-parser.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Smart vendor import endpoint
router.post('/vendor/:vendorId/import', upload.single('file'), isAuthenticated, async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const vendorId = parseInt(req.params.vendorId);
    const importMode = req.body.importMode || 'both'; // new_only, update_existing, both
    
    const vendor = await storage.getVendor(vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Check user access
    const userId = req.user?.claims?.sub;
    if (!userId || vendor.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Parse file
    let parsedProducts;
    const fileExtension = req.file.originalname.split('.').pop()?.toLowerCase();
    
    let config = {};
    if (vendor.dataSourceConfig) {
      try {
        config = JSON.parse(vendor.dataSourceConfig as string);
      } catch (error) {
        console.warn('Failed to parse vendor data source config:', error);
      }
    }

    if (fileExtension === 'csv' || req.file.mimetype.includes('csv')) {
      parsedProducts = await parseCSV(req.file.buffer, config);
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls' || req.file.mimetype.includes('sheet')) {
      parsedProducts = await parseExcel(req.file.buffer, config);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    const validProducts = parsedProducts.filter(p => p.sku && p.name);
    
    // Get existing products for this vendor
    const existingProducts = await storage.getProducts();
    const vendorProducts = existingProducts.filter(p => p.vendorId === vendorId);
    const existingSkus = new Map(vendorProducts.map(p => [p.sku, p]));

    let newProducts = 0;
    let updatedProducts = 0;
    let needsSync = 0;
    let errors = 0;

    for (const productData of validProducts) {
      try {
        const existingProduct = existingSkus.get(productData.sku);
        
        if (existingProduct) {
          // Product exists - check if we should update it
          if (importMode === 'new_only') {
            continue; // Skip existing products
          }
          
          // Check for changes
          const hasChanges = 
            existingProduct.price !== productData.price?.toString() ||
            existingProduct.compareAtPrice !== productData.compareAtPrice?.toString() ||
            existingProduct.inventory !== productData.inventory ||
            existingProduct.description !== productData.description;
          
          if (hasChanges) {
            // Update existing product
            await storage.updateProduct(existingProduct.id, {
              price: productData.price?.toString() || existingProduct.price,
              compareAtPrice: productData.compareAtPrice?.toString() || existingProduct.compareAtPrice,
              inventory: productData.inventory || existingProduct.inventory,
              description: productData.description || existingProduct.description,
              needsSync: true,
              lastModifiedBy: 'vendor_import',
              localChanges: ['price', 'inventory', 'description'].filter(field => {
                switch (field) {
                  case 'price': return existingProduct.price !== productData.price?.toString();
                  case 'inventory': return existingProduct.inventory !== productData.inventory;
                  case 'description': return existingProduct.description !== productData.description;
                  default: return false;
                }
              })
            });
            
            updatedProducts++;
            needsSync++;
          }
        } else {
          // New product - check if we should add it
          if (importMode === 'update_existing') {
            continue; // Skip new products
          }
          
          // Add new product to uploaded_products table for review
          await storage.createUploadedProducts([{
            vendorId: vendorId,
            sku: productData.sku,
            name: productData.name,
            description: productData.description || '',
            price: productData.price?.toString() || '0',
            compareAtPrice: productData.compareAtPrice?.toString() || null,
            barcode: productData.barcode || null,
            inventory: productData.inventory || 0,
            category: productData.category || null,
            brand: vendor.name,
            status: 'pending',
            tags: productData.tags ? JSON.stringify(productData.tags) : null,
            images: productData.images ? JSON.stringify(productData.images) : null,
            variants: productData.variants ? JSON.stringify(productData.variants) : null,
            uploadBatch: `import-${vendorId}-${Date.now()}`,
          }]);
          
          newProducts++;
          needsSync++;
        }
      } catch (error) {
        console.error(`Error processing product ${productData.sku}:`, error);
        errors++;
      }
    }

    // Log activity
    await storage.createActivity({
      userId,
      type: 'vendor_import',
      description: `Imported vendor data: ${newProducts} new, ${updatedProducts} updated products`,
      metadata: JSON.stringify({ 
        vendorId, 
        vendorName: vendor.name, 
        importMode,
        newProducts, 
        updatedProducts, 
        needsSync,
        errors 
      })
    });

    res.json({
      success: true,
      newProducts,
      updatedProducts,
      needsSync,
      errors,
      totalProcessed: validProducts.length
    });

  } catch (error) {
    console.error('Vendor import error:', error);
    res.status(500).json({ 
      error: 'Failed to import vendor data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
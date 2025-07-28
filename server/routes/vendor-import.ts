import { Router } from 'express';
import { isAuthenticated } from '../replitAuth.js';
import { storage } from '../storage.js';
import { parseCSV, parseExcel, getExcelSheetNames } from '../services/file-parser.js';
import { conflictResolver } from '../services/conflict-resolver.js';
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
    const selectedSheets = req.body.selectedSheets ? JSON.parse(req.body.selectedSheets) : undefined;
    
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
      parsedProducts = await parseExcel(req.file.buffer, config, selectedSheets);
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
        
        // Normalize vendor data to match expected format
        const normalizedVendorData = {
          sku: productData.sku,
          name: productData.name,
          price: productData.price?.toString(),
          cost: productData.cost?.toString(),
          msrp: productData.msrp?.toString(),
          compareAtPrice: productData.compareAtPrice?.toString(),
          inventory: productData.inventory,
          description: productData.description,
          category: productData.category,
          tags: productData.tags,
          images: productData.images,
          lastVendorUpdate: new Date(),
        };
        
        if (existingProduct) {
          // Product exists - check if we should update it
          if (importMode === 'new_only') {
            continue; // Skip existing products
          }
          
          // Use conflict resolver to handle potential conflicts
          const resolution = conflictResolver.resolveConflicts(
            normalizedVendorData,
            existingProduct,
            null // shopifyData will be handled separately
          );
          
          if (resolution.autoResolved) {
            // Auto-resolve conflicts and update product
            await storage.updateProduct(existingProduct.id, {
              ...resolution.resolvedData,
              needsSync: true,
              lastModifiedBy: 'vendor_import',
              lastVendorUpdate: new Date(),
            });
            
            updatedProducts++;
            needsSync++;
          } else {
            // Conflicts require user intervention
            await storage.updateProduct(existingProduct.id, {
              ...existingProduct,
              lastVendorUpdate: new Date(),
              needsSync: false, // Don't sync until conflicts are resolved
            });
            
            updatedProducts++;
            // Note: These won't be synced until conflicts are resolved
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

// Get Excel sheet names endpoint
router.post('/excel/sheets', upload.single('file'), isAuthenticated, async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileExtension = req.file.originalname.split('.').pop()?.toLowerCase();
    
    if (fileExtension !== 'xlsx' && fileExtension !== 'xls' && !req.file.mimetype.includes('sheet')) {
      return res.status(400).json({ error: 'File must be an Excel file (.xlsx or .xls)' });
    }

    const sheetNames = getExcelSheetNames(req.file.buffer);
    
    res.json({
      success: true,
      sheetNames,
      totalSheets: sheetNames.length
    });

  } catch (error) {
    console.error('Excel sheet analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze Excel file',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
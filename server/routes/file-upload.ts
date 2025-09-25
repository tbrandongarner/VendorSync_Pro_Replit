import express from 'express';
import multer from 'multer';
import { parseCSV, parseExcel, ParsedProduct, DataSourceConfig, analyzeHeaders, extractHeaders } from '../services/file-parser';
import { storage } from '../storage';
import { ProductProcessor } from '../services/productProcessor';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  }
});

// Upload and parse vendor file
router.post('/vendor/:vendorId/upload', upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const vendorId = parseInt(req.params.vendorId);
    const vendor = await storage.getVendor(vendorId);
    
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Check if user owns this vendor (using Replit Auth format)
    const userId = req.user?.claims?.sub;
    if (!userId || vendor.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let config: DataSourceConfig = {};
    if (vendor.dataSourceConfig) {
      try {
        config = JSON.parse(vendor.dataSourceConfig as string);
      } catch (error) {
        console.warn('Failed to parse vendor data source config:', error);
      }
    }

    let parsedProducts: ParsedProduct[];
    const fileExtension = req.file.originalname.split('.').pop()?.toLowerCase();

    if (fileExtension === 'csv' || req.file.mimetype.includes('csv')) {
      parsedProducts = await parseCSV(req.file.buffer, config);
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls' || req.file.mimetype.includes('sheet')) {
      parsedProducts = await parseExcel(req.file.buffer, config);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Filter valid products and store in database
    const validProducts = parsedProducts.filter(p => p.sku && p.name);
    const invalidProducts = parsedProducts.filter(p => !p.sku || !p.name);
    const uploadBatch = `${vendorId}-${Date.now()}`;
    
    // Store uploaded products in database
    const uploadedProductsData = validProducts.map(product => ({
      vendorId: vendorId,
      sku: product.sku,
      name: product.name,
      description: product.description || '',
      price: product.price ? product.price.toString() : '0',
      compareAtPrice: product.compareAtPrice ? product.compareAtPrice.toString() : null,
      barcode: product.barcode || null,
      inventory: product.inventory || 0,
      category: product.category || null,
      brand: vendor.name,
      status: 'pending',
      tags: product.tags ? JSON.stringify(product.tags) : null,
      images: product.images ? JSON.stringify(product.images) : null,
      variants: product.variants ? JSON.stringify(product.variants) : null,
      uploadBatch: uploadBatch,
    }));

    // Clear previous uploaded products for this vendor
    await storage.deleteUploadedProducts(vendorId);
    
    // Insert new uploaded products
    if (uploadedProductsData.length > 0) {
      await storage.createUploadedProducts(uploadedProductsData);
    }

    res.json({
      success: true,
      totalProducts: parsedProducts.length,
      validProducts: validProducts.length,
      invalidProducts: invalidProducts.length,
      products: validProducts.slice(0, 50), // Return first 50 for preview
      errors: invalidProducts.length > 0 ? 
        [`${invalidProducts.length} products skipped due to missing SKU or name`] : []
    });

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ 
      error: 'Failed to process file',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Enhanced upload with intelligent SKU matching and conflict resolution
router.post('/vendor/:vendorId/upload-enhanced', upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const vendorId = parseInt(req.params.vendorId);
    const vendor = await storage.getVendor(vendorId);
    
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Check if user owns this vendor
    const userId = req.user?.claims?.sub;
    if (!userId || vendor.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get user's stores
    const stores = await storage.getStores(userId);
    if (stores.length === 0) {
      return res.status(400).json({ error: 'No Shopify stores connected' });
    }
    const store = stores[0]; // Use first store

    // Parse configuration from request body
    const { 
      config = {}, 
      importMode = 'both',
      conflictResolution = 'vendor_wins',
      eolPolicy = {}
    } = req.body;

    // Parse data source configuration
    let dataSourceConfig: DataSourceConfig = {};
    if (typeof config === 'string') {
      try {
        dataSourceConfig = JSON.parse(config);
      } catch (error) {
        console.warn('Failed to parse config:', error);
      }
    } else if (typeof config === 'object') {
      dataSourceConfig = config;
    }

    // If no config provided, try to use vendor's saved config
    if (Object.keys(dataSourceConfig).length === 0 && vendor.dataSourceConfig) {
      try {
        dataSourceConfig = JSON.parse(vendor.dataSourceConfig as string);
      } catch (error) {
        console.warn('Failed to parse vendor data source config:', error);
      }
    }

    const fileExtension = req.file.originalname.split('.').pop()?.toLowerCase();

    // Parse the file
    let parsedProducts: ParsedProduct[];
    if (fileExtension === 'csv' || req.file.mimetype.includes('csv')) {
      parsedProducts = await parseCSV(req.file.buffer, dataSourceConfig);
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls' || req.file.mimetype.includes('sheet')) {
      parsedProducts = await parseExcel(req.file.buffer, dataSourceConfig);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Filter valid products
    const validProducts = parsedProducts.filter(p => p.sku && p.name);
    const invalidProducts = parsedProducts.filter(p => !p.sku || !p.name);

    if (validProducts.length === 0) {
      return res.status(400).json({ 
        error: 'No valid products found', 
        details: 'All products are missing required fields (SKU or name)',
        invalidCount: invalidProducts.length
      });
    }

    // Use ProductProcessor for intelligent SKU matching
    const processor = new ProductProcessor(storage, vendorId, store.id);
    
    // Define EOL policy
    const eolPolicyConfig = {
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
      },
      ...eolPolicy
    };

    // Process vendor products with SKU matching
    const processingResult = await processor.processVendorProducts(validProducts, eolPolicyConfig);

    // Execute updates and creations based on import mode
    let updateOperations = [];
    let createOperations = [];

    if (importMode === 'update_existing' || importMode === 'both') {
      const updateMatches = processingResult.matches.filter(m => m.recommendedAction === 'update');
      updateOperations = await processor.executeUpdates(updateMatches);
    }

    if (importMode === 'new_only' || importMode === 'both') {
      const createMatches = processingResult.matches.filter(m => m.recommendedAction === 'create');
      createOperations = await processor.executeCreations(createMatches);
    }

    // Handle conflicts if any need manual review
    const conflictMatches = processingResult.matches.filter(m => m.recommendedAction === 'review');

    // Handle EOL products if policy allows
    if (eolPolicyConfig.autoActions.discontinue || eolPolicyConfig.autoActions.markAsArchived) {
      await processor.executeEOLActions(processingResult.eolProducts, eolPolicyConfig);
    }

    res.json({
      success: true,
      processing: {
        totalProducts: parsedProducts.length,
        validProducts: validProducts.length,
        invalidProducts: invalidProducts.length,
        summary: processingResult.summary
      },
      results: {
        updated: updateOperations.length,
        created: createOperations.length,
        conflicts: conflictMatches.length,
        eolDetected: processingResult.eolProducts.length
      },
      conflicts: conflictMatches.map(match => ({
        sku: match.sku,
        productName: match.vendorData.name,
        existingName: match.existingProduct?.name,
        issues: match.conflicts
      })),
      eolProducts: processingResult.eolProducts.map(eol => ({
        sku: eol.sku,
        name: eol.name,
        daysWithoutUpdate: eol.daysWithoutUpdate,
        recommendedAction: eol.recommendedAction
      })),
      preview: validProducts.slice(0, 10) // First 10 for preview
    });

  } catch (error) {
    console.error('Enhanced file upload error:', error);
    res.status(500).json({ 
      error: 'Failed to process file with enhanced features',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test Google Sheets connection
router.post('/test-google-sheets', async (req, res) => {
  try {
    const { url, config } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'Google Sheets URL is required' });
    }

    const { parseGoogleSheets } = await import('../services/file-parser');
    const products = await parseGoogleSheets(url, config || {});
    
    const validProducts = products.filter(p => p.sku && p.name);
    
    res.json({
      success: true,
      totalProducts: products.length,
      validProducts: validProducts.length,
      products: validProducts.slice(0, 20), // Return first 20 for preview
      sample: validProducts.slice(0, 5) // Show sample for column mapping
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch Google Sheets data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
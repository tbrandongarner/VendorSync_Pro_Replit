import express from 'express';
import multer from 'multer';
import { parseCSV, parseExcel, ParsedProduct, DataSourceConfig } from '../services/file-parser';
import { storage } from '../storage';

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
router.post('/vendor/:vendorId/upload', upload.single('file'), async (req, res) => {
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

    // Store parsed products temporarily (you might want to save these to database)
    // For now, we'll return them to the client
    const validProducts = parsedProducts.filter(p => p.sku && p.name);
    const invalidProducts = parsedProducts.filter(p => !p.sku || !p.name);

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
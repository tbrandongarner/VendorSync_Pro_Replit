import { Router } from 'express';
import multer from 'multer';
import { isAuthenticated } from '../replitAuth.js';
import { extractHeaders, analyzeHeaders } from '../services/file-parser.js';

const router = Router();

// Configure multer for header analysis
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

/**
 * Analyze headers from uploaded vendor sheet
 */
router.post('/analyze', upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileExtension = req.file.originalname.split('.').pop()?.toLowerCase();
    
    if (!fileExtension || !['csv', 'xlsx', 'xls'].includes(fileExtension)) {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Extract headers from the file
    const headers = await extractHeaders(req.file.buffer, fileExtension);
    
    if (headers.length === 0) {
      return res.status(400).json({ error: 'No headers found in file' });
    }

    // Analyze headers and suggest mappings
    const analysis = analyzeHeaders(headers);

    res.json({
      success: true,
      headers,
      analysis,
      fileName: req.file.originalname,
      fileSize: req.file.size
    });

  } catch (error) {
    console.error('Header analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze file headers',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get available preset configurations
 */
router.get('/presets', isAuthenticated, async (req: any, res) => {
  try {
    const presets = {
      shopify: {
        name: 'Shopify Export',
        description: 'Standard Shopify product export format',
        fields: {
          sku: 'Variant SKU',
          name: 'Title',
          description: 'Body (HTML)',
          price: 'Variant Price',
          compareAtPrice: 'Variant Compare At Price',
          costPrice: 'Cost per item',
          inventory: 'Variant Inventory Qty',
          category: 'Product Category',
          barcode: 'Variant Barcode'
        }
      },
      basic: {
        name: 'Basic CSV',
        description: 'Simple product data format',
        fields: {
          sku: 'SKU',
          name: 'Name',
          description: 'Description',
          price: 'Price',
          compareAtPrice: 'Compare Price',
          costPrice: 'Cost',
          msrp: 'MSRP',
          inventory: 'Quantity',
          category: 'Category'
        }
      },
      wholesale: {
        name: 'Wholesale Format',
        description: 'Common wholesale vendor format',
        fields: {
          sku: 'Item Number',
          name: 'Product Name',
          description: 'Description',
          price: 'Retail Price',
          costPrice: 'Wholesale Price',
          msrp: 'MSRP',
          inventory: 'Stock',
          category: 'Category'
        }
      }
    };

    res.json({ presets });
  } catch (error) {
    console.error('Error fetching presets:', error);
    res.status(500).json({ error: 'Failed to fetch presets' });
  }
});

export default router;
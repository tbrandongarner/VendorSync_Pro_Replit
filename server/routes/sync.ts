import { Router } from 'express';
import { isAuthenticated } from '../replitAuth.js';
import { storage } from '../storage.js';

const router = Router();

// Sync vendor products endpoint
router.post('/vendor/:vendorId', isAuthenticated, async (req: any, res) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    
    // Get vendor
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

    const store = stores[0]; // Use first store for now

    // For CSV uploads, check for uploaded products
    if (vendor.dataSourceType === 'csv_upload') {
      // Get uploaded products for this vendor
      const uploadedProducts = await storage.getUploadedProducts(vendorId);
      if (uploadedProducts.length === 0) {
        return res.status(400).json({ error: 'No uploaded products found. Please upload a CSV file first.' });
      }
      
      // Create sync job for uploaded products
      const job = await storage.createSyncJob({
        vendorId: vendorId,
        storeId: store.id,
        status: 'pending',
        totalItems: uploadedProducts.length,
        processedItems: 0,
        progress: 0,
        startedAt: new Date(),
      });

      // Start sync process in background
      setImmediate(async () => {
        try {
          // Import sync service dynamically
          const { ProductSyncService } = await import('../services/sync.js');
          const syncService = new ProductSyncService(store);
          
          // Update job status
          await storage.updateSyncJob(job.id, { 
            status: 'running',
            startedAt: new Date() 
          });

          // Process uploaded products
          let processed = 0;
          let created = 0;
          let updated = 0;
          let failed = 0;

          for (const uploadedProduct of uploadedProducts) {
            try {
              // Convert uploaded product to sync format
              const productData = {
                sku: uploadedProduct.sku,
                name: uploadedProduct.name,
                description: uploadedProduct.description,
                price: parseFloat(uploadedProduct.price || '0'),
                compareAtPrice: uploadedProduct.compareAtPrice ? parseFloat(uploadedProduct.compareAtPrice) : undefined,
                inventory: uploadedProduct.inventory || 0,
                barcode: uploadedProduct.barcode,
                tags: uploadedProduct.tags ? JSON.parse(uploadedProduct.tags) : [],
                images: uploadedProduct.images ? JSON.parse(uploadedProduct.images) : [],
              };

              // Sync to Shopify
              const result = await syncService.syncSingleProduct(productData, vendorId);
              
              if (result.success) {
                // Create or update product in main products table
                const existingProduct = await storage.getProductBySku(uploadedProduct.sku);
                
                if (existingProduct) {
                  // Update existing product
                  await storage.updateProduct(existingProduct.id, {
                    name: uploadedProduct.name,
                    description: uploadedProduct.description,
                    price: uploadedProduct.price,
                    compareAtPrice: uploadedProduct.compareAtPrice,
                    inventory: uploadedProduct.inventory || 0,
                    tags: uploadedProduct.tags ? JSON.parse(uploadedProduct.tags) : [],
                    images: uploadedProduct.images ? JSON.parse(uploadedProduct.images) : [],
                    shopifyProductId: result.productId?.toString(),
                    needsSync: false,
                    lastSyncAt: new Date(),
                    lastModifiedBy: 'vendor_import'
                  });
                  updated++;
                } else {
                  // Create new product
                  await storage.createProduct({
                    vendorId: vendorId,
                    storeId: store.id,
                    sku: uploadedProduct.sku,
                    name: uploadedProduct.name,
                    description: uploadedProduct.description,
                    price: uploadedProduct.price,
                    compareAtPrice: uploadedProduct.compareAtPrice,
                    inventory: uploadedProduct.inventory || 0,
                    tags: uploadedProduct.tags ? JSON.parse(uploadedProduct.tags) : [],
                    images: uploadedProduct.images ? JSON.parse(uploadedProduct.images) : [],
                    shopifyProductId: result.productId?.toString(),
                    status: 'active',
                    needsSync: false,
                    lastSyncAt: new Date(),
                    lastModifiedBy: 'vendor_import'
                  });
                  created++;
                }
                
                // Update uploaded product status
                await storage.updateUploadedProduct(uploadedProduct.id, {
                  status: 'synced'
                });
              } else {
                await storage.updateUploadedProduct(uploadedProduct.id, {
                  status: 'failed',
                  syncError: result.error
                });
                failed++;
              }

              processed++;
              
              // Update progress
              const progress = Math.round((processed / uploadedProducts.length) * 100);
              await storage.updateSyncJob(job.id, {
                processedItems: processed,
                progress: progress
              });

            } catch (error) {
              console.error(`Error syncing product ${uploadedProduct.sku}:`, error);
              await storage.updateUploadedProduct(uploadedProduct.id, {
                status: 'failed',
                syncError: error instanceof Error ? error.message : 'Unknown error'
              });
              failed++;
              processed++;
            }
          }

          // Complete sync job
          await storage.updateSyncJob(job.id, {
            status: 'completed',
            completedAt: new Date(),
            processedItems: processed,
            progress: 100
          });

          // Log activity
          await storage.createActivity({
            userId,
            type: 'vendor_sync',
            description: `Uploaded products sync completed: ${created} created, ${updated} updated, ${failed} failed`,
            metadata: JSON.stringify({ vendorId, storeId: store.id, created, updated, failed })
          });

        } catch (error) {
          console.error('Sync process failed:', error);
          await storage.updateSyncJob(job.id, {
            status: 'failed',
            completedAt: new Date(),
            errors: JSON.stringify([error instanceof Error ? error.message : 'Unknown error'])
          });

          await storage.createActivity({
            userId,
            type: 'vendor_sync',
            description: `Uploaded products sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            metadata: JSON.stringify({ vendorId, storeId: store.id, error: error instanceof Error ? error.message : 'Unknown error' })
          });
        }
      });
      
      res.json({ 
        success: true, 
        jobId: job.id,
        message: `Sync job started for ${uploadedProducts.length} uploaded products` 
      });
    } else {
      // Start sync job for API-based vendors
      return res.status(400).json({ error: 'API-based vendor sync not implemented yet' });
    }
  } catch (error) {
    console.error('Error starting vendor sync:', error);
    res.status(500).json({ error: 'Failed to start sync' });
  }
});

export default router;
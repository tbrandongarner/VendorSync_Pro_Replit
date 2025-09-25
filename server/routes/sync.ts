import { Router } from 'express';
import { isAuthenticated } from '../replitAuth.js';
import { storage } from '../storage.js';
import { JobQueueService } from '../services/jobQueue.js';

const jobQueueService = JobQueueService.getInstance();

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

      // Start sync process using job queue
      const queueJob = await jobQueueService.addFileImportJob({
        vendorId,
        storeId: store.id,
        userId,
        uploadedProductIds: uploadedProducts.map(p => p.id),
        importMode: 'csv_upload',
        syncJobId: job.id,
      });
      
      res.json({ 
        success: true, 
        jobId: job.id,
        queueJobId: queueJob.id,
        message: `Sync job started for ${uploadedProducts.length} uploaded products` 
      });
    } else {
      // For Shopify API or other vendor types, sync existing products
      console.log(`Starting Shopify sync for vendor ${vendor.name} (ID: ${vendorId})`);
      
      // Get existing products for this vendor
      const existingProducts = await storage.getProductsByVendor(vendorId);
      
      // Create sync job for existing products
      const job = await storage.createSyncJob({
        vendorId: vendorId,
        storeId: store.id,
        status: 'pending',
        totalItems: existingProducts.length,
        processedItems: 0,
        progress: 0,
        startedAt: new Date(),
      });

      // Start sync process using job queue
      const queueJob = await jobQueueService.addSyncJob({
        syncJobId: job.id,
        vendorId,
        storeId: store.id,
        userId,
        options: {
          direction: 'shopify_to_local',
          syncImages: true,
          syncInventory: true,
          syncPricing: true,
          syncTags: true,
          syncVariants: true,
          syncDescriptions: true,
          batchSize: 50,
        },
      });
      
      console.log(`Sync job ${job.id} created and started for vendor ${vendor.name}`);
      res.json({ 
        success: true, 
        jobId: job.id,
        queueJobId: queueJob.id,
        message: `Shopify sync job started for vendor ${vendor.name}` 
      });
    }
  } catch (error) {
    console.error('Error starting vendor sync:', error);
    res.status(500).json({ error: 'Failed to start sync' });
  }
});

export default router;
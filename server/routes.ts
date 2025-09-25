import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { generateProductContent, generateProductDescription, generateMarketingDescription } from "./services/openai";
import { initWebSocketService, getWebSocketService } from "./services/websocket";
import { upload, ImageManager } from "./services/imageManager";
import { BulkSyncService } from "./services/bulkSync";
import { jobQueueService } from "./services/simpleQueue";
import { healthCheckService } from "./services/healthCheck";
import { insertVendorSchema, insertStoreSchema, insertProductSchema, updateProductSchema } from "@shared/schema";
import fileUploadRoutes from "./routes/file-upload";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);
  
  // Initialize WebSocket service
  initWebSocketService(httpServer);

  // Auth middleware
  await setupAuth(app);

  // Configure multer for file uploads
  const uploadsDir = path.join(process.cwd(), 'uploads', 'logos');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `vendor-logo-${uniqueSuffix}${ext}`);
    }
  });

  const uploadLogo = multer({
    storage: logoStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
      const allowedTypes = /jpeg|jpg|png|gif|webp/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);
      
      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error('Only image files (jpeg, jpg, png, gif, webp) are allowed'));
      }
    }
  });

  // Serve uploaded logo files
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Logo upload endpoint
  app.post('/api/upload/logo', isAuthenticated, uploadLogo.single('logo'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      const logoUrl = `/uploads/logos/${req.file.filename}`;
      res.json({ logoUrl });
    } catch (error) {
      console.error('Logo upload error:', error);
      res.status(500).json({ message: 'Failed to upload logo' });
    }
  });

  // Health Check and Monitoring Routes (No authentication required)
  app.get('/health', async (req, res) => {
    try {
      const health = await healthCheckService.checkHealth();
      const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/health/ready', async (req, res) => {
    try {
      const readiness = await healthCheckService.checkReadiness();
      const statusCode = readiness.ready ? 200 : 503;
      res.status(statusCode).json(readiness);
    } catch (error) {
      res.status(503).json({
        ready: false,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Rate limiting stats endpoint (authenticated)
  app.get('/api/rate-limit/stats', isAuthenticated, async (req, res) => {
    try {
      const { ShopifyApiClient } = await import('./services/shopifyApiClient');
      const globalStats = ShopifyApiClient.getGlobalStats();
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        rateLimitStats: globalStats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Simple job monitoring endpoint (instead of Bull Board)
  app.get('/admin/queues', isAuthenticated, (req, res) => {
    res.json({ message: 'Simple queue monitoring - use /api/queues/stats for queue information' });
  });

  // Queue Management API Routes
  app.get('/api/queues/stats', isAuthenticated, async (req, res) => {
    try {
      const stats = await Promise.all([
        jobQueueService.getQueueStats('sync-operations'),
        jobQueueService.getQueueStats('file-import'),
        jobQueueService.getQueueStats('pricing-updates'),
      ]);

      res.json({
        'sync-operations': stats[0],
        'file-import': stats[1],
        'pricing-updates': stats[2],
      });
    } catch (error) {
      console.error('Error fetching queue stats:', error);
      res.status(500).json({ message: 'Failed to fetch queue stats' });
    }
  });

  app.post('/api/queues/:queueName/pause', isAuthenticated, async (req, res) => {
    try {
      const { queueName } = req.params;
      await jobQueueService.pauseQueue(queueName);
      res.json({ message: `Queue ${queueName} paused` });
    } catch (error) {
      console.error('Error pausing queue:', error);
      res.status(500).json({ message: 'Failed to pause queue' });
    }
  });

  app.post('/api/queues/:queueName/resume', isAuthenticated, async (req, res) => {
    try {
      const { queueName } = req.params;
      await jobQueueService.resumeQueue(queueName);
      res.json({ message: `Queue ${queueName} resumed` });
    } catch (error) {
      console.error('Error resuming queue:', error);
      res.status(500).json({ message: 'Failed to resume queue' });
    }
  });

  app.delete('/api/jobs/:queueName/:jobId', isAuthenticated, async (req, res) => {
    try {
      const { queueName, jobId } = req.params;
      const cancelled = await jobQueueService.cancelJob(queueName, jobId);
      
      if (cancelled) {
        res.json({ message: `Job ${jobId} cancelled` });
      } else {
        res.status(404).json({ message: 'Job not found' });
      }
    } catch (error) {
      console.error('Error cancelling job:', error);
      res.status(500).json({ message: 'Failed to cancel job' });
    }
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Dashboard routes
  app.get('/api/dashboard/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getDashboardStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Store routes
  app.get('/api/stores', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stores = await storage.getStores(userId);
      res.json(stores);
    } catch (error) {
      console.error("Error fetching stores:", error);
      res.status(500).json({ message: "Failed to fetch stores" });
    }
  });

  app.post('/api/stores', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const storeData = insertStoreSchema.parse({ ...req.body, userId });
      const store = await storage.createStore(storeData);
      
      // Send real-time update
      const wsService = getWebSocketService();
      if (wsService) {
        wsService.sendActivityUpdate(userId, {
          type: 'store_created',
          description: `New store "${store.name}" connected`,
          metadata: { storeId: store.id }
        });
      }
      
      res.json(store);
    } catch (error) {
      console.error("Error creating store:", error);
      res.status(500).json({ message: "Failed to create store" });
    }
  });

  // Vendor routes
  app.get('/api/vendors', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendors = await storage.getVendors(userId);
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      res.status(500).json({ message: "Failed to fetch vendors" });
    }
  });

  app.post('/api/vendors', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendorData = insertVendorSchema.parse({ ...req.body, userId });
      const vendor = await storage.createVendor(vendorData);
      
      // Create activity
      await storage.createActivity({
        userId,
        type: 'vendor_onboard',
        description: `New vendor "${vendor.name}" onboarded`,
        metadata: { vendorId: vendor.id }
      });
      
      // Send real-time updates
      const wsService = getWebSocketService();
      if (wsService) {
        wsService.sendVendorUpdate(userId, vendor);
        wsService.sendActivityUpdate(userId, {
          type: 'vendor_onboard',
          description: `New vendor "${vendor.name}" onboarded`,
          metadata: { vendorId: vendor.id }
        });
      }
      
      res.json(vendor);
    } catch (error) {
      console.error("Error creating vendor:", error);
      res.status(500).json({ message: "Failed to create vendor" });
    }
  });

  app.put('/api/vendors/:id', isAuthenticated, async (req: any, res) => {
    try {
      const vendorId = parseInt(req.params.id);
      const updates = req.body;
      const vendor = await storage.updateVendor(vendorId, updates);
      
      // Send real-time update
      const wsService = getWebSocketService();
      if (wsService) {
        wsService.sendVendorUpdate(req.user.claims.sub, vendor);
      }
      
      res.json(vendor);
    } catch (error) {
      console.error("Error updating vendor:", error);
      res.status(500).json({ message: "Failed to update vendor" });
    }
  });

  app.delete('/api/vendors/:id', isAuthenticated, async (req: any, res) => {
    try {
      const vendorId = parseInt(req.params.id);
      await storage.deleteVendor(vendorId);
      res.json({ message: "Vendor deleted successfully" });
    } catch (error) {
      console.error("Error deleting vendor:", error);
      res.status(500).json({ message: "Failed to delete vendor" });
    }
  });

  // Product routes
  app.get('/api/products', isAuthenticated, async (req: any, res) => {
    try {
      const vendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : undefined;
      const storeId = req.query.storeId ? parseInt(req.query.storeId as string) : undefined;
      const products = await storage.getProducts(vendorId, storeId);
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.post('/api/products', isAuthenticated, async (req: any, res) => {
    try {
      const productData = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(productData);
      
      // Send real-time update
      const wsService = getWebSocketService();
      if (wsService) {
        wsService.sendProductUpdate(req.user.claims.sub, product);
      }
      
      res.json(product);
    } catch (error) {
      console.error("Error creating product:", error);
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  // Update product
  app.put('/api/products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const productId = parseInt(req.params.id);
      
      if (isNaN(productId)) {
        return res.status(400).json({ message: 'Invalid product ID' });
      }

      const existingProduct = await storage.getProduct(productId);
      if (!existingProduct) {
        return res.status(404).json({ message: 'Product not found' });
      }

      // Parse and validate update data
      const updateData = updateProductSchema.parse(req.body);
      
      // Track what fields are being changed
      const localChanges: string[] = [];
      if (updateData.name !== existingProduct.name) localChanges.push('name');
      if (updateData.description !== existingProduct.description) localChanges.push('description');
      if (updateData.price !== existingProduct.price) localChanges.push('price');
      if (updateData.compareAtPrice !== existingProduct.compareAtPrice) localChanges.push('compareAtPrice');
      if (updateData.inventory !== existingProduct.inventory) localChanges.push('inventory');
      if (updateData.category !== existingProduct.category) localChanges.push('category');
      if (updateData.status !== existingProduct.status) localChanges.push('status');
      
      const updatedProduct = await storage.updateProduct(productId, {
        ...updateData,
        needsSync: localChanges.length > 0, // Mark for sync if any changes
        lastModifiedBy: 'user',
        localChanges: localChanges,
      });
      
      // Log activity
      await storage.createActivity({
        userId,
        type: 'product_update',
        description: `Updated product "${existingProduct.name}" - ${localChanges.join(', ')} changed`,
        metadata: { productId, changes: localChanges }
      });

      // Send real-time update
      const wsService = getWebSocketService();
      if (wsService) {
        wsService.sendActivityUpdate(userId, {
          type: 'product_updated',
          description: `Product "${existingProduct.name}" updated`,
          metadata: { productId, needsSync: localChanges.length > 0 }
        });
      }
      
      res.json(updatedProduct);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  app.delete('/api/products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.deleteAllProducts();
      
      // Log activity
      await storage.createActivity({
        userId,
        type: 'product_sync',
        description: 'Deleted all products from database',
        metadata: JSON.stringify({ action: 'delete_all' }),
      });

      res.json({ message: 'All products deleted successfully' });
    } catch (error) {
      console.error('Error deleting all products:', error);
      res.status(500).json({ message: 'Failed to delete products' });
    }
  });

  app.delete('/api/products/vendor/:vendorId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendorId = parseInt(req.params.vendorId);
      
      if (isNaN(vendorId)) {
        return res.status(400).json({ message: 'Invalid vendor ID' });
      }

      const vendor = await storage.getVendor(vendorId);
      if (!vendor) {
        return res.status(404).json({ message: 'Vendor not found' });
      }

      await storage.deleteVendorProducts(vendorId);
      
      // Log activity
      await storage.createActivity({
        userId,
        type: 'product_sync',
        description: `Deleted all products for vendor ${vendor.name}`,
        metadata: JSON.stringify({ vendorId, vendorName: vendor.name, action: 'delete_vendor_products' }),
      });

      res.json({ message: `All products for vendor ${vendor.name} deleted successfully` });
    } catch (error) {
      console.error('Error deleting vendor products:', error);
      res.status(500).json({ message: 'Failed to delete vendor products' });
    }
  });

  // Uploaded products endpoint
  app.get('/api/uploaded-products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get user's vendors
      const vendors = await storage.getVendors(userId);
      const vendorIds = vendors.map(v => v.id);
      
      // Get uploaded products for user's vendors
      const uploadedProducts = [];
      for (const vendorId of vendorIds) {
        const vendorProducts = await storage.getUploadedProducts(vendorId);
        uploadedProducts.push(...vendorProducts);
      }
      
      res.json(uploadedProducts);
    } catch (error) {
      console.error("Error fetching uploaded products:", error);
      res.status(500).json({ message: "Failed to fetch uploaded products" });
    }
  });

  // Sync routes
  app.get('/api/sync/jobs', isAuthenticated, async (req: any, res) => {
    try {
      const vendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : undefined;
      const syncJobs = await storage.getSyncJobs(vendorId);
      res.json(syncJobs);
    } catch (error) {
      console.error("Error fetching sync jobs:", error);
      res.status(500).json({ message: "Failed to fetch sync jobs" });
    }
  });

  app.post('/api/sync/start', isAuthenticated, async (req: any, res) => {
    try {
      const { vendorId, storeId, direction = 'bidirectional', options = {} } = req.body;
      const userId = req.user.claims.sub;
      
      if (!vendorId || !storeId) {
        return res.status(400).json({ message: "Vendor ID and Store ID are required" });
      }

      const store = await storage.getStore(storeId);
      if (!store) {
        return res.status(404).json({ message: "Store not found" });
      }

      if (!store.shopifyAccessToken) {
        return res.status(400).json({ message: "Store is not properly configured with Shopify access token" });
      }

      // Import sync service dynamically to avoid circular dependencies
      const { ProductSyncService } = await import('./services/sync');
      const syncService = new ProductSyncService(store);

      // Create sync job first
      const syncJob = await storage.createSyncJob({
        vendorId,
        storeId,
        status: 'pending',
        totalItems: 0,
        processedItems: 0,
        progress: 0,
        startedAt: new Date()
      });

      // Start sync process in background
      setImmediate(async () => {
        try {
          // Update job to running
          await storage.updateSyncJob(syncJob.id, {
            status: 'running',
            startedAt: new Date()
          });

          const result = await syncService.syncProducts(vendorId, {
            direction,
            syncImages: options.syncImages !== false,
            syncInventory: options.syncInventory !== false,
            syncPricing: options.syncPricing !== false,
            syncTags: options.syncTags !== false,
            syncVariants: options.syncVariants !== false,
            syncDescriptions: options.syncDescriptions !== false,
            batchSize: options.batchSize || 50,
          });

          // Update job to completed
          await storage.updateSyncJob(syncJob.id, {
            status: 'completed',
            processedItems: result.created + result.updated + result.failed,
            progress: 100,
            completedAt: new Date()
          });

          // Log activity
          await storage.createActivity({
            userId,
            type: 'vendor_sync',
            description: `Sync completed: ${result.created} created, ${result.updated} updated, ${result.failed} failed`,
            metadata: { vendorId, storeId, result }
          });
        } catch (error) {
          console.error("Sync process failed:", error);
          
          // Update job to failed
          await storage.updateSyncJob(syncJob.id, {
            status: 'failed',
            completedAt: new Date()
          });

          await storage.createActivity({
            userId,
            type: 'vendor_sync',
            description: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            metadata: { vendorId, storeId, error: error instanceof Error ? error.message : 'Unknown error' }
          });
        }
      });

      res.json({ 
        message: "Sync started successfully", 
        jobId: syncJob.id,
        success: true 
      });
    } catch (error) {
      console.error("Error starting sync:", error);
      res.status(500).json({ message: "Failed to start sync" });
    }
  });

  // Individual product sync
  app.post('/api/products/:id/sync', isAuthenticated, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { direction = 'bidirectional' } = req.body;
      
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const store = await storage.getStore(product.storeId);
      if (!store || !store.shopifyAccessToken) {
        return res.status(400).json({ message: "Store not properly configured" });
      }

      const { ProductSyncService } = await import('./services/sync');
      const syncService = new ProductSyncService(store);
      
      const result = await syncService.syncSingleProduct(productId, direction);
      
      res.json(result);
    } catch (error) {
      console.error("Error syncing product:", error);
      res.status(500).json({ message: "Failed to sync product" });
    }
  });

  // Update product inventory
  app.post('/api/products/:id/inventory', isAuthenticated, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { quantity, locationId } = req.body;
      
      if (typeof quantity !== 'number' || quantity < 0) {
        return res.status(400).json({ message: "Valid quantity is required" });
      }

      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const store = await storage.getStore(product.storeId);
      if (!store || !store.shopifyAccessToken) {
        return res.status(400).json({ message: "Store not properly configured" });
      }

      const { ProductSyncService } = await import('./services/sync');
      const syncService = new ProductSyncService(store);
      
      await syncService.updateProductInventory(productId, quantity);
      
      res.json({ message: "Inventory updated successfully" });
    } catch (error) {
      console.error("Error updating inventory:", error);
      res.status(500).json({ message: "Failed to update inventory" });
    }
  });

  // Update product pricing
  app.post('/api/products/:id/pricing', isAuthenticated, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { price, compareAtPrice } = req.body;
      
      if (typeof price !== 'number' || price <= 0) {
        return res.status(400).json({ message: "Valid price is required" });
      }

      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const store = await storage.getStore(product.storeId);
      if (!store || !store.shopifyAccessToken) {
        return res.status(400).json({ message: "Store not properly configured" });
      }

      const { ProductSyncService } = await import('./services/sync');
      const syncService = new ProductSyncService(store);
      
      await syncService.updateProductPricing(productId, price, compareAtPrice);
      
      res.json({ message: "Pricing updated successfully" });
    } catch (error) {
      console.error("Error updating pricing:", error);
      res.status(500).json({ message: "Failed to update pricing" });
    }
  });

  // Update product images
  app.post('/api/products/:id/images', isAuthenticated, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { images } = req.body;
      
      if (!Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ message: "Images array is required" });
      }

      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const store = await storage.getStore(product.storeId);
      if (!store || !store.shopifyAccessToken) {
        return res.status(400).json({ message: "Store not properly configured" });
      }

      const { ProductSyncService } = await import('./services/sync');
      const syncService = new ProductSyncService(store);
      
      await syncService.updateProductImages(productId, images);
      
      res.json({ message: "Images updated successfully" });
    } catch (error) {
      console.error("Error updating images:", error);
      res.status(500).json({ message: "Failed to update images" });
    }
  });

  // Test Shopify connection
  app.post('/api/stores/:id/test', isAuthenticated, async (req: any, res) => {
    try {
      const storeId = parseInt(req.params.id);
      const store = await storage.getStore(storeId);
      
      if (!store) {
        return res.status(404).json({ message: "Store not found" });
      }

      if (!store.shopifyAccessToken) {
        return res.status(400).json({ message: "Store access token not configured" });
      }

      const { ShopifyService } = await import('./services/shopify');
      const shopifyService = new ShopifyService(store);
      
      // Test connection by fetching a small number of products
      const testResult = await shopifyService.getProducts(1);
      
      res.json({ 
        success: true, 
        message: "Connection successful",
        productsCount: testResult.products.length
      });
    } catch (error) {
      console.error("Error testing Shopify connection:", error);
      res.status(400).json({ 
        success: false, 
        message: "Connection failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // AI routes
  app.post('/api/ai/generate-content', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { productName, category, keyFeatures, brandVoice, targetAudience } = req.body;
      
      if (!productName) {
        return res.status(400).json({ message: "Product name is required" });
      }
      
      const content = await generateProductContent({
        productName,
        category,
        keyFeatures,
        brandVoice,
        targetAudience,
      });
      
      // Save AI generation record
      await storage.createAiGeneration({
        userId,
        prompt: `Product: ${productName}, Category: ${category || 'N/A'}, Features: ${keyFeatures || 'N/A'}`,
        generatedContent: JSON.stringify(content),
        model: 'gpt-4o',
        success: true,
      });
      
      // Create activity
      await storage.createActivity({
        userId,
        type: 'ai_generation',
        description: `AI generated content for product "${productName}"`,
        metadata: { productName, contentType: 'full_content' }
      });
      
      res.json(content);
    } catch (error) {
      console.error("Error generating AI content:", error);
      res.status(500).json({ message: "Failed to generate content" });
    }
  });

  app.post('/api/ai/generate-description', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { productName, features } = req.body;
      
      if (!productName || !features) {
        return res.status(400).json({ message: "Product name and features are required" });
      }
      
      const description = await generateProductDescription(productName, features);
      
      // Save AI generation record
      await storage.createAiGeneration({
        userId,
        prompt: `Generate description for ${productName} with features: ${features}`,
        generatedContent: description,
        model: 'gpt-4o',
        success: true,
      });
      
      res.json({ description });
    } catch (error) {
      console.error("Error generating description:", error);
      res.status(500).json({ message: "Failed to generate description" });
    }
  });

  // AI Generation - Marketing Description with Frameworks
  app.post('/api/ai/generate-marketing', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const {
        productName,
        currentDescription,
        features,
        targetAudience,
        framework,
        brandVoice,
        price,
        category,
        upc,
        variants,
        vendorName
      } = req.body;
      
      if (!productName || !framework) {
        return res.status(400).json({ message: "Product name and marketing framework are required" });
      }
      
      const marketingContent = await generateMarketingDescription({
        productName,
        currentDescription,
        features,
        targetAudience,
        framework,
        brandVoice,
        price,
        category,
        upc,
        variants
      });
      
      // Save AI generation record
      await storage.createAiGeneration({
        userId,
        prompt: `Marketing ${framework} for: ${productName} | Target: ${targetAudience || 'General'} | Features: ${features || 'Standard'}`,
        generatedContent: JSON.stringify(marketingContent),
        model: 'gpt-4o',
        success: true,
      });
      
      // Create activity
      await storage.createActivity({
        userId,
        type: 'ai_generation',
        description: `Generated ${framework} marketing description for "${productName}"`,
        metadata: { 
          productName, 
          framework, 
          targetAudience,
          vendorName,
          contentType: 'marketing_description' 
        }
      });
      
      res.json(marketingContent);
    } catch (error) {
      console.error("Error generating marketing content:", error);
      res.status(500).json({ message: "Failed to generate marketing content" });
    }
  });

  // Activity routes
  app.get('/api/activities', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const activities = await storage.getActivities(userId, limit);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  // AI generations routes
  app.get('/api/ai/generations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const generations = await storage.getAiGenerations(userId, limit);
      res.json(generations);
    } catch (error) {
      console.error("Error fetching AI generations:", error);
      res.status(500).json({ message: "Failed to fetch AI generations" });
    }
  });

  // Pricing management routes
  app.get('/api/pricing/batches', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : undefined;
      const batches = await storage.getPricingBatches(userId, vendorId);
      res.json(batches);
    } catch (error) {
      console.error("Error fetching pricing batches:", error);
      res.status(500).json({ message: "Failed to fetch pricing batches" });
    }
  });

  app.post('/api/pricing/preview', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { pricingService } = await import('./services/pricing');
      
      const options = {
        vendorId: req.body.vendorId,
        priceChangeType: req.body.priceChangeType,
        priceChangeValue: parseFloat(req.body.priceChangeValue),
        compareAtPriceChange: req.body.compareAtPriceChange ? parseFloat(req.body.compareAtPriceChange) : undefined,
        includeCompareAtPrice: req.body.includeCompareAtPrice || false,
        reason: req.body.reason || 'Price update',
        preview: true,
        batchSize: req.body.batchSize ? parseInt(req.body.batchSize) : undefined,
      };

      const preview = await pricingService.calculatePricingChanges(userId, options);
      res.json(preview);
    } catch (error) {
      console.error("Error creating pricing preview:", error);
      res.status(500).json({ message: "Failed to create pricing preview" });
    }
  });

  app.post('/api/pricing/batches', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { pricingService } = await import('./services/pricing');
      
      const options = {
        vendorId: req.body.vendorId,
        priceChangeType: req.body.priceChangeType,
        priceChangeValue: parseFloat(req.body.priceChangeValue),
        compareAtPriceChange: req.body.compareAtPriceChange ? parseFloat(req.body.compareAtPriceChange) : undefined,
        includeCompareAtPrice: req.body.includeCompareAtPrice || false,
        reason: req.body.reason || 'Price update',
        preview: req.body.preview !== false,
        batchSize: req.body.batchSize ? parseInt(req.body.batchSize) : undefined,
      };

      const result = await pricingService.createPricingBatch(
        userId,
        options,
        req.body.name,
        req.body.description
      );

      await storage.createActivity({
        userId,
        type: 'pricing_batch_created',
        description: `Created pricing batch "${req.body.name}" with ${result.preview.changes.length} products`,
        metadata: { batchId: result.batch.id, totalProducts: result.preview.changes.length }
      });

      res.json(result);
    } catch (error) {
      console.error("Error creating pricing batch:", error);
      res.status(500).json({ message: "Failed to create pricing batch" });
    }
  });

  app.get('/api/pricing/batches/:id', isAuthenticated, async (req: any, res) => {
    try {
      const batchId = parseInt(req.params.id);
      const { pricingService } = await import('./services/pricing');
      
      const details = await pricingService.getPricingBatchDetails(batchId);
      res.json(details);
    } catch (error) {
      console.error("Error fetching pricing batch details:", error);
      res.status(500).json({ message: "Failed to fetch pricing batch details" });
    }
  });

  app.post('/api/pricing/batches/:id/apply', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const batchId = parseInt(req.params.id);
      const { pricingService } = await import('./services/pricing');
      
      await pricingService.applyPricingBatch(batchId);

      await storage.createActivity({
        userId,
        type: 'pricing_batch_applied',
        description: `Applied pricing batch ${batchId}`,
        metadata: { batchId }
      });

      res.json({ message: 'Pricing batch applied successfully' });
    } catch (error) {
      console.error("Error applying pricing batch:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to apply pricing batch" });
    }
  });

  app.post('/api/pricing/batches/:id/revert', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const batchId = parseInt(req.params.id);
      const { pricingService } = await import('./services/pricing');
      
      await pricingService.revertPricingBatch(batchId);

      await storage.createActivity({
        userId,
        type: 'pricing_batch_reverted',
        description: `Reverted pricing batch ${batchId}`,
        metadata: { batchId }
      });

      res.json({ message: 'Pricing batch reverted successfully' });
    } catch (error) {
      console.error("Error reverting pricing batch:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to revert pricing batch" });
    }
  });

  app.delete('/api/pricing/batches/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const batchId = parseInt(req.params.id);
      
      await storage.deletePricingBatch(batchId);

      await storage.createActivity({
        userId,
        type: 'pricing_batch_deleted',
        description: `Deleted pricing batch ${batchId}`,
        metadata: { batchId }
      });

      res.json({ message: 'Pricing batch deleted successfully' });
    } catch (error) {
      console.error("Error deleting pricing batch:", error);
      res.status(500).json({ message: "Failed to delete pricing batch" });
    }
  });

  // Product Image Management Routes
  app.post('/api/products/:id/images/upload', isAuthenticated, upload.array('images', 10), async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
      }

      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      // Process uploaded images
      const uploadedImages = await ImageManager.uploadProductImages(productId, files);
      
      // Get existing images and combine with new ones
      const existingImages = product.images as string[] || [];
      const newImageUrls = uploadedImages.map(img => img.url);
      const allImages = [...existingImages, ...newImageUrls];
      
      // Update product with new images
      const updatedProduct = await storage.updateProductImages(
        productId, 
        allImages, 
        product.primaryImage || newImageUrls[0]
      );

      res.json({
        message: 'Images uploaded successfully',
        images: allImages,
        primaryImage: updatedProduct.primaryImage,
        uploadedCount: newImageUrls.length
      });
    } catch (error) {
      console.error('Image upload error:', error);
      res.status(500).json({ message: 'Failed to upload images' });
    }
  });

  app.put('/api/products/:id/images/primary', isAuthenticated, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { imageUrl } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ message: 'Image URL is required' });
      }

      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      // Verify the image URL exists in product images
      const images = product.images as string[] || [];
      if (!images.includes(imageUrl)) {
        return res.status(400).json({ message: 'Image URL not found in product images' });
      }

      const updatedProduct = await storage.updateProductImages(
        productId,
        images,
        imageUrl
      );

      res.json({
        message: 'Primary image updated successfully',
        primaryImage: updatedProduct.primaryImage
      });
    } catch (error) {
      console.error('Primary image update error:', error);
      res.status(500).json({ message: 'Failed to update primary image' });
    }
  });

  app.delete('/api/products/:id/images', isAuthenticated, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { imageUrl } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ message: 'Image URL is required' });
      }

      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      // Remove image from product images
      const images = product.images as string[] || [];
      const updatedImages = images.filter(img => img !== imageUrl);
      
      // If removing primary image, set new primary
      let newPrimaryImage = product.primaryImage;
      if (product.primaryImage === imageUrl) {
        newPrimaryImage = updatedImages.length > 0 ? updatedImages[0] : null;
      }

      const updatedProduct = await storage.updateProductImages(
        productId,
        updatedImages,
        newPrimaryImage
      );

      // Delete physical file if it's an uploaded image
      if (imageUrl.startsWith('/uploads/images/')) {
        const filePath = path.join(process.cwd(), imageUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      res.json({
        message: 'Image deleted successfully',
        images: updatedImages,
        primaryImage: updatedProduct.primaryImage
      });
    } catch (error) {
      console.error('Image deletion error:', error);
      res.status(500).json({ message: 'Failed to delete image' });
    }
  });

  app.post('/api/products/:id/images/sync-shopify', isAuthenticated, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id);
      
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      if (!product.shopifyProductId) {
        return res.status(400).json({ message: 'Product is not synced with Shopify' });
      }

      const store = await storage.getStore(product.storeId);
      if (!store || !store.shopifyAccessToken) {
        return res.status(400).json({ message: 'Store not properly configured' });
      }

      // Fetch product from Shopify
      const { ShopifyService } = await import('./services/shopify');
      const shopifyService = new ShopifyService(store);
      const shopifyProduct = await shopifyService.getProduct(product.shopifyProductId);

      if (!shopifyProduct) {
        return res.status(404).json({ message: 'Product not found in Shopify' });
      }

      // Sync images from Shopify
      const shopifyImages = shopifyProduct.images || [];
      const normalizedImages = ImageManager.normalizeShopifyImages(shopifyImages);
      const imageUrls = normalizedImages.map(img => img.url);
      
      const updatedProduct = await storage.updateProductImages(
        productId,
        imageUrls,
        imageUrls[0] || null
      );

      res.json({
        message: 'Images synced from Shopify successfully',
        images: imageUrls,
        primaryImage: updatedProduct.primaryImage,
        syncedCount: imageUrls.length
      });
    } catch (error) {
      console.error('Shopify image sync error:', error);
      res.status(500).json({ message: 'Failed to sync images from Shopify' });
    }
  });

  // File upload routes
  app.use('/api/files', fileUploadRoutes);

  // Bulk sync routes
  app.post("/api/sync/bulk-from-shopify", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { storeId } = req.body;
      
      console.log(`Starting bulk sync for user ${userId}, store ${storeId || 'all'}`);
      
      const bulkSyncService = new BulkSyncService();
      
      // Start the sync in background
      setImmediate(async () => {
        try {
          await bulkSyncService.syncAllFromShopify(userId, storeId);
        } catch (error) {
          console.error("Bulk sync error:", error);
        }
      });
      
      res.json({ 
        message: "Bulk sync started", 
        progress: bulkSyncService.getProgress()
      });
    } catch (error) {
      console.error("Error starting bulk sync:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to start bulk sync" 
      });
    }
  });

  app.get("/api/sync/bulk-progress", isAuthenticated, async (req: any, res) => {
    try {
      // This would typically get progress from a stored state or cache
      // For now, return a simple response
      res.json({ 
        message: "Use WebSocket connection for real-time progress updates",
        status: "Check WebSocket messages for bulk_sync_progress events"
      });
    } catch (error) {
      console.error("Error getting bulk sync progress:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get progress" 
      });
    }
  });
  
  // Vendor import routes
  const { default: vendorImportRoutes } = await import('./routes/vendor-import.js');
  app.use('/api/import', vendorImportRoutes);
  
  // Sync routes
  const { default: syncRoutes } = await import('./routes/sync.js');
  app.use('/api/sync', syncRoutes);

  return httpServer;
}

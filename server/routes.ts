import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { generateProductContent, generateProductDescription } from "./services/openai";
import { initWebSocketService, getWebSocketService } from "./services/websocket";
import { insertVendorSchema, insertStoreSchema, insertProductSchema, updateProductSchema } from "@shared/schema";
import fileUploadRoutes from "./routes/file-upload";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);
  
  // Initialize WebSocket service
  initWebSocketService(httpServer);

  // Auth middleware
  await setupAuth(app);

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

      // Start sync process in background
      setImmediate(async () => {
        try {
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

          // Log activity
          await storage.createActivity({
            userId,
            type: 'vendor_sync',
            description: `Sync completed: ${result.created} created, ${result.updated} updated, ${result.failed} failed`,
            metadata: { vendorId, storeId, result }
          });
        } catch (error) {
          console.error("Sync process failed:", error);
          await storage.createActivity({
            userId,
            type: 'vendor_sync',
            description: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            metadata: { vendorId, storeId, error: error instanceof Error ? error.message : 'Unknown error' }
          });
        }
      });

      res.json({ message: "Sync started successfully" });
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
      
      await syncService.updateProductInventory(productId, quantity, locationId);
      
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

  // File upload routes
  app.use('/api/files', fileUploadRoutes);

  return httpServer;
}

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { generateProductContent, generateProductDescription } from "./services/openai";
import { initWebSocketService, getWebSocketService } from "./services/websocket";
import { insertVendorSchema, insertStoreSchema, insertProductSchema } from "@shared/schema";

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
      const { vendorId, storeId } = req.body;
      const userId = req.user.claims.sub;
      
      // Create sync job
      const syncJob = await storage.createSyncJob({
        vendorId,
        storeId,
        status: 'pending',
        totalItems: 0,
        processedItems: 0,
      });
      
      // Simulate sync process (in real implementation, this would be a background job)
      setTimeout(async () => {
        // Update to running
        await storage.updateSyncJob(syncJob.id, {
          status: 'running',
          startedAt: new Date(),
          totalItems: 100,
        });
        
        const wsService = getWebSocketService();
        if (wsService) {
          wsService.sendSyncUpdate(userId, { ...syncJob, status: 'running', totalItems: 100 });
        }
        
        // Simulate progress updates
        for (let i = 0; i <= 100; i += 10) {
          setTimeout(async () => {
            await storage.updateSyncJob(syncJob.id, {
              processedItems: i,
              progress: i,
            });
            
            if (wsService) {
              wsService.sendSyncUpdate(userId, { ...syncJob, processedItems: i, progress: i });
            }
            
            if (i === 100) {
              await storage.updateSyncJob(syncJob.id, {
                status: 'completed',
                completedAt: new Date(),
              });
              
              if (wsService) {
                wsService.sendSyncUpdate(userId, { ...syncJob, status: 'completed' });
              }
            }
          }, i * 100);
        }
      }, 1000);
      
      res.json(syncJob);
    } catch (error) {
      console.error("Error starting sync:", error);
      res.status(500).json({ message: "Failed to start sync" });
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

  return httpServer;
}

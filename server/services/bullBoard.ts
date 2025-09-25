// Bull Board disabled - using simple in-memory queues without Redis
import { Express } from 'express';

// Mock adapter for development without Redis
class MockServerAdapter {
  setBasePath(path: string) {
    console.log(`Bull Board would be available at ${path} (disabled in Redis-free mode)`);
  }
  
  getRouter() {
    const express = require('express');
    const router = express.Router();
    
    // Return a simple status endpoint instead
    router.get('/', (req: any, res: any) => {
      res.json({
        message: 'Bull Board disabled - using in-memory job queues',
        status: 'development',
        queues: ['sync-operations', 'file-import', 'pricing-updates']
      });
    });
    
    return router;
  }
}

const serverAdapter = new MockServerAdapter();
serverAdapter.setBasePath('/admin/queues');

// Mock functions for compatibility
const addQueue = () => {};
const removeQueue = () => {};
const setQueues = () => {};
const replaceQueues = () => {};

export { serverAdapter, addQueue, removeQueue, setQueues, replaceQueues };
#!/usr/bin/env tsx

// Idempotent Operations Test for VendorSync Pro
// Tests that duplicate sync runs don't create duplicate products

import { ProductProcessor } from './server/services/productProcessor';
import { storage } from './server/storage';

const VENDOR_ID = 6; // Idempotent Test Vendor
const STORE_ID = 1;  // Mighty Generators store

// Test data sets
const INITIAL_PRODUCTS = [
  {
    sku: 'IDEM001',
    name: 'Idempotent Test Product 1',
    price: 19.99,
    msrp: 24.99,
    inventory: 100,
    description: 'First test product for idempotent operations'
  },
  {
    sku: 'IDEM002', 
    name: 'Idempotent Test Product 2',
    price: 29.99,
    msrp: 34.99,
    inventory: 50,
    description: 'Second test product for idempotent operations'
  }
];

const UPDATED_PRODUCTS = [
  {
    sku: 'IDEM001',
    name: 'Idempotent Test Product 1 Updated',
    price: 25.99,
    msrp: 29.99,
    inventory: 75,
    description: 'Updated first test product'
  },
  {
    sku: 'IDEM002',
    name: 'Idempotent Test Product 2 Updated', 
    price: 35.99,
    msrp: 39.99,
    inventory: 25,
    description: 'Updated second test product'
  }
];

async function runIdempotentTest() {
  console.log('🚀 Starting Idempotent Operations Test...\n');
  
  try {
    // Initialize ProductProcessor
    const processor = new ProductProcessor(storage, VENDOR_ID, STORE_ID);
    
    // EOL Policy for testing
    const eolPolicy = {
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
      }
    };

    // Test 1: Initial sync (should create new products)
    console.log('📝 Test 1: Initial sync - Creating new products...');
    const initialResult = await processor.processVendorProducts(INITIAL_PRODUCTS, eolPolicy);
    console.log(`   Summary: ${JSON.stringify(initialResult.summary)}`);
    
    // Execute creations
    const createMatches = initialResult.matches.filter(m => m.recommendedAction === 'create');
    const createOps = await processor.executeCreations(createMatches);
    console.log(`   ✅ Created ${createOps.length} products`);

    // Verify products in database
    const productsAfterCreate = await storage.getProductsByVendor(VENDOR_ID);
    const testProductsAfterCreate = productsAfterCreate.filter(p => 
      p.sku === 'IDEM001' || p.sku === 'IDEM002'
    );
    console.log(`   📊 Database: ${testProductsAfterCreate.length} test products found\n`);

    // Test 2: Duplicate sync (should update, not create duplicates) 
    console.log('🔄 Test 2: Duplicate sync - Testing idempotent behavior...');
    const duplicateResult = await processor.processVendorProducts(INITIAL_PRODUCTS, eolPolicy);
    console.log(`   Summary: ${JSON.stringify(duplicateResult.summary)}`);
    
    // Should have update recommendations, not create
    const updateMatches = duplicateResult.matches.filter(m => m.recommendedAction === 'update');
    const newCreateMatches = duplicateResult.matches.filter(m => m.recommendedAction === 'create');
    
    console.log(`   🔍 Update matches: ${updateMatches.length}`);
    console.log(`   🔍 Create matches: ${newCreateMatches.length}`);
    
    if (newCreateMatches.length > 0) {
      console.log('   ❌ FAILED: Duplicate sync should not create new products!');
      return false;
    } else {
      console.log('   ✅ PASSED: No duplicate products created');
    }

    // Verify product count unchanged
    const productsAfterDuplicate = await storage.getProductsByVendor(VENDOR_ID);
    const testProductsAfterDuplicate = productsAfterDuplicate.filter(p => 
      p.sku === 'IDEM001' || p.sku === 'IDEM002'
    );
    console.log(`   📊 Database: ${testProductsAfterDuplicate.length} test products (should be same)\n`);

    // Test 3: Modified sync (should update existing products)
    console.log('✏️  Test 3: Modified sync - Testing product updates...');
    const updateResult = await processor.processVendorProducts(UPDATED_PRODUCTS, eolPolicy);
    console.log(`   Summary: ${JSON.stringify(updateResult.summary)}`);
    
    // Execute updates
    const finalUpdateMatches = updateResult.matches.filter(m => m.recommendedAction === 'update');
    const updateOps = await processor.executeUpdates(finalUpdateMatches);
    console.log(`   ✅ Updated ${updateOps.length} products`);

    // Verify price updates
    const productsAfterUpdate = await storage.getProductsByVendor(VENDOR_ID);
    const updatedProduct1 = productsAfterUpdate.find(p => p.sku === 'IDEM001');
    const updatedProduct2 = productsAfterUpdate.find(p => p.sku === 'IDEM002');
    
    console.log(`   💰 IDEM001 price: ${updatedProduct1?.price} (expected: 25.99)`);
    console.log(`   💰 IDEM002 price: ${updatedProduct2?.price} (expected: 35.99)`);
    
    const pricesCorrect = (
      parseFloat(updatedProduct1?.price || '0') === 25.99 &&
      parseFloat(updatedProduct2?.price || '0') === 35.99
    );
    
    if (pricesCorrect) {
      console.log('   ✅ PASSED: Product prices updated correctly');
    } else {
      console.log('   ❌ FAILED: Product prices not updated correctly');
      return false;
    }

    console.log('\n🎉 ALL TESTS PASSED! Idempotent operations working correctly.');
    return true;

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    return false;
  }
}

// Run the test
runIdempotentTest()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
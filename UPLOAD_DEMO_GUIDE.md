# CSV Upload Demo - Step by Step

I've created a sample CSV file (`sample_vendor_products.csv`) with 5 products to demonstrate the upload system. Here's how to test it:

## Sample Data Overview

The CSV contains these products:
- **TECH-001**: Wireless Bluetooth Headphones ($79.99)
- **TECH-002**: USB-C Fast Charger ($24.99) 
- **HOME-001**: Smart LED Bulb ($19.99)
- **SPORT-001**: Yoga Mat Premium ($49.99)
- **TECH-003**: Portable Power Bank ($39.99)

Each product has: SKU, Name, Prices (Retail, Cost, MSRP), Inventory, Category, Description, Barcode, and Image URL.

## Step-by-Step Demo

### Step 1: Configure Field Mapping
1. Go to the **Vendors** page in your app
2. Find any vendor (like "Ecoflow") and click the **⋮** menu
3. Select **"Configure Fields"**
4. You'll see the field mapping interface with these options:

**Quick Setup**: Click **"Wholesale"** preset button to auto-map:
- Product Code → SKU
- Product Name → Product Name  
- Retail Price → Price
- Cost Price → Cost
- MSRP → MSRP
- Stock Quantity → Inventory
- Product Category → Category
- Product Description → Description
- Barcode → Barcode
- Image URL → Images

5. Click **"Save Mapping"**

### Step 2: Upload the Sample File
1. From the same vendor menu, click **"Upload Products"**
2. You'll see a green status: "Field mapping configured ✓"
3. Drag and drop the `sample_vendor_products.csv` file or click **"Choose File"**
4. The system will process the file and show results:
   - **5 products parsed** 
   - **5 new products** (assuming they don't exist yet)
   - **Products ready for sync**

### Step 3: Review Upload Results
The upload modal will show:
- ✅ **Total Products**: 5
- ✅ **New Products**: 5  
- ✅ **Updated Products**: 0
- ✅ **Ready to Sync**: 5
- ❌ **Errors**: 0

### Step 4: Sync to Shopify
1. Click **"Sync Products"** button
2. Watch the vendor card for real-time progress
3. You'll see status change from "Syncing..." to "Completed"
4. Check your Shopify store - the 5 products should appear!

## What the System Does

### Field Mapping Magic
- **Intelligent Parsing**: Recognizes "Product Code" as SKU, "Retail Price" as Price
- **Data Validation**: Ensures required fields (SKU, Name, Price) are present
- **Format Conversion**: Converts prices to proper decimal format
- **Image Handling**: Processes image URLs for product photos

### Smart Import Logic
- **SKU Matching**: Uses SKU as the unique identifier
- **Conflict Resolution**: Handles duplicate SKUs intelligently  
- **Data Precedence**: Vendor pricing data takes priority
- **Batch Processing**: Processes all products efficiently

### Real-Time Feedback
- **Progress Tracking**: See upload and sync progress
- **Error Reporting**: Detailed error messages for issues
- **Status Updates**: Live updates on vendor cards
- **Success Confirmation**: Clear success indicators

## Testing Different Scenarios

### Test 1: First Upload (New Products)
Upload the sample CSV to see all 5 products created as new.

### Test 2: Update Existing (Modified Prices)
Edit the CSV file to change some prices, then upload again to see products updated.

### Test 3: Mixed Upload (New + Updates)
Add new products to the CSV and modify existing ones to test both scenarios.

### Test 4: Different Column Names
Try renaming columns in the CSV (like "SKU" instead of "Product Code") and update field mapping accordingly.

## Expected Results

After uploading and syncing the sample file, you should have:
- 5 new products in your database
- 5 products synced to Shopify
- Proper pricing (retail, cost, MSRP) set
- Inventory quantities updated
- Product categories assigned
- Images linked to products

## Troubleshooting the Demo

If something doesn't work:
1. **Check field mapping** - Ensure columns are properly mapped
2. **Verify file format** - CSV should have headers in first row
3. **Check required fields** - SKU, Name, and Price must be mapped
4. **Review Shopify connection** - Ensure store is properly connected

## NEW: Excel Sheet Selection Feature

**📊 Multi-Sheet Excel Support**: Upload Excel files and choose specific sheets!

### Testing Multi-Sheet Excel:
1. **Use the new test file**: `test-vendor-products-multi-sheet.xlsx`
   - Electronics sheet: 3 tech products
   - Home & Garden sheet: 3 home products  
   - Sports & Fitness sheet: 3 fitness products

2. **Upload Process**:
   - Select the Excel file → System analyzes all sheets
   - Choose sheets: Select one, multiple, or all sheets
   - Import proceeds with selected data combined

3. **Sheet Selection Options**:
   - **Select All**: Import all sheets at once
   - **Individual Selection**: Pick specific sheets (e.g., just Electronics)
   - **Multiple Selection**: Combine data from chosen sheets

### Examples to Try:
- **Single Sheet**: Import just "Electronics" sheet (3 products)
- **Multiple Sheets**: Import "Electronics" + "Home & Garden" (6 products)
- **All Sheets**: Import all 3 sheets (9 products total)

The system seamlessly combines data from multiple sheets while maintaining proper field mapping and validation. Perfect for vendors with organized product catalogs by category!

The system is designed to be intuitive and provide clear feedback at every step. Try the demo and see how easy it is to import vendor data!
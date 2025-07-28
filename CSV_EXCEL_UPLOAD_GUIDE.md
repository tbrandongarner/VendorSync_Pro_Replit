# CSV & Excel Upload System Guide

VendorSync Pro includes a comprehensive file upload and field mapping system that allows you to easily import product data from CSV and Excel files. Here's how to use it:

## Features

### 🔧 Field Mapping Configuration
- **Visual field mapping interface** - Map your file columns to product fields using an intuitive interface
- **Quick presets** - Pre-configured mappings for Shopify exports, basic CSV files, and wholesale catalogs
- **Custom column names** - Support for any column naming convention
- **Required field validation** - Ensures critical fields (SKU, Name, Price) are properly mapped

### 📁 File Upload Support
- **Multiple formats** - Support for CSV, Excel (.xlsx, .xls) files
- **Drag & drop interface** - Easy file upload with visual feedback
- **Real-time validation** - Immediate feedback on file format and structure
- **Progress tracking** - See upload and processing progress in real-time

### 🔄 Smart Import Modes
- **New products only** - Import only products that don't already exist
- **Update existing only** - Update only products that already exist in your catalog
- **Both** - Import new products and update existing ones

### ⚡ Conflict Resolution
- **Intelligent data precedence** - Vendor pricing data takes priority for cost/pricing fields
- **3-way conflict handling** - Manages conflicts between vendor data, local changes, and Shopify data
- **Manual intervention** - UI for resolving complex conflicts that can't be auto-resolved

## How to Use

### Step 1: Configure Field Mapping
1. Go to **Vendors** page
2. Click the **⋮** menu on any vendor card
3. Select **Configure Fields**
4. Choose a preset or manually map your columns:
   - **Required fields**: SKU, Product Name, Price
   - **Optional fields**: Cost, MSRP, Description, Inventory, Category, etc.
5. Click **Save Mapping**

### Step 2: Upload Your File
1. Click **Upload Products** from the vendor menu
2. Review your field mapping status (green = configured, yellow = needs setup)
3. Drag & drop your CSV/Excel file or click **Choose File**
4. Wait for processing and validation
5. Review the import results

### Step 3: Sync to Shopify
1. After successful upload, click **Sync Changes**
2. Monitor sync progress on the vendor card
3. Check the sync history for detailed results

## Supported File Formats

### CSV Files
- Standard comma-separated values
- UTF-8 encoding recommended
- First row should contain column headers

### Excel Files
- .xlsx and .xls formats supported
- Uses the first worksheet by default
- First row should contain column headers

## Field Mapping Reference

### Required Fields
- **SKU**: Unique product identifier (required)
- **Product Name**: Display name for the product (required)
- **Price**: Selling price (required)

### Optional Fields
- **Cost**: Your cost for the product
- **MSRP**: Manufacturer suggested retail price
- **Compare At Price**: Original price for showing discounts
- **Description**: Product description or details
- **Inventory**: Stock quantity
- **Category**: Product category or type
- **Barcode**: UPC, EAN, or other barcode
- **Images**: Image URLs (comma-separated)
- **Tags**: Product tags (comma-separated)

### Common Column Names
The system recognizes many common column naming conventions:

**SKU variations**: SKU, Product Code, Item Code, Model, Variant SKU
**Price variations**: Price, Selling Price, Retail Price, Unit Price
**Inventory variations**: Inventory, Stock, Quantity, QTY, Available

## Pre-configured Presets

### Shopify Export Format
Perfect if you're importing from a Shopify product export:
- Variant SKU → SKU
- Title → Product Name
- Variant Price → Price
- Body (HTML) → Description
- Variant Inventory Qty → Inventory

### Basic Format
For simple CSV files with standard column names:
- SKU → SKU
- Product Name → Product Name
- Price → Price
- Cost → Cost
- Inventory → Inventory

### Wholesale Format
For wholesale vendor catalogs:
- Item Code → SKU
- Product Name → Product Name
- Retail Price → Price
- Wholesale Price → Cost
- MSRP → MSRP

## Tips for Best Results

1. **Always configure field mapping first** - This ensures accurate data import
2. **Use SKU as the primary identifier** - Products are matched and updated based on SKU
3. **Clean your data** - Remove empty rows and ensure consistent formatting
4. **Test with small files first** - Start with a few products to verify your mapping
5. **Monitor sync progress** - Watch the vendor card for real-time sync status
6. **Check for conflicts** - Review any products that couldn't be auto-resolved

## Troubleshooting

### File Won't Upload
- Check file format (CSV, Excel only)
- Ensure file isn't corrupted
- Try a smaller file size first

### Import Shows Errors
- Verify field mapping is configured
- Check for missing required fields (SKU, Name, Price)
- Ensure data formatting is consistent

### Products Not Syncing
- Verify Shopify store connection
- Check sync job status in the sync history
- Look for conflict resolution needed

### Field Mapping Issues
- Use exact column names from your file
- Check for hidden characters or spaces
- Try a different preset if available

## Data Flow Overview

1. **Upload** → File is parsed using your field mapping
2. **Validate** → Required fields are checked
3. **Import** → Products are created/updated in database
4. **Sync** → Changes are pushed to Shopify
5. **Track** → Progress is monitored and logged

This system is designed to handle large catalogs efficiently while maintaining data integrity and providing full visibility into the import process.
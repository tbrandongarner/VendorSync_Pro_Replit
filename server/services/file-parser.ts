import * as XLSX from 'xlsx';
import * as csv from 'csv-parser';
import { Readable } from 'stream';

export interface ParsedProduct {
  sku: string;
  name: string;
  description?: string;
  price?: number;
  compareAtPrice?: number;
  inventory?: number;
  category?: string;
  barcode?: string;
  images?: string[];
  [key: string]: any;
}

export interface DataSourceConfig {
  sku_column?: string;
  name_column?: string;
  description_column?: string;
  price_column?: string;
  compare_price_column?: string;
  inventory_column?: string;
  category_column?: string;
  barcode_column?: string;
  images_column?: string;
}

const DEFAULT_CONFIG: DataSourceConfig = {
  sku_column: 'Variant SKU',
  name_column: 'Title',
  description_column: 'Body (HTML)',
  price_column: 'Variant Price',
  compare_price_column: 'Variant Compare At Price',
  inventory_column: 'Inventory',
  category_column: 'Category',
  barcode_column: 'Variant Barcode',
  images_column: 'Image Src'
};

export async function parseCSV(buffer: Buffer, config: DataSourceConfig = {}): Promise<ParsedProduct[]> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const results: ParsedProduct[] = [];
  
  return new Promise((resolve, reject) => {
    const stream = Readable.from(buffer);
    stream
      .pipe(csv())
      .on('data', (row: any) => {
        const product = mapRowToProduct(row, finalConfig);
        if (product.sku) {
          results.push(product);
        }
      })
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

export async function parseExcel(buffer: Buffer, config: DataSourceConfig = {}): Promise<ParsedProduct[]> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  return rows.map(row => mapRowToProduct(row, finalConfig)).filter(p => p.sku);
}

export async function parseGoogleSheets(url: string, config: DataSourceConfig = {}): Promise<ParsedProduct[]> {
  // Convert Google Sheets URL to CSV export URL
  const sheetId = extractGoogleSheetId(url);
  if (!sheetId) {
    throw new Error('Invalid Google Sheets URL');
  }

  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  
  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch Google Sheets data: ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    return parseCSV(buffer, config);
  } catch (error) {
    throw new Error(`Error parsing Google Sheets: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function extractGoogleSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function mapRowToProduct(row: any, config: DataSourceConfig): ParsedProduct {
  const product: ParsedProduct = {
    sku: String(row[config.sku_column!] || '').trim(),
    name: String(row[config.name_column!] || '').trim(),
  };

  if (config.description_column && row[config.description_column]) {
    product.description = String(row[config.description_column]).trim();
  }

  if (config.price_column && row[config.price_column]) {
    const price = parseFloat(String(row[config.price_column]).replace(/[^0-9.-]/g, ''));
    if (!isNaN(price)) {
      product.price = price;
    }
  }

  if (config.compare_price_column && row[config.compare_price_column]) {
    const comparePrice = parseFloat(String(row[config.compare_price_column]).replace(/[^0-9.-]/g, ''));
    if (!isNaN(comparePrice)) {
      product.compareAtPrice = comparePrice;
    }
  }

  if (config.inventory_column && row[config.inventory_column]) {
    const inventory = parseInt(String(row[config.inventory_column]).replace(/[^0-9]/g, ''));
    if (!isNaN(inventory)) {
      product.inventory = inventory;
    }
  }

  if (config.category_column && row[config.category_column]) {
    product.category = String(row[config.category_column]).trim();
  }

  if (config.barcode_column && row[config.barcode_column]) {
    product.barcode = String(row[config.barcode_column]).trim();
  }

  if (config.images_column && row[config.images_column]) {
    const imagesStr = String(row[config.images_column]).trim();
    if (imagesStr) {
      // Split by comma or semicolon and clean up URLs
      product.images = imagesStr.split(/[,;]/).map(url => url.trim()).filter(url => url);
    }
  }

  return product;
}
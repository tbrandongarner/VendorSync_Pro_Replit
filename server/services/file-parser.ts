import * as XLSX from 'xlsx';
import csv from 'csv-parser';
import { Readable } from 'stream';

export interface ParsedProduct {
  sku: string;
  name: string;
  description?: string;
  price?: number;
  compareAtPrice?: number;
  costPrice?: number;
  msrp?: number;
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
  cost_price_column?: string;
  msrp_column?: string;
  inventory_column?: string;
  category_column?: string;
  barcode_column?: string;
  images_column?: string;
}

export interface HeaderSuggestion {
  fieldName: string;
  column: string;
  confidence: number;
  alternativeColumns?: string[];
}

export interface HeaderAnalysisResult {
  suggestions: HeaderSuggestion[];
  requiredFieldsMissing: string[];
  confidence: number;
  presetMatch?: string;
}

const DEFAULT_CONFIG: DataSourceConfig = {
  sku_column: 'Variant SKU',
  name_column: 'Title',
  description_column: 'Body (HTML)',
  price_column: 'Variant Price',
  compare_price_column: 'Variant Compare At Price',
  cost_price_column: 'Cost per item',
  msrp_column: 'MSRP',
  inventory_column: 'Inventory',
  category_column: 'Category',
  barcode_column: 'Variant Barcode',
  images_column: 'Image Src'
};

// Field pattern matching for intelligent header detection
const FIELD_PATTERNS = {
  sku: [
    /^sku$/i,
    /^item.*sku$/i,
    /^product.*sku$/i,
    /^variant.*sku$/i,
    /^part.*number$/i,
    /^item.*number$/i,
    /^product.*code$/i,
    /^model.*number$/i,
    /^article.*number$/i
  ],
  name: [
    /^title$/i,
    /^name$/i,
    /^product.*name$/i,
    /^product.*title$/i,
    /^item.*name$/i,
    /^description$/i,
    /^product$/i
  ],
  description: [
    /^description$/i,
    /^body$/i,
    /^body.*html$/i,
    /^product.*description$/i,
    /^long.*description$/i,
    /^details$/i,
    /^summary$/i
  ],
  price: [
    /^price$/i,
    /^sell.*price$/i,
    /^selling.*price$/i,
    /^retail.*price$/i,
    /^unit.*price$/i,
    /^variant.*price$/i,
    /^current.*price$/i
  ],
  compareAtPrice: [
    /^compare.*price$/i,
    /^compare.*at.*price$/i,
    /^variant.*compare.*price$/i,
    /^was.*price$/i,
    /^original.*price$/i,
    /^list.*price$/i,
    /^regular.*price$/i
  ],
  costPrice: [
    /^cost$/i,
    /^cost.*price$/i,
    /^cost.*per.*item$/i,
    /^wholesale.*price$/i,
    /^purchase.*price$/i,
    /^vendor.*cost$/i,
    /^unit.*cost$/i
  ],
  msrp: [
    /^msrp$/i,
    /^manufacturer.*suggested.*retail.*price$/i,
    /^suggested.*retail.*price$/i,
    /^recommended.*retail.*price$/i,
    /^rrp$/i,
    /^srp$/i
  ],
  inventory: [
    /^inventory$/i,
    /^stock$/i,
    /^quantity$/i,
    /^qty$/i,
    /^available$/i,
    /^on.*hand$/i,
    /^stock.*quantity$/i,
    /^inventory.*quantity$/i
  ],
  category: [
    /^category$/i,
    /^product.*category$/i,
    /^type$/i,
    /^product.*type$/i,
    /^collection$/i,
    /^group$/i
  ],
  barcode: [
    /^barcode$/i,
    /^upc$/i,
    /^ean$/i,
    /^gtin$/i,
    /^variant.*barcode$/i,
    /^product.*code$/i
  ],
  images: [
    /^image$/i,
    /^images$/i,
    /^image.*src$/i,
    /^image.*url$/i,
    /^photo$/i,
    /^picture$/i
  ]
};

// Preset configurations for common vendor formats
const PRESET_CONFIGS = {
  shopify: {
    sku_column: 'Variant SKU',
    name_column: 'Title',
    description_column: 'Body (HTML)',
    price_column: 'Variant Price',
    compare_price_column: 'Variant Compare At Price',
    cost_price_column: 'Cost per item',
    inventory_column: 'Variant Inventory Qty',
    category_column: 'Product Category',
    barcode_column: 'Variant Barcode',
    images_column: 'Image Src'
  },
  basic: {
    sku_column: 'SKU',
    name_column: 'Name',
    description_column: 'Description',
    price_column: 'Price',
    compare_price_column: 'Compare Price',
    cost_price_column: 'Cost',
    msrp_column: 'MSRP',
    inventory_column: 'Quantity',
    category_column: 'Category',
    barcode_column: 'Barcode'
  },
  wholesale: {
    sku_column: 'Item Number',
    name_column: 'Product Name',
    description_column: 'Description',
    price_column: 'Retail Price',
    cost_price_column: 'Wholesale Price',
    msrp_column: 'MSRP',
    inventory_column: 'Stock',
    category_column: 'Category'
  }
};

/**
 * Analyze headers from a vendor sheet and suggest field mappings
 */
export function analyzeHeaders(headers: string[]): HeaderAnalysisResult {
  const suggestions: HeaderSuggestion[] = [];
  const requiredFields = ['sku', 'name', 'price'];
  const requiredFieldsMissing: string[] = [];

  // Check for preset matches first
  let presetMatch: string | undefined;
  let bestPresetScore = 0;

  for (const [presetName, presetConfig] of Object.entries(PRESET_CONFIGS)) {
    const score = calculatePresetScore(headers, presetConfig);
    if (score > bestPresetScore && score > 0.7) {
      bestPresetScore = score;
      presetMatch = presetName;
    }
  }

  // Analyze each field
  for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
    const matches = findFieldMatches(headers, patterns);
    
    if (matches.length > 0) {
      const bestMatch = matches[0];
      suggestions.push({
        fieldName,
        column: bestMatch.column,
        confidence: bestMatch.confidence,
        alternativeColumns: matches.slice(1, 3).map(m => m.column)
      });
    } else if (requiredFields.includes(fieldName)) {
      requiredFieldsMissing.push(fieldName);
    }
  }

  // Calculate overall confidence
  const foundRequiredFields = requiredFields.filter(field => 
    suggestions.some(s => s.fieldName === field)
  );
  const confidence = foundRequiredFields.length / requiredFields.length;

  return {
    suggestions,
    requiredFieldsMissing,
    confidence,
    presetMatch
  };
}

/**
 * Extract headers from a CSV or Excel buffer
 */
export function extractHeaders(buffer: Buffer, fileExtension: string): Promise<string[]> {
  if (fileExtension === 'csv') {
    return extractCSVHeaders(buffer);
  } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
    return Promise.resolve(extractExcelHeaders(buffer));
  } else {
    throw new Error('Unsupported file type for header extraction');
  }
}

/**
 * Extract headers from CSV buffer
 */
function extractCSVHeaders(buffer: Buffer): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const stream = Readable.from(buffer);
    let headers: string[] = [];
    
    stream
      .pipe(csv())
      .on('headers', (headerList: string[]) => {
        headers = headerList;
      })
      .on('data', () => {
        // We only need the first row (headers), so end the stream
        resolve(headers);
      })
      .on('error', reject);
  });
}

/**
 * Extract headers from Excel buffer
 */
function extractExcelHeaders(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
  
  if (rows.length > 0) {
    return (rows[0] as string[]).filter(header => header && header.trim() !== '');
  }
  
  return [];
}

/**
 * Find matching columns for field patterns
 */
function findFieldMatches(headers: string[], patterns: RegExp[]): Array<{column: string, confidence: number}> {
  const matches: Array<{column: string, confidence: number}> = [];
  
  for (const header of headers) {
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      if (pattern.test(header.trim())) {
        // Higher confidence for patterns that appear earlier in the list
        const confidence = 1 - (i * 0.1);
        matches.push({ column: header, confidence });
        break;
      }
    }
  }
  
  // Sort by confidence
  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Calculate how well headers match a preset configuration
 */
function calculatePresetScore(headers: string[], presetConfig: DataSourceConfig): number {
  const configColumns = Object.values(presetConfig).filter(Boolean) as string[];
  const matchedColumns = configColumns.filter(col => 
    headers.some(header => header.toLowerCase() === col?.toLowerCase())
  );
  
  return matchedColumns.length / configColumns.length;
}

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

export async function parseExcel(buffer: Buffer, config: DataSourceConfig = {}, selectedSheets?: string[]): Promise<ParsedProduct[]> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  
  // If no sheets specified, use all sheets
  const sheetsToProcess = selectedSheets && selectedSheets.length > 0 
    ? selectedSheets.filter(sheetName => workbook.SheetNames.includes(sheetName))
    : [workbook.SheetNames[0]]; // Default to first sheet if none specified
  
  const allProducts: ParsedProduct[] = [];
  
  for (const sheetName of sheetsToProcess) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);
    const products = rows.map(row => mapRowToProduct(row, finalConfig)).filter(p => p.sku);
    allProducts.push(...products);
  }

  return allProducts;
}

export function getExcelSheetNames(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return workbook.SheetNames;
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

  if (config.cost_price_column && row[config.cost_price_column]) {
    const costPrice = parseFloat(String(row[config.cost_price_column]).replace(/[^0-9.-]/g, ''));
    if (!isNaN(costPrice)) {
      product.costPrice = costPrice;
    }
  }

  if (config.msrp_column && row[config.msrp_column]) {
    const msrp = parseFloat(String(row[config.msrp_column]).replace(/[^0-9.-]/g, ''));
    if (!isNaN(msrp)) {
      product.msrp = msrp;
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
export interface DashboardStats {
  activeVendors: number;
  syncedProducts: number;
  connectedStores: number;
  aiGenerated: number;
}

export interface WebSocketMessage {
  type: string;
  data: any;
}

export interface SyncStatus {
  id: number;
  vendorId: number;
  vendorName?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  totalItems: number;
  processedItems: number;
  startedAt?: string;
  completedAt?: string;
}

export interface AIContentRequest {
  productName: string;
  category?: string;
  keyFeatures?: string;
  brandVoice?: string;
  targetAudience?: string;
}

export interface GeneratedContent {
  title: string;
  description: string;
  seoTitle: string;
  metaDescription: string;
  bullets: string[];
  tags: string[];
}

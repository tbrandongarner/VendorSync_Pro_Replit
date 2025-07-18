import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

interface WebSocketMessage {
  type: string;
  data: any;
  userId?: string;
}

interface ConnectedClient {
  ws: WebSocket;
  userId?: string;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Map<string, ConnectedClient> = new Map();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws: WebSocket, request) => {
      const clientId = this.generateClientId();
      console.log(`WebSocket client connected: ${clientId}`);

      // Store the client
      this.clients.set(clientId, { ws });

      // Handle incoming messages
      ws.on('message', (data: Buffer) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          this.handleMessage(clientId, message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        console.log(`WebSocket client disconnected: ${clientId}`);
        this.clients.delete(clientId);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        this.clients.delete(clientId);
      });

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'connected',
        data: { message: 'Connected to VendorSync Pro WebSocket' }
      });
    });
  }

  private handleMessage(clientId: string, message: WebSocketMessage) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'authenticate':
        // Associate user ID with client
        client.userId = message.data.userId;
        this.clients.set(clientId, client);
        console.log(`Client ${clientId} authenticated as user ${message.data.userId}`);
        break;

      case 'ping':
        this.sendToClient(clientId, { type: 'pong', data: {} });
        break;

      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  }

  private generateClientId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  public sendToClient(clientId: string, message: WebSocketMessage) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  public sendToUser(userId: string, message: WebSocketMessage) {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    }
  }

  public broadcastToAll(message: WebSocketMessage) {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    }
  }

  // Sync status updates
  public sendSyncUpdate(userId: string, syncJob: any) {
    this.sendToUser(userId, {
      type: 'sync_update',
      data: syncJob
    });
  }

  // Activity updates
  public sendActivityUpdate(userId: string, activity: any) {
    this.sendToUser(userId, {
      type: 'activity_update',
      data: activity
    });
  }

  // Vendor updates
  public sendVendorUpdate(userId: string, vendor: any) {
    this.sendToUser(userId, {
      type: 'vendor_update',
      data: vendor
    });
  }

  // Product updates
  public sendProductUpdate(userId: string, product: any) {
    this.sendToUser(userId, {
      type: 'product_update',
      data: product
    });
  }

  public getConnectedClients(): number {
    return this.clients.size;
  }

  public getAuthenticatedUsers(): string[] {
    const users: string[] = [];
    for (const client of this.clients.values()) {
      if (client.userId && !users.includes(client.userId)) {
        users.push(client.userId);
      }
    }
    return users;
  }
}

let webSocketService: WebSocketService | null = null;

export function initWebSocketService(server: Server): WebSocketService {
  if (!webSocketService) {
    webSocketService = new WebSocketService(server);
  }
  return webSocketService;
}

export function getWebSocketService(): WebSocketService | null {
  return webSocketService;
}

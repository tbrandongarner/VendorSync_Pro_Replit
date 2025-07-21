# VendorSync Pro - Replit Development Guide

## Overview

VendorSync Pro is a comprehensive vendor management platform for Shopify that combines modern web technologies with AI-powered content generation and real-time synchronization capabilities. The application is built as a full-stack TypeScript solution with React frontend and Express backend.

**Latest Update (July 2025):** 
- Implemented file-based vendor data sources (CSV, Excel, Google Sheets)
- Added SKU-based product matching and synchronization
- Created file upload components with real-time validation
- Updated database schema to support flexible data source configurations
- Enhanced sync service to handle vendor product data from multiple sources
- Fixed sync system to pull only vendor-specific products (filtered by vendor name)
- Added advanced product filtering by brand, status (active/archived/draft)
- Implemented multiple view modes (cards, list, grid) for product management
- Added "Delete All Products" functionality for easy data cleanup and re-sync
- Created vendor-specific product deletion endpoints for targeted cleanup
- **MAJOR FIX (July 20, 2025):** Resolved pagination issue preventing sync of large catalogs
- Successfully implemented multi-page sync traversal (50+ pages, 50,000+ products)
- Fixed vendor filtering to use flexible matching (title contains, vendor field, tags)
- Successfully synced 48 Jackery products from large Shopify catalog
- **COMPLETE (July 20, 2025):** Built comprehensive product editing system
- Added edit buttons to all product views (cards, list, grid) with visual sync indicators
- Created full-featured product edit dialog with form validation
- Implemented change detection system that automatically marks products for re-sync
- Added "Sync Changes" button to process modified products
- System now tracks local modifications vs. Shopify data for targeted sync operations
- **COMPLETE (July 20, 2025):** Enhanced vendor management with file uploads and extended contact info
- Added logo upload functionality with multer integration and image preview
- Created additional vendor contact fields (phone, website, secondary contact)
- Updated vendor cards to display logos and comprehensive contact information
- Fixed FormData handling for proper file upload functionality
- **COMPLETE (July 20, 2025):** Added comprehensive department contact management
- Created support contact fields (email and phone) for customer service
- Added sales contact fields (email and phone) for business development
- Enhanced vendor cards to display all contact departments with appropriate icons
- Organized contact information in clear, categorized sections
- **COMPLETE (July 20, 2025):** Successfully tested vendor pricing sheet upload system
- Fixed CSV parser import issues and authentication handling
- Validated file upload with 5 products from test CSV (EcoFlow products)
- Confirmed SKU-based parsing with Shopify export format compatibility
- System ready for production vendor data synchronization
- **MAJOR ENHANCEMENT (July 21, 2025):** Implemented comprehensive conflict resolution system
- Added intelligent data precedence rules: vendor pricing authoritative for price/cost/MSRP/inventory
- Created conflict resolution engine that handles 3-way conflicts (vendor/local/Shopify)
- Built conflict resolution UI for manual intervention when auto-resolution fails
- Established SKU as single source of truth with mandatory fields (SKU, Price, Cost, MSRP)
- Implemented smart import modes: new products only, update existing only, or both
- Added tracking for data sources and modification timestamps for audit trail
- **CRITICAL FIX (July 21, 2025):** Resolved sync service implementation issues
- Fixed missing syncProducts method in ProductSyncService class
- Added comprehensive sync, inventory, pricing, and image update methods
- Corrected TypeScript compilation errors in schema definitions and storage layer
- Fixed Drizzle ORM query building issues and parameter mismatches
- Application now starts successfully with full synchronization functionality
- **COMPLETE (July 21, 2025):** Fixed synchronization page sync job creation
- Added missing getProductsByVendor method to storage interface and implementation
- Updated /api/sync/start endpoint to properly create and track sync jobs
- Fixed disconnect between vendor sync routes and synchronization page endpoints
- Sync operations from both vendor cards and synchronization page now create visible job records
- All sync functionality now properly tracks progress and appears in sync history
- **MAJOR IMPLEMENTATION (July 21, 2025):** Replaced simulated sync with real Shopify API integration
- Built comprehensive Shopify product fetching with multi-page pagination support
- Implemented intelligent vendor product filtering (title, vendor field, tags matching)
- Added real product creation and update logic with proper SKU-based deduplication
- Enhanced error handling and detailed logging for production Shopify synchronization
- System now performs actual data synchronization instead of just simulated operations
- **SUCCESS (July 21, 2025):** Completed successful production Shopify sync for EcoFlow vendor
- Successfully imported 165 EcoFlow products and updated 1 existing product from Shopify store
- Confirmed full end-to-end functionality: vendor filtering, product creation, job tracking, and progress reporting
- Synchronization system is now fully operational for production use

## User Preferences

Preferred communication style: Simple, everyday language.

**Vendor Data Management Requirements:**
- SKU is the single source of truth for product matching
- Mandatory fields: SKU, Price, Cost, MSRP
- Optional fields: Product name, description, quantity, photos, tags, collections
- Vendor pricing sheets come in different formats but must support flexible parsing
- System should update existing products and create new ones based on SKU presence
- Always show which products are pending sync before synchronization

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Framework**: Radix UI components with Tailwind CSS for styling
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for client-side routing
- **Styling**: Tailwind CSS with shadcn/ui component library (New York variant)

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Replit Auth with OpenID Connect
- **Session Management**: Express sessions with PostgreSQL store
- **Real-time Communication**: WebSocket support for live updates
- **API**: RESTful endpoints with comprehensive error handling

### Database Architecture
- **ORM**: Drizzle ORM with TypeScript schema definitions
- **Database**: PostgreSQL (using Neon serverless)
- **Schema**: Located in `/shared/schema.ts` with proper relations
- **Migrations**: Drizzle Kit for schema management

## Key Components

### Core Entities
1. **Users**: Mandatory for Replit Auth integration
2. **Vendors**: Partner management with contact info and API configurations
3. **Stores**: Shopify store connections with access tokens
4. **Products**: Inventory items with vendor and store associations
5. **Sync Jobs**: Real-time synchronization tracking
6. **AI Generations**: Content generation history and analytics

### Authentication System
- **Provider**: Replit Auth (mandatory)
- **Session Storage**: PostgreSQL-backed sessions
- **Security**: HTTPS-only cookies with proper expiration
- **User Management**: Automatic user creation and profile management

### Real-time Features
- **WebSocket Service**: Bidirectional communication for live updates
- **Event Broadcasting**: Sync progress, activity feeds, and notifications
- **Connection Management**: Automatic reconnection and user authentication

### AI Integration
- **Provider**: OpenAI GPT-4o for content generation
- **Features**: Product descriptions, SEO optimization, and bulk content creation
- **Analytics**: Generation tracking and success metrics

## Data Flow

### User Authentication Flow
1. User accesses protected route
2. Replit Auth middleware validates session
3. User data retrieved from PostgreSQL
4. Frontend receives user profile and permissions

### Vendor Management Flow
1. User creates/updates vendor profile
2. API credentials validated and stored
3. Sync capabilities initialized
4. Real-time status updates via WebSocket

### Product Synchronization Flow
1. User initiates sync job
2. Background process connects to vendor API
3. Product data fetched and normalized
4. Shopify store updated via API
5. Progress broadcasted via WebSocket
6. Activity logged for analytics

### AI Content Generation Flow
1. User submits product information
2. OpenAI API processes content request
3. Generated content stored in database
4. Results returned to frontend
5. Analytics updated for reporting

## External Dependencies

### Required Services
- **Database**: PostgreSQL (Neon serverless recommended)
- **Authentication**: Replit Auth (automatically configured)
- **AI Service**: OpenAI API (requires API key)
- **File Storage**: Local file system or cloud storage

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Session encryption key
- `OPENAI_API_KEY`: OpenAI API access token
- `REPLIT_DOMAINS`: Allowed domains for auth
- `ISSUER_URL`: OpenID Connect issuer URL

### Third-party Integrations
- **Shopify**: Store management and product sync
- **OpenAI**: AI content generation
- **Neon**: Serverless PostgreSQL hosting
- **Replit**: Authentication and deployment platform

## Deployment Strategy

### Development Setup
1. Environment variables configured automatically by Replit
2. Database provisioned via Neon integration
3. Development server runs on port 3000
4. Hot reload enabled for both frontend and backend

### Production Build
1. Frontend built with Vite optimization
2. Backend bundled with esbuild
3. Static assets served from `/dist/public`
4. Production server configured for optimal performance

### Database Management
- **Schema**: Managed via Drizzle migrations
- **Seeding**: Automatic user creation via auth flow
- **Backup**: Handled by Neon platform
- **Scaling**: Serverless architecture auto-scales

### Monitoring and Logging
- **Request Logging**: Comprehensive API request tracking
- **Error Handling**: Centralized error management
- **Performance**: Real-time metrics via WebSocket
- **Activity Tracking**: User action logging for analytics

### Security Considerations
- **Authentication**: Mandatory Replit Auth integration
- **Session Security**: HTTPs-only cookies with proper expiration
- **API Security**: Request validation and rate limiting
- **Data Protection**: Encrypted sensitive data storage
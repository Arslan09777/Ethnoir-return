# Ethnoir India - Custom Shopify Return & Replacement System

A custom, end-to-end Return & Replacement web application designed for **Ethnoir India** (`ethnoirindia.myshopify.com`), directly integrated with **Shopify GraphQL Admin API (2026-07)** and **Shiprocket Logistics REST API**, without relying on any paid Shopify return-management apps.

---

## 🌟 Key Features

### 🛍️ Customer Experience Portal
- **Order Lookup**: Fast verification using Shopify Order Number (`#1001` or `1001`) and registered email or mobile number.
- **Return Eligibility Verification**:
  - Fulfillment status validation (order must be fulfilled/delivered).
  - Configurable return window checking (default **7 days**).
  - Product-level non-returnable / final sale tag inspection.
  - Remaining eligible unit enforcement (preventing returns exceeding purchased quantities).
- **Flexible Options**:
  - **Return & Refund**: Direct refund via Shopify GraphQL `refundCreate` API (Original Payment Method, Store Credit, or Manual Bank/UPI).
  - **Replacement / Exchange**: Real-time variant picker (size/color) with Shopify variant inventory checks.
- **Structured Reasons & Proof**:
  - Select reasons: *Damaged product*, *Wrong product received*, *Size/fit issue*, *Missing item*, *Quality issue*, or *Other*.
  - Upload up to 5 photos (max 5MB each, JPEG/PNG/WEBP) with instant previews.
- **Unique Tracking Code**: Immediate confirmation with formatted tracking identifier (e.g. `RET-2026-0001`).
- **Interactive Multi-Step Progress Tracker**:
  `Submitted` ➔ `Approved` ➔ `Pickup Scheduled` ➔ `Picked Up` ➔ `Received at Warehouse` ➔ `Refund Processed / Replacement Shipped` ➔ `Completed`

### 🛡️ Merchant Admin Dashboard
- **Protected Access**: Secure HTTP-only cookie JWT session authentication (`admin@ethnoirindia.com`).
- **Real-Time KPI Cards**:
  - New Requests
  - Approved Requests
  - Reverse Pickup Pending
  - Returned Items Received at Warehouse
  - Refund Pending
  - Replacement Pending
- **Filterable Operations Table**: Filter by status, type (Return vs Replacement), search by Order Number, Customer Email, or AWB.
- **Comprehensive Request Management Drawer**:
  - Shopify order details & customer delivery address.
  - Item details & requested quantities.
  - Customer comments and uploaded photo proof gallery.
  - Complete status audit trail with timestamps and actors.
  - Internal staff notes.
- **One-Click Workflow Actions**:
  - **Approve**: Triggers Shopify GraphQL `returnCreate` mutation.
  - **Reject with Reason**: Logs internal note & sends email to customer with explanation.
  - **Schedule Reverse Pickup**: Calls Shiprocket `POST /orders/create/return`, assigns reverse AWB, and generates courier tracking link.
  - **Mark Received**: Records physical inspection at warehouse.
  - **Process Refund**: Executes Shopify GraphQL `refundCreate` API with selected refund method.
  - **Dispatch Replacement**: Calls Shiprocket `POST /orders/create/adhoc` for forward replacement shipment.
  - **Close Request**: Finalizes lifecycle as Completed.
- **Store Rules & Policy Settings**:
  - Configurable return window days (1–90 days).
  - Auto-approve returns toggle.
  - Photo upload requirement toggle.
  - Default refund method selector.
  - Shiprocket warehouse pickup location nickname selector.
  - Customer-facing return policy editor.
- **Integration Diagnostics Modal**:
  - Tests live connectivity to Shopify GraphQL Admin API and Shiprocket.
  - Identifies whether the app is running in **LIVE SHOPIFY** or **DEMO MOCK MODE**.
  - Highlights account-specific Shiprocket requirements.

---

## 🛠️ Architecture & Tech Stack

- **Runtime & Language**: Node.js 20+ / 24+ & TypeScript
- **Backend**: Express 5 with Raw-body HMAC verification, Helmet security headers, rate limiting (`express-rate-limit`), Multer image uploads, and cookie-based JWT sessions.
- **Database & ORM**: Prisma ORM with dual-engine support:
  - **SQLite** (`file:./dev.db`) for zero-dependency local development and testing.
  - **PostgreSQL** (`prisma/schema.postgresql.prisma`) for production cloud databases (Neon, Supabase, AWS RDS, DigitalOcean).
- **Frontend**: React 19, Tailwind CSS v4, Lucide Icons, Vite.
- **Shopify Integration**: GraphQL Admin API (`2026-07`).
- **Logistics Integration**: Shiprocket REST API with token caching and error isolation.
- **Testing**: Vitest unit test suite verifying return eligibility rules, window expiration, quantity boundaries, and duplicate return prevention.

---

## 🚀 Quick Start & Local Development

### 1. Clone & Install Dependencies
```bash
git clone <your-repo-url>
cd "RETURN AND REFUND"

# Install all dependencies
npm install
```

### 2. Configure Environment Variables
Copy the template to your `.env` file:
```bash
cp .env.example .env
```
Open `.env` and fill in your keys:
```env
SHOPIFY_SHOP=ethnoirindia.myshopify.com
SHOPIFY_API_VERSION=2026-07
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxx
SHOPIFY_CLIENT_SECRET=shpss_xxxxxxxxxxxxxxxxxxxx

SHIPROCKET_API_BASE=https://apiv2.shiprocket.in/v1/external
SHIPROCKET_EMAIL=merchant@ethnoirindia.com
SHIPROCKET_PASSWORD=your_shiprocket_password
SHIPROCKET_PICKUP_LOCATION_NAME=Primary Warehouse

DATABASE_URL="file:./dev.db"
SESSION_SECRET=a-secure-random-secret-key
PORT=5000
RETURN_WINDOW_DAYS=7
```
> **Production Live System**: The system is fully integrated with live Shopify GraphQL Admin API and Shiprocket. Live orders are looked up in real-time, reverse pickups are manifested directly on Shiprocket, and refunds are processed via Shopify GraphQL mutations.

### 3. Initialize Database
```bash
# Push schema to SQLite local database
npm run prisma:push

# Generate Prisma Client
npm run prisma:generate
```

### 4. Run the Application Locally
You can run in full development mode (server + Vite client):
```bash
npm run dev
```
Or build the client and run the unified server on port `5000`:
```bash
npm run build
npm start
```
Access the application in your browser:
- **Customer Portal**: [http://localhost:5000/](http://localhost:5000/)
- **Admin Portal**: [http://localhost:5000/](http://localhost:5000/) (Click "Admin Portal" in navbar)
  - Default Admin Email: `admin@ethnoirindia.com`
  - Default Admin Password: `Admin@Ethnoir2026!`
- **Health Check & Diagnostics**: [http://localhost:5000/api/health](http://localhost:5000/api/health)

---

## 🧪 Running Unit Tests

Run the Vitest test suite covering return eligibility, expiry windows, non-returnable flags, and duplicate return prevention:
```bash
npm test
```

---

## 📦 Shopify & Shiprocket Webhook Configuration

### 1. Shopify Webhooks
Configure Shopify webhooks in your Shopify Partner Dashboard or Shopify Admin (`Settings > Notifications > Webhooks`):
- **Address**: `https://<your-app-domain>/api/webhooks/shopify`
- **Format**: JSON
- **Events to Subscribe**:
  - `orders/fulfilled`
  - `orders/cancelled`
  - `refunds/create`
  - `products/update`
  - `inventory_levels/update`
  - `app/uninstalled`

### 2. Shiprocket Tracking Webhook
In Shiprocket Panel (`Settings > Webhooks`):
- **Address**: `https://<your-app-domain>/api/webhooks/shiprocket`
- **Event**: Order Tracking Updates

---

## 🚢 Production Deployment Instructions (PostgreSQL)

1. **Deploy to Render, Railway, or VPS**:
   - Set environment variable `DATABASE_URL` to your PostgreSQL database (e.g. Supabase, Neon, or RDS):
     ```env
     DATABASE_URL="postgresql://user:password@host:5432/ethnoir_returns?schema=public"
     NODE_ENV=production
     ```
2. **Push PostgreSQL Schema**:
   ```bash
   npm run prisma:pg:push
   ```
3. **Build & Start**:
   ```bash
   npm run build
   npm start
   ```

---

## 🔒 Security Best Practices
- **HMAC Verification**: Shopify webhook signatures are verified using raw UTF-8 request bodies.
- **Idempotency**: Webhook events, reverse pickups, and replacement shipments use unique keys to prevent duplicate operations.
- **Data Privacy**: Customer portal endpoints only return data matching the authenticated order and contact number.
- **Secret Protection**: API tokens are read exclusively from environment variables and never exposed to the frontend.

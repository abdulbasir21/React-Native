# StockPilot AI

**Offline-First POS, Inventory Management & AI Business Copilot for Retail Shops**

StockPilot AI is a full-stack mobile commerce and inventory platform built with **React Native (Expo)** and **Express + Prisma + PostgreSQL**. Designed for retail shop owners, it works seamlessly offline using local SQLite transactions, syncs reliably to PostgreSQL, enforces exact decimal accounting, and provides a grounded AI Business Assistant powered by **Google Gemini** and **LangGraph.js**.

---

## Key Features

- **Point of Sale (POS) & Receipts**
  - Fast product search, category filtering, price overrides, and line/cart discounts (fixed or percentage with exact remainder allocation)
  - Multi-method payments (`CASH`, `CARD`, `BANK_TRANSFER`, `MOBILE_WALLET`, `CREDIT`) with automatic change due and partial balance tracking
  - Printable/shareable PDF receipts (`expo-print` & `expo-sharing`)
- **Inventory & Weighted Average Costing**
  - Immutable `StockMovement` ledger (sales, purchases, returns, cancellations, write-offs, adjustments)
  - Real-time weighted average cost (`averageCost`) and `lastPurchaseCost` updates
  - Low-stock alerts and unit-aware decimal quantity validation (`PIECE`, `PACK`, `DOZEN`, `BOX`, `KG`, `LITRE`, `METRE`)
- **Purchases, Suppliers, Customers & Expenses**
  - Supplier purchase orders with automatic oldest-first (FIFO) payable allocation
  - Customer credit balances with oldest-first payment allocation
  - Partial/full sale returns and cancellations with full audit trail (`AuditLog`)
  - Categorized business expense tracking in the shop's local timezone
- **Offline-First Sync Engine**
  - Atomic local SQLite writes (`expo-sqlite`) paired with a persistent `sync_outbox`
  - Automatic background sync on reconnect/foreground with exponential retry backoff and server-truth reconciliation
- **AI Business Assistant**
  - Grounded Q&A over live sales, profit, inventory valuation, slow-moving stock, and balances via 9 read-only tools
  - Safe write proposals (sales, expenses, stock adjustments) requiring explicit owner confirmation before execution
- **Reports & Analytics**
  - Home dashboard with 7-day sales chart, profit vs. cash collected, and pending receivables/payables
  - 8 report views (Profit & Loss, Sales, Purchases, Expenses, Product Performance, Inventory Valuation, Balances, Write-offs) with custom date ranges

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Mobile App** | React Native `0.81`, Expo SDK `54`, Expo Router `6`, NativeWind `4`, TanStack Query, Zustand, React Hook Form + Zod, `expo-sqlite`, `expo-secure-store`, `expo-print`, `react-native-gifted-charts` |
| **Backend API** | Node.js `22`, Express `4`, TypeScript, Prisma ORM `6`, PostgreSQL (Neon), Zod, `decimal.js`, `bcryptjs`, `jsonwebtoken`, `helmet`, `express-rate-limit` |
| **AI Engine** | `@google/genai`, `@langchain/langgraph`, `@langchain/core` |
| **Testing** | Vitest, Supertest, Node `node:sqlite` |

---

## Project Structure

```text
STOCKPILOT AI/
├── mobile/                 # React Native + Expo Router mobile app
│   ├── app/                # File-based routes (auth, tabs, POS, inventory, reports, AI, sync)
│   ├── src/
│   │   ├── api/            # Axios client & API endpoints
│   │   ├── components/     # Reusable UI components & animations
│   │   ├── db/             # Local SQLite schema, migrations & transactional services
│   │   ├── repositories/   # Data access & offline fallback layer
│   │   ├── shared/         # Exact decimal money & business calculation helpers
│   │   ├── stores/         # Zustand state stores (session, cart, sync)
│   │   ├── sync/           # Outbox state machine & sync engine
│   │   └── theme/          # Design tokens
│   └── eas.json            # Expo EAS Build profiles (APK & AAB)
├── server/                 # Express + Prisma + PostgreSQL backend
│   ├── prisma/             # Schema, migrations & demo seed runner
│   ├── src/
│   │   ├── controllers/    # HTTP request handlers
│   │   ├── middleware/     # JWT auth, Zod validation, rate limiter, error handler
│   │   ├── routes/         # Versioned /api/v1/* routes
│   │   ├── services/       # Core business logic, AI tools, sync & seed services
│   │   └── shared/         # Shared exact decimal & calculation modules
│   └── Dockerfile          # Multi-stage production container
└── docs/                   # API reference, deployment guide & demo script
```

---

## Getting Started

### 1. Backend Setup (`server/`)

```bash
cd server
npm install
cp .env.example .env
# Fill DATABASE_URL, Test_DATABASE_URL, JWT_SECRET, and Gemini_Key in server/.env

npx prisma generate
npx prisma migrate deploy
npm run seed          # Seeds demo@stockpilot.app / Demo@1234 (idempotent)
npm run dev           # Starts API at http://localhost:4000
```

### 2. Mobile App Setup (`mobile/`)

```bash
cd mobile
npm install
cp .env.example .env
# Set EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:4000/api/v1 in mobile/.env

npx expo start
```

### 3. Demo Account

- **Email:** `demo@stockpilot.app`
- **Password:** `Demo@1234`
- **Shop:** Al-Madina Mobile Accessories (5 categories, 24 products, 4 suppliers, 6 customers, 10 purchases, 60 sales, 25 expenses)

See [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md) for a 16-step walkthrough.

---

## Verification & Tests

```bash
# Backend
cd server
npm run typecheck
npm run lint
npm test

# Mobile
cd mobile
npm run typecheck
npm run lint
npm test
```

---

## Documentation

- [API Reference](./docs/API.md)
- [Deployment Guide (Render, Docker & EAS Android)](./docs/DEPLOYMENT.md)
- [16-Step Demo Script](./docs/DEMO_SCRIPT.md)
- [Design Tokens](./docs/design-tokens.md)

# React Native Projects

A collection of production-grade **React Native & Expo** mobile applications, paired with scalable backends, offline-first storage, and AI integrations.

---

## Projects

### 1. [StockPilot AI](./STOCKPILOT%20AI)
**Offline-First POS, Inventory & AI Business Copilot for Retail Shops**

- **Mobile Stack:** React Native, Expo (SDK 54), Expo Router, NativeWind, TanStack Query, Zustand, Expo SQLite, Expo Print/Sharing
- **Backend Stack:** Node.js, Express, TypeScript, Prisma ORM, PostgreSQL (Neon), Zod, Decimal.js, LangGraph.js, Google Gemini API
- **Highlights:**
  - Offline-first POS & Inventory with transactional SQLite outbox sync and server-truth reconciliation
  - Exact decimal accounting (`decimal.js`, round-half-up), weighted average costing, FIFO supplier/customer payment allocation, partial returns & cancellations
  - AI Business Assistant grounded in live tool calls with explicit human confirmation for write actions
  - Multi-tenant shop isolation, JWT auth, Helmet security headers, and login rate limiting

👉 See [StockPilot AI README](./STOCKPILOT%20AI/README.md) for full documentation, setup, and demo guide.

---

## License

Each project directory contains its own setup, documentation, and configuration.

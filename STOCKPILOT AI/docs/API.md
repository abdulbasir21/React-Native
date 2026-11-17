# StockPilot AI — API Reference (`/api/v1`)

All authenticated routes require `Authorization: Bearer <token>` and enforce `shopId` isolation from the JWT.

| Group | Method & Path | Purpose |
|---|---|---|
| Health | `GET /health`, `GET /api/v1/health` | Service health check |
| Auth | `POST /api/v1/auth/register` | Register OWNER + Shop |
| Auth | `POST /api/v1/auth/login` | Login (rate-limited) |
| Shop | `GET /api/v1/shop`, `PATCH /api/v1/shop` | Get/update shop settings |
| Categories | `GET/POST /api/v1/categories`, `PATCH/DELETE /api/v1/categories/:id` | Category CRUD |
| Products | `GET/POST /api/v1/products`, `GET/PATCH /api/v1/products/:id`, `POST /api/v1/products/:id/archive`, `POST /api/v1/products/:id/adjust-stock` | Product CRUD, archive, stock adjustment |
| Movements | `GET /api/v1/stock-movements` | Audit trail of stock movements |
| Customers | `GET/POST /api/v1/customers`, `GET/PATCH /api/v1/customers/:id`, `POST /api/v1/customers/:id/archive`, `POST /api/v1/customers/:id/receive-payment`, `GET /api/v1/customers/:id/sales`, `GET /api/v1/customers/:id/payments` | Customer ledger & oldest-first payment allocation |
| Suppliers | `GET/POST /api/v1/suppliers`, `GET/PATCH /api/v1/suppliers/:id`, `POST /api/v1/suppliers/:id/archive`, `POST /api/v1/suppliers/:id/pay` | Supplier ledger & oldest-first payment |
| Purchases | `GET/POST /api/v1/purchases`, `GET /api/v1/purchases/:id`, `POST /api/v1/purchases/:id/payments` | Purchases (weighted avg cost) |
| Sales | `GET/POST /api/v1/sales`, `GET /api/v1/sales/:id`, `GET /api/v1/sales/:id/receipt`, `POST /api/v1/sales/:id/payments`, `POST /api/v1/sales/:id/returns`, `POST /api/v1/sales/:id/cancel` | POS sales, receipts, returns, cancellations |
| Expenses | `GET/POST /api/v1/expenses`, `PATCH /api/v1/expenses/:id` | Operating expenses (audited edit, no delete) |
| Reports | `GET /api/v1/dashboard`, `GET /api/v1/reports/{sales,purchases,expenses,profit,products,inventory-valuation,balances,write-offs}` | Dashboard & financial reports |
| Sync | `POST /api/v1/sync/push`, `GET /api/v1/sync/pull` | Offline outbox push & delta pull |
| AI | `POST /api/v1/ai/chat`, `GET /api/v1/ai/conversations`, `POST /api/v1/ai/actions/:id/confirm`, `POST /api/v1/ai/actions/:id/reject` | AI assistant & action confirmation |

# StockPilot AI — 16-Step Demo Script

**Demo Account:** `demo@stockpilot.app` / `Demo@1234` (Al-Madina Mobile Accessories)

1. **Login**: Open the app and sign in with `demo@stockpilot.app` / `Demo@1234`.
2. **Home Dashboard**: Inspect Today's Sales, Cash Collected, Low-Stock count, Pending Payables/Receivables, and 7-day trend chart.
3. **Products & Inventory**: Open the **Inventory** tab, search `"Earbuds"`, and view `TWS Wireless Earbuds Pro` stock level, average cost, and movement history.
4. **Stock Adjustment / Write-off**: Record a `-1` damaged write-off with a reason and verify stock decrements with a `StockMovement` entry.
5. **Quick Cash Sale (POS)**: Open **POS**, add `20W USB-C Fast Adapter` (qty 2) and `9D Tempered Glass iPhone 15` (qty 1), apply a line discount, complete with `CASH`.
6. **PDF Receipt**: Tap **Print / Share Receipt** on the completed sale to preview/export the formatted PDF invoice.
7. **Credit Sale**: Create a second sale for a named customer (`Bilal Telecom` or similar seeded customer) with partial payment (`PARTIAL`) and confirm customer balance due updates.
8. **Customer Payment Allocation**: Open **More -> Customers**, select the customer, and record a payment; verify FIFO allocation reduces oldest unpaid sale balance first.
9. **Purchase & Weighted Average Cost**: Open **More -> Purchases**, create a confirmed purchase for `20W USB-C Fast Adapter` at a higher unit cost, and verify `averageCost` updates via weighted average.
10. **Expenses**: Open **More -> Expenses**, log a `UTILITIES` expense, and confirm it appears in the list.
11. **Reports**: Open the **Reports** tab, switch ranges (`Today`, `7 Days`, `30 Days`), and check Sales, Profit & Loss, Inventory Valuation, and Balances.
12. **AI Business Assistant (Read)**: Open **AI Assistant** from Home or More, ask `"What are my top 5 selling products this month?"`, and verify grounded numbers (`actualFigures`).
13. **AI Write Proposal & Confirmation**: Ask `"Record a sale of 1 20W USB-C Fast Adapter for cash"`, inspect the pending confirmation card, and tap **Confirm** (no data changes before confirmation).
14. **Offline Mode**: Enable Airplane Mode (or disconnect network), record a POS sale offline, and observe the `Pending Sync` banner.
15. **Reconnect & Sync**: Re-enable network, tap **Sync Now** (or foreground the app), and verify the outbox flushes cleanly to the server.
16. **Sync Conflict / Audit Check**: Open **More -> Sync Status** to confirm zero pending/failed items remain.

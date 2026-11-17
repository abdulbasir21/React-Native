export interface SqliteMigration {
  version: number;
  sql: string;
}

export const SQLITE_MIGRATIONS: SqliteMigration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        shop_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY NOT NULL,
        shop_id TEXT NOT NULL,
        category_id TEXT,
        name TEXT NOT NULL,
        sku TEXT,
        description TEXT,
        unit TEXT NOT NULL,
        purchase_cost_cents INTEGER NOT NULL,
        last_purchase_cost_cents INTEGER NOT NULL,
        selling_price_cents INTEGER NOT NULL,
        quantity_milli INTEGER NOT NULL,
        average_cost_micro INTEGER NOT NULL,
        min_stock_milli INTEGER NOT NULL,
        image_uri TEXT,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY NOT NULL,
        shop_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY NOT NULL,
        shop_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        notes TEXT,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY NOT NULL,
        shop_id TEXT NOT NULL,
        customer_id TEXT,
        receipt_no TEXT NOT NULL,
        status TEXT NOT NULL,
        subtotal_cents INTEGER NOT NULL,
        discount_amount_cents INTEGER NOT NULL,
        total_cents INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        cancelled_at TEXT,
        cancel_reason TEXT,
        note TEXT,
        warnings_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY NOT NULL,
        sale_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name_snapshot TEXT NOT NULL,
        unit_snapshot TEXT NOT NULL,
        quantity_milli INTEGER NOT NULL,
        unit_price_cents INTEGER NOT NULL,
        line_subtotal_cents INTEGER NOT NULL,
        allocated_discount_cents INTEGER NOT NULL,
        line_net_cents INTEGER NOT NULL,
        unit_cost_snapshot_micro INTEGER NOT NULL,
        line_cogs_cents INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sale_returns (
        id TEXT PRIMARY KEY NOT NULL,
        shop_id TEXT NOT NULL,
        sale_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sale_return_items (
        id TEXT PRIMARY KEY NOT NULL,
        sale_return_id TEXT NOT NULL,
        sale_item_id TEXT NOT NULL,
        quantity_milli INTEGER NOT NULL,
        refund_value_cents INTEGER NOT NULL,
        cogs_reversed_cents INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY NOT NULL,
        shop_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        total_cents INTEGER NOT NULL,
        idempotency_key TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS purchase_items (
        id TEXT PRIMARY KEY NOT NULL,
        purchase_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name_snapshot TEXT NOT NULL,
        quantity_milli INTEGER NOT NULL,
        unit_cost_cents INTEGER NOT NULL,
        line_total_cents INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY NOT NULL,
        shop_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        direction TEXT NOT NULL,
        method TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        paid_at TEXT NOT NULL,
        sale_id TEXT,
        purchase_id TEXT,
        note TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY NOT NULL,
        shop_id TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        expense_date TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY NOT NULL,
        shop_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        type TEXT NOT NULL,
        quantity_change_milli INTEGER NOT NULL,
        previous_qty_milli INTEGER NOT NULL,
        new_qty_milli INTEGER NOT NULL,
        sale_id TEXT,
        purchase_id TEXT,
        sale_return_id TEXT,
        reason TEXT,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY NOT NULL,
        seq INTEGER NOT NULL,
        shop_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        depends_on_entity_id TEXT,
        idempotency_key TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        next_retry_at INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_seq ON sync_outbox (status, seq);

      CREATE TABLE IF NOT EXISTS sync_state (
        shop_id TEXT PRIMARY KEY NOT NULL,
        last_pulled_at TEXT,
        last_successful_sync_at TEXT,
        initial_pull_completed INTEGER NOT NULL DEFAULT 0,
        next_seq INTEGER NOT NULL DEFAULT 1
      );
    `,
  },
];

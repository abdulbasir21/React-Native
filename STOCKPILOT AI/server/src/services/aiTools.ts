import { z } from 'zod';
import { badRequest } from '../lib/errors.js';
import { EXPENSE_CATEGORIES, NON_CREDIT_PAYMENT_METHODS, PAYMENT_METHODS, UNITS } from '../shared/enums.js';
import { dec, round2 } from '../shared/money.js';
import { proposeAction } from './aiActionService.js';
import { getAiReadCache, setAiReadCache } from './aiCache.js';
import { getProductById, listProducts } from './productService.js';
import {
  getBalancesReport,
  getExpenseReport,
  getInventoryValuationReport,
  getProductPerformanceReport,
  getProfitReport,
  getSalesReport,
} from './reportService.js';
import { listSuppliers } from './supplierService.js';

export const AI_READ_TOOL_NAMES = [
  'searchProducts',
  'getInventory',
  'getProductDetails',
  'getSalesReport',
  'getProfitReport',
  'getExpenseReport',
  'getLowStockProducts',
  'getSlowMovingProducts',
  'getSupplierBalance',
] as const;

export const AI_WRITE_TOOL_NAMES = [
  'createProduct',
  'updateProduct',
  'recordSale',
  'recordPurchase',
  'recordExpense',
] as const;

export type AIReadToolName = (typeof AI_READ_TOOL_NAMES)[number];
export type AIWriteToolName = (typeof AI_WRITE_TOOL_NAMES)[number];
export type AIToolName = AIReadToolName | AIWriteToolName;

const periodFilterSchema = z
  .object({
    period: z.enum(['today', 'week', 'month']).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

const searchProductsSchema = z
  .object({
    query: z.string().min(1).max(100),
    includeArchived: z.boolean().optional(),
  })
  .strict();

const getInventorySchema = z.object({}).strict();

const getProductDetailsSchema = z
  .object({
    productId: z.string().uuid().optional(),
    name: z.string().min(1).max(100).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.productId || v.name), {
    message: 'Either productId or name is required',
  });

const getSupplierBalanceSchema = z
  .object({
    supplierId: z.string().uuid().optional(),
    name: z.string().min(1).max(100).optional(),
  })
  .strict();

const createProductToolSchema = z
  .object({
    name: z.string().min(1).max(150),
    unit: z.enum(UNITS).default('PIECE'),
    purchaseCost: z.string().min(1),
    sellingPrice: z.string().min(1),
    initialQuantity: z.string().optional(),
    minStockLevel: z.string().optional(),
    sku: z.string().optional(),
  })
  .strict();

const updateProductToolSchema = z
  .object({
    productId: z.string().uuid(),
    name: z.string().min(1).max(150).optional(),
    purchaseCost: z.string().min(1).optional(),
    sellingPrice: z.string().min(1).optional(),
    minStockLevel: z.string().optional(),
  })
  .strict();

const recordSaleToolSchema = z
  .object({
    customerId: z.string().uuid().nullable().optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).default('CASH'),
    amountReceived: z.string().optional(),
    note: z.string().optional(),
    items: z
      .array(
        z
          .object({
            productId: z.string().uuid(),
            quantity: z.string().min(1),
            unitPrice: z.string().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

const recordPurchaseToolSchema = z
  .object({
    supplierId: z.string().uuid(),
    amountPaid: z.string().optional(),
    paymentMethod: z.enum(NON_CREDIT_PAYMENT_METHODS).optional(),
    note: z.string().optional(),
    items: z
      .array(
        z
          .object({
            productId: z.string().uuid(),
            quantity: z.string().min(1),
            unitCost: z.string().min(1),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

const recordExpenseToolSchema = z
  .object({
    title: z.string().min(1).max(150),
    category: z.enum(EXPENSE_CATEGORIES).default('OTHER'),
    amount: z.string().min(1),
    expenseDate: z.string().optional(),
    paymentMethod: z.enum(NON_CREDIT_PAYMENT_METHODS).default('CASH'),
    description: z.string().optional(),
  })
  .strict();

function parseToolArgs<T>(schema: z.ZodType<T>, rawArgs: unknown, toolName: string): T {
  const parsed = schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    throw badRequest(
      `Invalid arguments for tool ${toolName}: ${parsed.error.issues[0]?.message ?? 'validation failed'}`,
      parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return parsed.data;
}

export interface ToolExecutionContext {
  shopId: string;
  conversationId?: string | null;
}

export async function executeAiTool(
  ctx: ToolExecutionContext,
  toolName: string,
  rawArgs: unknown,
): Promise<{
  kind: 'READ' | 'PROPOSAL';
  toolName: AIToolName;
  data: unknown;
}> {
  const isRead = (AI_READ_TOOL_NAMES as readonly string[]).includes(toolName);
  const isWrite = (AI_WRITE_TOOL_NAMES as readonly string[]).includes(toolName);

  if (!isRead && !isWrite) {
    throw badRequest(`Unknown AI tool: ${toolName}`);
  }

  if (isRead) {
    const cacheKey = `${toolName}:${JSON.stringify(rawArgs ?? {})}`;
    const cached = getAiReadCache<unknown>(ctx.shopId, cacheKey);
    if (cached !== undefined) {
      return { kind: 'READ', toolName: toolName as AIReadToolName, data: cached };
    }

    let data: unknown;
    switch (toolName as AIReadToolName) {
      case 'searchProducts': {
        const args = parseToolArgs(searchProductsSchema, rawArgs, toolName);
        data = await listProducts(ctx.shopId, {
          search: args.query,
          includeArchived: args.includeArchived ?? false,
          page: 1,
          pageSize: 20,
        });
        break;
      }

      case 'getInventory': {
        parseToolArgs(getInventorySchema, rawArgs, toolName);
        data = await getInventoryValuationReport(ctx.shopId);
        break;
      }

      case 'getProductDetails': {
        const args = parseToolArgs(getProductDetailsSchema, rawArgs, toolName);
        if (args.productId) {
          data = await getProductById(ctx.shopId, args.productId);
        } else {
          const matches = await listProducts(ctx.shopId, {
            search: args.name,
            page: 1,
            pageSize: 10,
          });
          if (matches.items.length === 0) {
            data = { found: false, message: `No product found matching "${args.name}"` };
          } else if (matches.items.length > 1) {
            // BR-AI10: ambiguous product name returns a choice request
            data = {
              ambiguous: true,
              message: `Multiple products match "${args.name}". Please choose one:`,
              choices: matches.items.map((p) => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                sellingPrice: p.sellingPrice,
                quantityOnHand: p.quantityOnHand,
              })),
            };
          } else {
            data = matches.items[0];
          }
        }
        break;
      }

      case 'getSalesReport': {
        const args = parseToolArgs(periodFilterSchema, rawArgs, toolName);
        data = await getSalesReport(ctx.shopId, args);
        break;
      }

      case 'getProfitReport': {
        const args = parseToolArgs(periodFilterSchema, rawArgs, toolName);
        data = await getProfitReport(ctx.shopId, args);
        break;
      }

      case 'getExpenseReport': {
        const args = parseToolArgs(periodFilterSchema, rawArgs, toolName);
        data = await getExpenseReport(ctx.shopId, args);
        break;
      }

      case 'getLowStockProducts': {
        parseToolArgs(getInventorySchema, rawArgs, toolName);
        const perf = await getProductPerformanceReport(ctx.shopId, { period: 'month' });
        data = { lowStock: perf.lowStock };
        break;
      }

      case 'getSlowMovingProducts': {
        parseToolArgs(getInventorySchema, rawArgs, toolName);
        const perf = await getProductPerformanceReport(ctx.shopId, { period: 'month' });
        data = { slowMoving: perf.slowMoving };
        break;
      }

      case 'getSupplierBalance': {
        const args = parseToolArgs(getSupplierBalanceSchema, rawArgs, toolName);
        const balances = await getBalancesReport(ctx.shopId);
        if (args.supplierId) {
          data = balances.suppliers.find((s) => s.supplierId === args.supplierId) ?? {
            found: false,
            message: 'Supplier not found',
          };
        } else if (args.name) {
          const term = args.name.toLowerCase();
          const matched = balances.suppliers.filter((s) => s.name.toLowerCase().includes(term));
          data = matched.length === 1 ? matched[0] : { suppliers: matched };
        } else {
          data = {
            totalSupplierPayable: balances.totalSupplierPayable,
            suppliers: balances.suppliers,
          };
        }
        break;
      }
    }

    setAiReadCache(ctx.shopId, cacheKey, data);
    return { kind: 'READ', toolName: toolName as AIReadToolName, data };
  }

  // Write tools: proposal only (BR-AI2), NEVER mutate business tables here!
  switch (toolName as AIWriteToolName) {
    case 'createProduct': {
      const args = parseToolArgs(createProductToolSchema, rawArgs, toolName);
      const action = await proposeAction({
        shopId: ctx.shopId,
        conversationId: ctx.conversationId,
        toolName: 'createProduct',
        args,
        summary: `Create product "${args.name}" (${args.unit}) at selling price ${args.sellingPrice}`,
        estimatedAmount: round2(args.sellingPrice),
        strongConfirmTarget: round2(args.sellingPrice),
      });
      return { kind: 'PROPOSAL', toolName: 'createProduct', data: action };
    }

    case 'updateProduct': {
      const args = parseToolArgs(updateProductToolSchema, rawArgs, toolName);
      const current = await getProductById(ctx.shopId, args.productId);
      let maxRatio = 0;
      if (args.sellingPrice !== undefined && dec(current.sellingPrice).gt(0)) {
        const oldP = dec(current.sellingPrice);
        const newP = dec(args.sellingPrice);
        maxRatio = Math.max(maxRatio, newP.minus(oldP).abs().div(oldP).toNumber());
      }
      if (args.purchaseCost !== undefined && dec(current.purchaseCost).gt(0)) {
        const oldC = dec(current.purchaseCost);
        const newC = dec(args.purchaseCost);
        maxRatio = Math.max(maxRatio, newC.minus(oldC).abs().div(oldC).toNumber());
      }
      const action = await proposeAction({
        shopId: ctx.shopId,
        conversationId: ctx.conversationId,
        toolName: 'updateProduct',
        args,
        summary: `Update product "${current.name}"`,
        priceChangeRatio: maxRatio,
        strongConfirmTarget: current.name,
      });
      return { kind: 'PROPOSAL', toolName: 'updateProduct', data: action };
    }

    case 'recordSale': {
      const args = parseToolArgs(recordSaleToolSchema, rawArgs, toolName);
      let estTotal = dec(0);
      for (const item of args.items) {
        const prod = await getProductById(ctx.shopId, item.productId);
        const price = dec(item.unitPrice ?? prod.sellingPrice);
        estTotal = estTotal.plus(price.times(dec(item.quantity)));
      }
      const totalStr = round2(estTotal);
      const action = await proposeAction({
        shopId: ctx.shopId,
        conversationId: ctx.conversationId,
        toolName: 'recordSale',
        args,
        summary: `Record ${args.paymentMethod} sale of ${args.items.length} item(s) totaling ${totalStr}`,
        estimatedAmount: totalStr,
        strongConfirmTarget: totalStr,
      });
      return { kind: 'PROPOSAL', toolName: 'recordSale', data: action };
    }

    case 'recordPurchase': {
      const args = parseToolArgs(recordPurchaseToolSchema, rawArgs, toolName);
      const suppliers = await listSuppliers(ctx.shopId, { page: 1, pageSize: 100 });
      const sup = suppliers.items.find((s) => s.id === args.supplierId);
      if (!sup) {
        throw badRequest('Supplier not found');
      }
      const estTotal = args.items.reduce(
        (acc, i) => acc.plus(dec(i.unitCost).times(dec(i.quantity))),
        dec(0),
      );
      const totalStr = round2(estTotal);
      const action = await proposeAction({
        shopId: ctx.shopId,
        conversationId: ctx.conversationId,
        toolName: 'recordPurchase',
        args,
        summary: `Record purchase from "${sup.name}" totaling ${totalStr}`,
        estimatedAmount: totalStr,
        strongConfirmTarget: totalStr,
      });
      return { kind: 'PROPOSAL', toolName: 'recordPurchase', data: action };
    }

    case 'recordExpense': {
      const args = parseToolArgs(recordExpenseToolSchema, rawArgs, toolName);
      const amtStr = round2(args.amount);
      const action = await proposeAction({
        shopId: ctx.shopId,
        conversationId: ctx.conversationId,
        toolName: 'recordExpense',
        args,
        summary: `Record ${args.category} expense "${args.title}" for ${amtStr}`,
        estimatedAmount: amtStr,
        strongConfirmTarget: amtStr,
      });
      return { kind: 'PROPOSAL', toolName: 'recordExpense', data: action };
    }
  }
}

import type { Request, Response } from 'express';
import { sendSuccess } from '../lib/response.js';
import { getShopId } from '../lib/shopScope.js';
import {
  createExpense,
  getExpenseById,
  listExpenses,
  updateExpense,
} from '../services/expenseService.js';
import type { ReportPeriod } from '../shared/calculations.js';
import type { ExpenseCategory } from '../shared/enums.js';

export async function listExpensesController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const q = req.query as unknown as {
    page: number;
    pageSize: number;
    search?: string;
    category?: ExpenseCategory;
    period?: ReportPeriod;
    from?: string;
    to?: string;
  };
  const result = await listExpenses(shopId, q);
  sendSuccess(res, result.items, 200, result.meta);
}

export async function getExpenseController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const expense = await getExpenseById(shopId, String(req.params.id));
  sendSuccess(res, expense, 200);
}

export async function createExpenseController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const expense = await createExpense(
    shopId,
    req.body as {
      id?: string;
      title: string;
      category: ExpenseCategory;
      amount: string;
      expenseDate: string;
      paymentMethod: string;
      description?: string | null;
    },
  );
  sendSuccess(res, expense, 201);
}

export async function updateExpenseController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const expense = await updateExpense(
    shopId,
    String(req.params.id),
    req.body as {
      title?: string;
      category?: ExpenseCategory;
      amount?: string;
      expenseDate?: string;
      paymentMethod?: string;
      description?: string | null;
      reason?: string | null;
    },
  );
  sendSuccess(res, expense, 200);
}

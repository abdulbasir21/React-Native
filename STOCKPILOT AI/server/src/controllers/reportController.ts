import type { Request, Response } from 'express';
import { z } from 'zod';
import { badRequest } from '../lib/errors.js';
import { sendSuccess } from '../lib/response.js';
import {
  getBalancesReport,
  getDashboardSummary,
  getExpenseReport,
  getInventoryValuationReport,
  getProductPerformanceReport,
  getProfitReport,
  getPurchasesReport,
  getSalesReport,
  getWriteOffsReport,
} from '../services/reportService.js';

const dashboardQuerySchema = z
  .object({
    period: z.enum(['today', 'week', 'month']).optional(),
  })
  .strict();

const dateStrSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const reportQuerySchema = z
  .object({
    period: z.enum(['today', 'week', 'month']).optional(),
    from: dateStrSchema.optional(),
    to: dateStrSchema.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if ((val.from && !val.to) || (!val.from && val.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Both from and to dates are required for a custom range',
        path: [val.from ? 'to' : 'from'],
      });
    }
    if (val.from && val.to && val.from > val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'from date must be on or before to date',
        path: ['from'],
      });
    }
  });

function parseReportFilter(req: Request) {
  const parsed = reportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw badRequest(
      parsed.error.issues[0]?.message ?? 'Invalid report query parameters',
      parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return parsed.data;
}

export async function getDashboardController(req: Request, res: Response) {
  const parsed = dashboardQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw badRequest(
      parsed.error.issues[0]?.message ?? 'Invalid dashboard query parameters',
      parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  const data = await getDashboardSummary(req.auth!.shopId, parsed.data.period ?? 'today');
  sendSuccess(res, data);
}

export async function getSalesReportController(req: Request, res: Response) {
  const filter = parseReportFilter(req);
  const data = await getSalesReport(req.auth!.shopId, filter);
  sendSuccess(res, data);
}

export async function getPurchasesReportController(req: Request, res: Response) {
  const filter = parseReportFilter(req);
  const data = await getPurchasesReport(req.auth!.shopId, filter);
  sendSuccess(res, data);
}

export async function getExpenseReportController(req: Request, res: Response) {
  const filter = parseReportFilter(req);
  const data = await getExpenseReport(req.auth!.shopId, filter);
  sendSuccess(res, data);
}

export async function getProfitReportController(req: Request, res: Response) {
  const filter = parseReportFilter(req);
  const data = await getProfitReport(req.auth!.shopId, filter);
  sendSuccess(res, data);
}

export async function getProductPerformanceController(req: Request, res: Response) {
  const filter = parseReportFilter(req);
  const data = await getProductPerformanceReport(req.auth!.shopId, filter);
  sendSuccess(res, data);
}

export async function getInventoryValuationController(req: Request, res: Response) {
  const data = await getInventoryValuationReport(req.auth!.shopId);
  sendSuccess(res, data);
}

export async function getBalancesReportController(req: Request, res: Response) {
  const data = await getBalancesReport(req.auth!.shopId);
  sendSuccess(res, data);
}

export async function getWriteOffsReportController(req: Request, res: Response) {
  const filter = parseReportFilter(req);
  const data = await getWriteOffsReport(req.auth!.shopId, filter);
  sendSuccess(res, data);
}

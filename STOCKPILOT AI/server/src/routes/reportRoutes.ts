import { Router } from 'express';
import {
  getBalancesReportController,
  getDashboardController,
  getExpenseReportController,
  getInventoryValuationController,
  getProductPerformanceController,
  getProfitReportController,
  getPurchasesReportController,
  getSalesReportController,
  getWriteOffsReportController,
} from '../controllers/reportController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate, requirePermission('report:read'));
dashboardRouter.get('/', asyncHandler(getDashboardController));

export const reportRouter = Router();
reportRouter.use(authenticate, requirePermission('report:read'));
reportRouter.get('/sales', asyncHandler(getSalesReportController));
reportRouter.get('/purchases', asyncHandler(getPurchasesReportController));
reportRouter.get('/expenses', asyncHandler(getExpenseReportController));
reportRouter.get('/profit', asyncHandler(getProfitReportController));
reportRouter.get('/products', asyncHandler(getProductPerformanceController));
reportRouter.get('/inventory-valuation', asyncHandler(getInventoryValuationController));
reportRouter.get('/balances', asyncHandler(getBalancesReportController));
reportRouter.get('/write-offs', asyncHandler(getWriteOffsReportController));

import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { sendSuccess } from './lib/response.js';
import { errorHandler } from './middleware/errorHandler.js';
import { aiRouter } from './routes/aiRoutes.js';
import { authRouter } from './routes/authRoutes.js';
import { categoryRouter } from './routes/categoryRoutes.js';
import { customerRouter } from './routes/customerRoutes.js';
import { expenseRouter } from './routes/expenseRoutes.js';
import { productRouter } from './routes/productRoutes.js';
import { purchaseRouter } from './routes/purchaseRoutes.js';
import { dashboardRouter, reportRouter } from './routes/reportRoutes.js';
import { saleRouter } from './routes/saleRoutes.js';
import { shopRouter } from './routes/shopRoutes.js';
import { stockMovementRouter } from './routes/stockMovementRoutes.js';
import { supplierRouter } from './routes/supplierRoutes.js';
import { syncRouter } from './routes/syncRoutes.js';

export interface CreateAppOptions {
  mountExtraRoutes?: (app: Express) => void;
}

export function createApp(options?: CreateAppOptions): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const healthHandler = (_req: express.Request, res: express.Response) => {
    sendSuccess(res, { status: 'ok', service: 'stockpilot-api' });
  };

  app.get('/health', healthHandler);
  app.get('/api/v1/health', healthHandler);

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/shop', shopRouter);
  app.use('/api/v1/categories', categoryRouter);
  app.use('/api/v1/products', productRouter);
  app.use('/api/v1/stock-movements', stockMovementRouter);
  app.use('/api/v1/customers', customerRouter);
  app.use('/api/v1/suppliers', supplierRouter);
  app.use('/api/v1/purchases', purchaseRouter);
  app.use('/api/v1/sales', saleRouter);
  app.use('/api/v1/expenses', expenseRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/reports', reportRouter);
  app.use('/api/v1/sync', syncRouter);
  app.use('/api/v1/ai', aiRouter);

  if (options?.mountExtraRoutes) {
    options.mountExtraRoutes(app);
  }

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    });
  });

  app.use(errorHandler);
  return app;
}

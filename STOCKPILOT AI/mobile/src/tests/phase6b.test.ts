import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { reportRepository, validateCustomDateRange } from '../repositories/reportRepository';

describe('Phase 6b — Mobile reportRepository & custom date range validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('BR-RP10: validateCustomDateRange rejects invalid format and reversed dates', () => {
    expect(validateCustomDateRange('2026-10-01', '2026-10-31')).toBeNull();
    expect(validateCustomDateRange('2026-10-15', '2026-10-15')).toBeNull();
    expect(validateCustomDateRange('10-01-2026', '2026-10-31')).toContain('YYYY-MM-DD');
    expect(validateCustomDateRange('2026-10-20', '2026-10-10')).toContain('on or before');
  });

  it('BR-RP12: reportRepository calls dashboard and report endpoints with expected query params', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        data: {
          period: 'today',
          sales: '400.00',
          estimatedProfit: '160.00',
          cashReceived: '250.00',
        },
      },
    } as never);

    const dash = await reportRepository.getDashboard('today');
    expect(dash.estimatedProfit).toBe('160.00');
    expect(getSpy).toHaveBeenCalledWith('/api/v1/dashboard?period=today');

    await reportRepository.getSalesReport({ from: '2026-10-01', to: '2026-10-31' });
    expect(getSpy).toHaveBeenCalledWith('/api/v1/reports/sales?from=2026-10-01&to=2026-10-31');

    await reportRepository.getInventoryValuationReport();
    expect(getSpy).toHaveBeenCalledWith('/api/v1/reports/inventory-valuation');

    await reportRepository.getBalancesReport();
    expect(getSpy).toHaveBeenCalledWith('/api/v1/reports/balances');
  });
});

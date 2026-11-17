import { vi } from 'vitest';

export const printToFileAsync = vi.fn(async ({ html }: { html: string }) => ({
  uri: `file:///mock-receipt-${html.length}.pdf`,
  numberOfPages: 1,
}));

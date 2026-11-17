import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { generateClientId } from '../lib/ids';
import { categoryRepository } from '../repositories/categoryRepository';
import { customerRepository } from '../repositories/customerRepository';
import { productFormSchema, productRepository } from '../repositories/productRepository';
import { createAdjustStockSchema, stockRepository } from '../repositories/stockRepository';
import { supplierRepository } from '../repositories/supplierRepository';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Phase 2 — Mobile core repositories & unit validation', () => {
  it('BR-G4: generates RFC 4122 UUID v4 client IDs', () => {
    const id1 = generateClientId();
    const id2 = generateClientId();
    expect(id1).toMatch(UUID_REGEX);
    expect(id2).toMatch(UUID_REGEX);
    expect(id1).not.toBe(id2);
  });

  it('BR-P1, BR-P5: validates productFormSchema unit quantity decimals and zero defaults', () => {
    const zeroDefaults = productFormSchema.safeParse({
      name: 'Samsung 25W Charger',
      unit: 'PIECE',
      purchaseCost: '850.00',
      sellingPrice: '1200.00',
      initialQuantity: '0',
      minStockLevel: '0',
    });
    expect(zeroDefaults.success).toBe(true);

    const decimalPiece = productFormSchema.safeParse({
      name: 'USB Cable',
      unit: 'PIECE',
      purchaseCost: '200',
      sellingPrice: '350',
      initialQuantity: '1.5',
      minStockLevel: '5',
    });
    expect(decimalPiece.success).toBe(false);

    const decimalKg = productFormSchema.safeParse({
      name: 'Basmati Rice',
      unit: 'KG',
      purchaseCost: '320',
      sellingPrice: '380',
      initialQuantity: '1.5',
      minStockLevel: '2.25',
    });
    expect(decimalKg.success).toBe(true);
  });

  it('BR-S2, BR-S3: enforces sign, non-zero, reason, and unit precision in createAdjustStockSchema', () => {
    const pieceSchema = createAdjustStockSchema('PIECE');
    const kgSchema = createAdjustStockSchema('KG');

    expect(
      pieceSchema.safeParse({ type: 'ADJUSTMENT', quantityChange: '0', reason: 'Recount' }).success,
    ).toBe(false);

    expect(
      pieceSchema.safeParse({ type: 'DAMAGED', quantityChange: '2', reason: 'Broken' }).success,
    ).toBe(false);

    expect(
      pieceSchema.safeParse({ type: 'EXPIRED', quantityChange: '-2', reason: '   ' }).success,
    ).toBe(false);

    expect(
      pieceSchema.safeParse({ type: 'ADJUSTMENT', quantityChange: '1.5', reason: 'Recount' })
        .success,
    ).toBe(false);

    expect(
      kgSchema.safeParse({ type: 'DAMAGED', quantityChange: '-1.25', reason: 'Moisture leak' })
        .success,
    ).toBe(true);
  });

  it('BR-G4: repositories generate and submit client UUIDs on create/adjust-stock calls', async () => {
    const postSpy = vi
      .spyOn(apiClient, 'post')
      .mockImplementation(async (_url: string, body?: unknown) => ({
        data: { success: true, data: body },
      }) as never);

    await categoryRepository.create({ name: 'Chargers' });
    await productRepository.create({
      name: 'Type-C Cable',
      unit: 'PIECE',
      purchaseCost: '150',
      sellingPrice: '300',
      initialQuantity: '5',
      minStockLevel: '2',
    });
    await customerRepository.create({ name: 'Bilal Ahmed', phone: '0300-1112223' });
    await supplierRepository.create({ name: 'Metro Distributors' });
    await stockRepository.adjustStock('11111111-1111-4111-8111-111111111111', {
      type: 'DAMAGED',
      quantityChange: '-1',
      reason: 'Screen scratch',
    });

    expect(postSpy).toHaveBeenCalledTimes(5);
    for (const call of postSpy.mock.calls) {
      const payload = call[1] as { id?: string };
      expect(payload.id).toMatch(UUID_REGEX);
    }

    postSpy.mockRestore();
  });
});

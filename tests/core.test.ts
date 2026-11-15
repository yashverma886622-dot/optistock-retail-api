import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  generateDemandForecast,
  buildContinuousSeries,
} from '../server/services/forecastingService.ts';
import {
  calculateInventoryOptimization,
  getZScoreForServiceLevel,
} from '../server/services/optimizationService.ts';
import {
  productSchema,
  createSaleSchema,
  receivePurchaseOrderSchema,
  supplierSchema,
  stockMovementSchema,
  changePasswordSchema,
  adminCreateUserSchema,
  updateUserSchema,
} from '../server/validators/schemas.ts';
import { signAuthToken } from '../server/middleware/auth.ts';
import { env } from '../server/config/env.ts';
import { getSanitizedMongoUri } from '../server/config/db.ts';

describe('Demand Forecasting Engine', () => {
  it('fills missing calendar days continuously and detects preliminary data when sparse', () => {
    const sparse = [
      { date: new Date().toISOString().slice(0, 10), quantity: 10 },
    ];
    const continuous = buildContinuousSeries(sparse, 30);
    expect(continuous.length).toBe(30);

    const res = generateDemandForecast({
      observations: sparse,
      horizonDays: 14,
      method: 'SMA',
      lookbackDays: 30,
    });
    expect(res.isPreliminary).toBe(true);
    expect(res.preliminaryReason).toBeTruthy();
    expect(res.dailySeries.length).toBe(14);
    expect(res.forecastTotal).toBeGreaterThanOrEqual(0);
  });

  it('computes real holdout backtest metrics (MAE, RMSE, MAPE, WAPE) across all 4 methods', () => {
    const today = new Date();
    const obs = [];
    for (let i = 59; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
      // Steady demand with mild weekly oscillation
      const qty = 10 + (i % 7 === 0 ? 4 : 0);
      obs.push({ date: d, quantity: qty });
    }

    const methods = ['SMA', 'WMA', 'EXPONENTIAL_SMOOTHING', 'TREND_SEASONAL'] as const;
    for (const method of methods) {
      const result = generateDemandForecast({
        observations: obs,
        horizonDays: 30,
        method,
        lookbackDays: 60,
      });
      expect(result.isPreliminary).toBe(false);
      expect(result.metrics.backtestSampleSize).toBeGreaterThan(0);
      expect(result.metrics.mae).not.toBeNull();
      expect(result.metrics.rmse).not.toBeNull();
      expect(result.metrics.mape).not.toBeNull();
      expect(result.metrics.wape).not.toBeNull();
      expect(result.forecastTotal).toBeGreaterThan(0);
    }
  });

  it('applies seasonal festival multipliers to future forecast points', () => {
    const today = new Date();
    const obs = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
      obs.push({ date: d, quantity: 10 });
    }
    const tomorrow = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

    const baseline = generateDemandForecast({
      observations: obs,
      horizonDays: 7,
      method: 'SMA',
      lookbackDays: 30,
    });
    const festive = generateDemandForecast({
      observations: obs,
      horizonDays: 7,
      method: 'SMA',
      lookbackDays: 30,
      seasonalMultipliers: { [tomorrow]: 2.0 },
    });

    expect(festive.dailySeries[0].forecast).toBeCloseTo(baseline.dailySeries[0].forecast * 2, 1);
  });
});

describe('Inventory Optimization Engine (EOQ, Safety Stock, ROP)', () => {
  it('computes accurate Z-scores for standard service levels', () => {
    expect(getZScoreForServiceLevel(90)).toBeCloseTo(1.2816, 3);
    expect(getZScoreForServiceLevel(95)).toBeCloseTo(1.6449, 3);
    expect(getZScoreForServiceLevel(99)).toBeCloseTo(2.3263, 3);
  });

  it('calculates mathematically exact EOQ, Safety Stock, and Reorder Point', () => {
    // Annual Demand = 10 * 365 = 3650
    // Unit cost = 100, holding rate = 0.20 => H = 20
    // Ordering cost S = 500 => EOQ = sqrt((2 * 3650 * 500) / 20) = sqrt(182500) ≈ 427
    const out = calculateInventoryOptimization({
      currentStock: 30,
      avgDailyDemand: 10,
      demandStdDev: 3,
      leadTimeDays: 5,
      leadTimeStdDevDays: 0,
      serviceLevelPct: 95,
      unitCost: 100,
      orderingCost: 500,
      holdingCostRate: 0.2,
      minOrderQuantity: 10,
    });

    expect(out.eoq).toBe(427);
    // SS = 1.6449 * sqrt(5) * 3 ≈ 11.03 => ceil = 12
    expect(out.safetyStock).toBe(12);
    // ROP = 10*5 + 12 = 62
    expect(out.reorderPoint).toBe(62);
    expect(out.needsReorder).toBe(true);
    expect(out.recommendedOrderQty).toBeGreaterThanOrEqual(427);
    expect(out.recommendedOrderQty).toBeGreaterThanOrEqual(0);
    expect(out.formulaBreakdown.eoqFormula).toContain('EOQ');
  });

  it('never produces negative order quantities even for zero demand or high stock', () => {
    const out = calculateInventoryOptimization({
      currentStock: 500,
      avgDailyDemand: 0,
      demandStdDev: 0,
      leadTimeDays: 5,
      serviceLevelPct: 95,
      unitCost: 200,
      orderingCost: 500,
      holdingCostRate: 0.2,
      minOrderQuantity: 10,
    });

    expect(out.eoq).toBe(0);
    expect(out.safetyStock).toBe(0);
    expect(out.recommendedOrderQty).toBe(0);
    expect(out.needsReorder).toBe(false);
  });
});

describe('API Validation Schemas & Security Utilities', () => {
  it('validates product, supplier, stock movement, POS sale, and PO receipt payloads', () => {
    const validProduct = productSchema.safeParse({
      name: 'Tata Salt 1kg',
      sku: 'GRC-SLT-01',
      category: '65f1a1a1a1a1a1a1a1a1a1a1',
      brand: 'Tata',
      unit: 'pack',
      costPrice: 20,
      sellingPrice: 28,
      supplier: '65f1a1a1a1a1a1a1a1a1a1a2',
    });
    expect(validProduct.success).toBe(true);

    const invalidSale = createSaleSchema.safeParse({
      paymentMethod: 'UPI',
      items: [],
    });
    expect(invalidSale.success).toBe(false);

    const validReceipt = receivePurchaseOrderSchema.safeParse({
      receiptId: 'RCPT-1001',
      items: [{ productId: '65f1a1a1a1a1a1a1a1a1a1a1', quantityReceived: 15 }],
    });
    expect(validReceipt.success).toBe(true);

    const validSupplier = supplierSchema.safeParse({
      name: 'Shree Ganesh Agro',
      code: 'SUP-SGAD',
      contactPerson: 'Rajeshwari',
      phone: '+91 98200 12345',
      email: 'orders@sgagro.in',
      address: 'Vashi APMC',
      city: 'Navi Mumbai',
      state: 'Maharashtra',
    });
    expect(validSupplier.success).toBe(true);

    const invalidMovement = stockMovementSchema.safeParse({
      productId: '65f1a1a1a1a1a1a1a1a1a1a1',
      type: 'STOCK_IN',
      quantity: 0,
      reason: 'x',
    });
    expect(invalidMovement.success).toBe(false);
  });

  it('hashes passwords securely with bcrypt and verifies signed JWTs', async () => {
    const hash = await bcrypt.hash('Admin@123', 10);
    expect(hash).not.toBe('Admin@123');
    expect(await bcrypt.compare('Admin@123', hash)).toBe(true);
    expect(await bcrypt.compare('WrongPass', hash)).toBe(false);

    const token = signAuthToken({
      userId: 'user-123',
      email: 'admin@optistock.in',
      role: 'Admin',
      name: 'Admin User',
    });
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string; role: string };
    expect(decoded.userId).toBe('user-123');
    expect(decoded.role).toBe('Admin');
  });

  it('sanitizes MongoDB Atlas URIs without ever exposing credentials or query params', () => {
    const raw = 'mongodb+srv://dbuser:SuperSecretPass99@cluster0.example.mongodb.net/optistock?retryWrites=true&w=majority';
    const sanitized = getSanitizedMongoUri(raw);
    expect(sanitized).toBe('mongodb+srv://***:***@cluster0.example.mongodb.net/optistock');
    expect(sanitized).not.toContain('dbuser');
    expect(sanitized).not.toContain('SuperSecretPass99');
    expect(sanitized).not.toContain('retryWrites');
  });
});

describe('Stock movement, idempotency and user-admin validation', () => {
  it('allows an ADJUSTMENT by absolute stock level without a quantity (including zero)', () => {
    const r = stockMovementSchema.safeParse({
      productId: 'p1', type: 'ADJUSTMENT', newAbsoluteStock: 0, reason: 'Cycle count',
    });
    expect(r.success).toBe(true);
  });

  it('allows a negative relative ADJUSTMENT but rejects a zero/empty one', () => {
    expect(stockMovementSchema.safeParse({ productId: 'p1', type: 'ADJUSTMENT', quantity: -4, reason: 'Shrinkage' }).success).toBe(true);
    expect(stockMovementSchema.safeParse({ productId: 'p1', type: 'ADJUSTMENT', quantity: 0, reason: 'Nothing' }).success).toBe(false);
    expect(stockMovementSchema.safeParse({ productId: 'p1', type: 'ADJUSTMENT', reason: 'Nothing' }).success).toBe(false);
  });

  it('still requires a positive quantity for STOCK_IN / STOCK_OUT / DAMAGE / RETURN', () => {
    for (const type of ['STOCK_IN', 'STOCK_OUT', 'DAMAGE', 'RETURN']) {
      expect(stockMovementSchema.safeParse({ productId: 'p1', type, quantity: 0, reason: 'x1' }).success).toBe(false);
      expect(stockMovementSchema.safeParse({ productId: 'p1', type, quantity: -3, reason: 'x1' }).success).toBe(false);
      expect(stockMovementSchema.safeParse({ productId: 'p1', type, quantity: 3, reason: 'x1' }).success).toBe(true);
    }
  });

  it('accepts an optional clientRequestId on sales and rejects trivially short keys', () => {
    const base = { paymentMethod: 'UPI', items: [{ productId: 'p1', quantity: 1 }] };
    expect(createSaleSchema.safeParse({ ...base, clientRequestId: 'pos-1700000000-abcdef' }).success).toBe(true);
    expect(createSaleSchema.safeParse({ ...base, clientRequestId: 'x' }).success).toBe(false);
    expect(createSaleSchema.safeParse(base).success).toBe(true);
  });

  it('validates password change and admin user creation payloads', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'short' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'longenough1' }).success).toBe(true);
    expect(adminCreateUserSchema.safeParse({ name: 'Asha Rao', email: 'asha@shop.in', password: 'secret1' }).success).toBe(true);
    expect(adminCreateUserSchema.safeParse({ name: 'Asha Rao', email: 'nope', password: 'secret1' }).success).toBe(false);
    expect(updateUserSchema.safeParse({ role: 'Superuser' }).success).toBe(false);
  });
});


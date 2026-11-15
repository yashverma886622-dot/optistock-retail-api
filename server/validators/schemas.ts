import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  role: z.enum(['Admin', 'Manager', 'Staff']).optional(),
  phone: z.string().trim().max(25).optional(),
  storeLocation: z.string().trim().max(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const updateSettingsSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(25).optional(),
  storeLocation: z.string().trim().max(120).optional(),
  settings: z
    .object({
      defaultServiceLevel: z.number().min(80).max(99.9).optional(),
      defaultOrderingCost: z.number().min(1).max(100000).optional(),
      defaultHoldingCostPct: z.number().min(1).max(100).optional(),
      lowStockAlertThresholdPct: z.number().min(50).max(200).optional(),
    })
    .optional(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).optional(),
  targetTurnoverDays: z.number().min(1).max(365).optional(),
});

export const productSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required').max(180),
  sku: z.string().trim().min(2, 'SKU is required').max(60),
  barcode: z.string().trim().max(60).optional().or(z.literal('')),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  category: z.string().min(1, 'Category is required'),
  brand: z.string().trim().min(1, 'Brand is required').max(100),
  unit: z.string().trim().min(1).max(30).default('pcs'),
  costPrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  gstRate: z.coerce.number().min(0).max(28).default(12),
  currentStock: z.coerce.number().int().min(0).default(0),
  minStock: z.coerce.number().int().min(0).default(10),
  maxStock: z.coerce.number().int().min(1).default(200),
  reorderLevel: z.coerce.number().int().min(0).default(20),
  supplier: z.string().min(1, 'Supplier is required'),
  leadTimeDays: z.coerce.number().int().min(1).max(180).default(5),
  expiryDate: z.string().optional().nullable(),
  orderingCost: z.coerce.number().min(1).default(500),
  holdingCostRate: z.coerce.number().min(0.01).max(1).default(0.2),
  serviceLevel: z.coerce.number().min(80).max(99.9).default(95),
  minOrderQuantity: z.coerce.number().int().min(1).default(10),
});

export const stockMovementSchema = z
  .object({
    productId: z.string().min(1, 'Product is required'),
    type: z.enum(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'DAMAGE', 'RETURN']),
    // ADJUSTMENT may use newAbsoluteStock instead of a quantity; ADJUSTMENT quantity may be negative
    quantity: z.coerce.number().int().optional(),
    newAbsoluteStock: z.coerce.number().int().min(0).optional(),
    reason: z.string().trim().min(2, 'Reason is required').max(400),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'ADJUSTMENT') {
      if (v.newAbsoluteStock === undefined && (v.quantity === undefined || v.quantity === 0)) {
        ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Provide a new stock level or a non-zero adjustment quantity' });
      }
    } else if (v.quantity === undefined || v.quantity < 1) {
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Quantity must be at least 1' });
    }
  });

export const createSaleSchema = z.object({
  clientRequestId: z.string().trim().min(8).max(100).optional(),
  customerName: z.string().trim().min(1).max(120).default('Walk-in Customer'),
  customerPhone: z.string().trim().max(25).optional(),
  paymentMethod: z.enum(['Cash', 'UPI', 'Card', 'NetBanking', 'Credit']),
  discountAmount: z.coerce.number().min(0).default(0),
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().min(1),
        discountPercent: z.coerce.number().min(0).max(100).default(0),
      })
    )
    .min(1, 'At least one item is required in cart'),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(140),
  code: z.string().trim().min(2).max(30),
  contactPerson: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(6).max(25),
  email: z.string().trim().email(),
  address: z.string().trim().min(4).max(300),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  gstin: z.string().trim().max(20).optional().or(z.literal('')),
  averageLeadTimeDays: z.coerce.number().int().min(1).max(180).default(5),
  leadTimeStdDevDays: z.coerce.number().min(0).max(60).default(1),
  paymentTerms: z.string().trim().min(2).max(60).default('Net 30'),
  status: z.enum(['Active', 'Inactive', 'On Hold']).default('Active'),
  rating: z.coerce.number().min(1).max(5).default(4.2),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  expectedDeliveryDate: z.string().min(1),
  status: z.enum(['Draft', 'Pending Approval', 'Approved', 'Ordered']).default('Pending Approval'),
  notes: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        orderedQuantity: z.coerce.number().int().min(1),
        unitCost: z.coerce.number().min(0),
      })
    )
    .min(1, 'Purchase order must include at least one item'),
});

export const receivePurchaseOrderSchema = z.object({
  receiptId: z.string().trim().min(4, 'Idempotency receiptId is required'),
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantityReceived: z.coerce.number().int().min(1),
      })
    )
    .min(1, 'At least one received item is required'),
});

export const seasonalEventSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(40),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  demandMultiplier: z.coerce.number().min(0.5).max(5),
  affectedCategories: z.array(z.string()).default([]),
  description: z.string().trim().max(500).optional(),
  year: z.coerce.number().int().min(2020).max(2035),
  isRecurring: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const adminCreateUserSchema = registerSchema.extend({
  role: z.enum(['Admin', 'Manager', 'Staff']).default('Staff'),
});

export const updateUserSchema = z.object({
  role: z.enum(['Admin', 'Manager', 'Staff']).optional(),
  isActive: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
});

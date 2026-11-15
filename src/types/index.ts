export type UserRole = 'Admin' | 'Manager' | 'Staff';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  storeLocation?: string;
  settings: {
    defaultServiceLevel: number;
    defaultOrderingCost: number;
    defaultHoldingCostPct: number;
    lowStockAlertThresholdPct: number;
    currency: string;
  };
  lastLoginAt?: string;
}

export interface DbHealth {
  connected: boolean;
  status: 'connected' | 'connecting' | 'unconfigured' | 'error' | 'disconnected';
  message: string;
  host?: string;
  name?: string;
  sanitizedUri?: string;
  usesDefaultTestDb?: boolean;
  lastCheckedAt: string;
}

export interface SeedStatusResponse {
  isEmpty: boolean;
  databaseName?: string;
  sanitizedUri?: string;
  userCount: number;
  productCount: number;
  collections: {
    users: number;
    categories: number;
    suppliers: number;
    products: number;
    sales: number;
    saleItems: number;
    inventoryTransactions: number;
    purchaseOrders: number;
    purchaseOrderItems: number;
    seasonalEvents: number;
    reorderRecommendations: number;
    notifications: number;
    demandForecasts: number;
  };
}

export interface SeedExecutionResponse {
  success: boolean;
  skipped?: boolean;
  databaseName?: string;
  totalInserted?: number;
  message?: string;
  error?: string;
  summary?: Record<string, number>;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  targetTurnoverDays: number;
}

export interface Supplier {
  _id: string;
  name: string;
  code: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  gstin?: string;
  averageLeadTimeDays: number;
  leadTimeStdDevDays: number;
  paymentTerms: string;
  status: 'Active' | 'Inactive' | 'On Hold';
  rating: number;
  productCount?: number;
  performance?: {
    totalOrders: number;
    totalSpend: number;
    receivedCount: number;
    onTimeRatePct: number | null;
  };
}

export interface Product {
  _id: string;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  category: Category | string;
  brand: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  gstRate: number;
  currentStock: number;
  minStock: number;
  maxStock: number;
  reorderLevel: number;
  supplier: Supplier | string;
  leadTimeDays: number;
  expiryDate?: string | null;
  orderingCost: number;
  holdingCostRate: number;
  serviceLevel: number;
  minOrderQuantity: number;
  isDemoData?: boolean;
  createdAt: string;
}

export interface InventoryTransaction {
  _id: string;
  product: { _id: string; name: string; sku: string; unit?: string } | string;
  type: 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT' | 'SALE' | 'DAMAGE' | 'RETURN' | 'PO_RECEIPT';
  quantityChange: number;
  previousStock: number;
  newStock: number;
  unitCost: number;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  performedBy?: { name: string; role: string };
  transactionDate: string;
  isDemoData?: boolean;
}

export interface SaleRecord {
  _id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  subtotal: number;
  discountAmount: number;
  gstAmount: number;
  totalAmount: number;
  paymentMethod: 'Cash' | 'UPI' | 'Card' | 'NetBanking' | 'Credit';
  paymentStatus: string;
  cashier?: { name: string; role: string };
  saleDate: string;
  isDemoData?: boolean;
}

export interface PurchaseOrderItem {
  _id: string;
  product: { _id: string; name: string; sku: string; unit: string; currentStock: number } | string;
  sku: string;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  gstRate: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  _id: string;
  poNumber: string;
  supplier: { _id: string; name: string; code: string; averageLeadTimeDays?: number };
  status: 'Draft' | 'Pending Approval' | 'Approved' | 'Ordered' | 'Partially Received' | 'Received' | 'Cancelled';
  orderDate: string;
  expectedDeliveryDate: string;
  receivedDate?: string;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  notes?: string;
  items: PurchaseOrderItem[];
  receiptLog?: Array<{
    receiptId: string;
    receivedAt: string;
    notes?: string;
    items: Array<{ product: string; quantityReceived: number }>;
  }>;
  isDemoData?: boolean;
}

export interface NotificationItem {
  _id: string;
  type: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'PO_UPDATE' | 'DELAYED_DELIVERY' | 'EXPIRING_SOON' | 'REORDER_ALERT';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  entityType?: string;
  entityId?: string;
  isRead: boolean;
  createdAt: string;
}

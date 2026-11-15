import { Router } from 'express';
import { connectDatabase, getDatabaseHealth } from '../config/db.ts';
import { authenticate, authorizeRoles } from '../middleware/auth.ts';
import { requireDb } from '../middleware/requireDb.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';

import * as authCtrl from '../controllers/authController.ts';
import * as dashCtrl from '../controllers/dashboardController.ts';
import * as prodCtrl from '../controllers/productController.ts';
import * as invCtrl from '../controllers/inventoryController.ts';
import * as salesCtrl from '../controllers/salesController.ts';
import * as intelCtrl from '../controllers/intelligenceController.ts';
import * as seasonalCtrl from '../controllers/seasonalController.ts';
import * as supCtrl from '../controllers/supplierController.ts';
import * as poCtrl from '../controllers/purchaseOrderController.ts';
import * as reportCtrl from '../controllers/reportController.ts';
import * as notifCtrl from '../controllers/notificationController.ts';
import { runSeed } from '../seed/seedData.ts';
import { User } from '../models/User.ts';
import { Category } from '../models/Category.ts';
import { Supplier } from '../models/Supplier.ts';
import { Product } from '../models/Product.ts';
import { Sale } from '../models/Sale.ts';
import { SaleItem } from '../models/SaleItem.ts';
import { InventoryTransaction } from '../models/InventoryTransaction.ts';
import { PurchaseOrder } from '../models/PurchaseOrder.ts';
import { PurchaseOrderItem } from '../models/PurchaseOrderItem.ts';
import { SeasonalEvent } from '../models/SeasonalEvent.ts';
import { ReorderRecommendation } from '../models/ReorderRecommendation.ts';
import { Notification } from '../models/Notification.ts';
import { DemandForecast } from '../models/DemandForecast.ts';

const router = Router();

// Health & Database connectivity endpoints (never blocked by requireDb)
router.get('/health', (_req, res) => {
  const db = getDatabaseHealth();
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    database: db,
  });
});

router.post(
  '/health/reconnect',
  asyncHandler(async (_req, res) => {
    const db = await connectDatabase();
    res.json({
      ok: db.connected,
      database: db,
    });
  })
);

// All routes below require an active MongoDB Atlas connection
router.use(requireDb);

// Seed status & live collection document counts
router.get(
  '/seed/status',
  asyncHandler(async (_req, res) => {
    const [
      users,
      categories,
      suppliers,
      products,
      sales,
      saleItems,
      inventoryTransactions,
      purchaseOrders,
      purchaseOrderItems,
      seasonalEvents,
      reorderRecommendations,
      notifications,
      demandForecasts,
    ] = await Promise.all([
      User.countDocuments(),
      Category.countDocuments(),
      Supplier.countDocuments(),
      Product.countDocuments(),
      Sale.countDocuments(),
      SaleItem.countDocuments(),
      InventoryTransaction.countDocuments(),
      PurchaseOrder.countDocuments(),
      PurchaseOrderItem.countDocuments(),
      SeasonalEvent.countDocuments(),
      ReorderRecommendation.countDocuments(),
      Notification.countDocuments(),
      DemandForecast.countDocuments(),
    ]);

    const db = getDatabaseHealth();
    res.json({
      isEmpty: users === 0 && products === 0,
      databaseName: db.name,
      sanitizedUri: db.sanitizedUri,
      userCount: users,
      productCount: products,
      collections: {
        users,
        categories,
        suppliers,
        products,
        sales,
        saleItems,
        inventoryTransactions,
        purchaseOrders,
        purchaseOrderItems,
        seasonalEvents,
        reorderRecommendations,
        notifications,
        demandForecasts,
      },
    });
  })
);

router.post(
  '/seed/bootstrap',
  asyncHandler(async (_req, res) => {
    const [userCount, productCount] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
    ]);
    if (userCount > 0 || productCount > 0) {
      res.status(409).json({
        success: false,
        error: `Database already initialized (${userCount} users, ${productCount} products). Sign in as Admin to reset demo data.`,
      });
      return;
    }
    const result = await runSeed({ forceReset: false });
    res.status(201).json(result);
  })
);

router.post(
  '/seed/reset',
  authenticate,
  authorizeRoles('Admin'),
  asyncHandler(async (_req, res) => {
    const result = await runSeed({ forceReset: true });
    res.json(result);
  })
);

// Auth routes
router.post('/auth/register', asyncHandler(authCtrl.register));
router.post('/auth/login', asyncHandler(authCtrl.login));
router.get('/auth/me', authenticate, asyncHandler(authCtrl.getMe));
router.patch('/auth/profile', authenticate, asyncHandler(authCtrl.updateProfileAndSettings));
router.get('/auth/users', authenticate, authorizeRoles('Admin'), asyncHandler(authCtrl.listUsers));
router.post('/auth/users', authenticate, authorizeRoles('Admin'), asyncHandler(authCtrl.createUserByAdmin));
router.post('/auth/change-password', authenticate, asyncHandler(authCtrl.changePassword));
router.patch('/auth/users/:id', authenticate, authorizeRoles('Admin'), asyncHandler(authCtrl.updateUserRole));

// Dashboard
router.get('/dashboard', authenticate, asyncHandler(dashCtrl.getDashboardSummary));

// Categories & Products
router.get('/categories', authenticate, asyncHandler(prodCtrl.listCategories));
router.post('/categories', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(prodCtrl.createCategory));

router.get('/products', authenticate, asyncHandler(prodCtrl.listProducts));
router.get('/products/:id', authenticate, asyncHandler(prodCtrl.getProductById));
router.post('/products', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(prodCtrl.createProduct));
router.put('/products/:id', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(prodCtrl.updateProduct));
router.delete('/products/:id', authenticate, authorizeRoles('Admin'), asyncHandler(prodCtrl.deleteProduct));

// Inventory Management (Staff permitted for operational stock movements)
router.get('/inventory', authenticate, asyncHandler(invCtrl.getInventoryOverview));
router.get('/inventory/transactions', authenticate, asyncHandler(invCtrl.listInventoryTransactions));
router.post('/inventory/movements', authenticate, authorizeRoles('Admin', 'Manager', 'Staff'), asyncHandler(invCtrl.recordStockMovement));

// Sales / POS (Staff permitted)
router.get('/sales', authenticate, asyncHandler(salesCtrl.listSales));
router.get('/sales/:id', authenticate, asyncHandler(salesCtrl.getSaleById));
router.post('/sales', authenticate, authorizeRoles('Admin', 'Manager', 'Staff'), asyncHandler(salesCtrl.createSale));

// Demand Forecasting & Inventory Optimization (Admin & Manager)
router.get('/forecasts', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(intelCtrl.getProductForecast));
router.get('/optimization', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(intelCtrl.getOptimizationAnalysis));
router.patch('/optimization/:productId', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(intelCtrl.updateProductOptimizationParams));

// Reorder Recommendations
router.get('/recommendations', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(intelCtrl.listRecommendations));
router.post('/recommendations/generate', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(intelCtrl.generateRecommendations));
router.post('/recommendations/:id/action', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(intelCtrl.actionRecommendation));

// Seasonal & Festival Analysis
router.get('/seasonal', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(seasonalCtrl.listSeasonalAnalysis));
router.post('/seasonal', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(seasonalCtrl.createSeasonalEvent));
router.put('/seasonal/:id', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(seasonalCtrl.updateSeasonalEvent));
router.delete('/seasonal/:id', authenticate, authorizeRoles('Admin'), asyncHandler(seasonalCtrl.deleteSeasonalEvent));

// Suppliers
router.get('/suppliers', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(supCtrl.listSuppliers));
router.post('/suppliers', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(supCtrl.createSupplier));
router.put('/suppliers/:id', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(supCtrl.updateSupplier));
router.delete('/suppliers/:id', authenticate, authorizeRoles('Admin'), asyncHandler(supCtrl.deleteSupplier));

// Purchase Orders
router.get('/purchase-orders', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(poCtrl.listPurchaseOrders));
router.post('/purchase-orders', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(poCtrl.createPurchaseOrder));
router.patch('/purchase-orders/:id/status', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(poCtrl.updatePurchaseOrderStatus));
router.post('/purchase-orders/:id/receive', authenticate, authorizeRoles('Admin', 'Manager', 'Staff'), asyncHandler(poCtrl.receivePurchaseOrderDelivery));

// Reports & Analytics
router.get('/reports', authenticate, authorizeRoles('Admin', 'Manager'), asyncHandler(reportCtrl.generateReports));

// Notifications
router.get('/notifications', authenticate, asyncHandler(notifCtrl.listNotifications));
router.post('/notifications/sync', authenticate, asyncHandler(notifCtrl.refreshNotifications));
router.patch('/notifications/read-all', authenticate, asyncHandler(notifCtrl.markAllNotificationsRead));
router.patch('/notifications/:id/read', authenticate, asyncHandler(notifCtrl.markNotificationRead));

export default router;

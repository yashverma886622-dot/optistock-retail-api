# OptiStock Retail — Demand-Driven Inventory Optimization System

An academic capstone full-stack enterprise web application built for Indian retailers to eliminate stockouts, minimize holding costs, automate replenishment decisions, and forecast seasonal demand using historical sales, supplier lead times, and inventory optimization mathematics.

---

## 1. Architecture & Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Recharts, Lucide Icons, jsPDF + AutoTable
- **Backend**: Node.js, Express.js, TypeScript, REST APIs, Zod Validation, JWT Authentication, bcryptjs
- **Database**: MongoDB Atlas with Mongoose ODM (13 structured models, unique & pagination indexes, atomic stock guards)
- **Testing**: Vitest automated test suite

### Project Structure

```text
├── server.ts                        # Express + Vite dev/prod entrypoint (port 3000)
├── server/
│   ├── config/
│   │   ├── env.ts                   # Environment variable configuration
│   │   └── db.ts                    # MongoDB Atlas connection manager & health status
│   ├── models/                      # 13 Mongoose schemas (User, Product, Category, Supplier, Sale, SaleItem, InventoryTransaction, PurchaseOrder, PurchaseOrderItem, DemandForecast, ReorderRecommendation, SeasonalEvent, Notification)
│   ├── services/
│   │   ├── forecastingService.ts    # SMA, WMA, SES, Trend+Seasonal + holdout backtesting (MAE, RMSE, MAPE, WAPE)
│   │   ├── optimizationService.ts   # Safety Stock, Reorder Point, EOQ, Stockout Risk %
│   │   └── notificationService.ts   # Deduplicated alert synchronization
│   ├── controllers/                 # Modular REST controllers per domain
│   ├── middleware/                  # JWT auth, RBAC, DB connection guard, centralized error handler
│   ├── validators/schemas.ts        # Zod request validation schemas
│   ├── routes/api.ts                # Protected REST API router
│   └── seed/seedData.ts             # Realistic Indian retail demo dataset (55 SKUs, 10 categories, 12 suppliers, 90d sales)
├── src/
│   ├── context/                     # AuthContext (JWT + DB health) & ToastContext
│   ├── components/                  # AppShell (13-module sidebar), DatabaseSetupGate, UI primitives
│   ├── lib/api.ts                   # Fetch client, INR formatter, CSV & PDF export helpers
│   └── pages/                       # All 13 application modules + Login/Register
└── tests/core.test.ts               # Automated Vitest suite
```

---

## 2. Database Setup (MongoDB Atlas)

1. Sign in to [MongoDB Atlas](https://www.mongodb.com/atlas) and create a cluster.
2. Under **Network Access**, allow access from your IP (or `0.0.0.0/0` for cloud preview environments).
3. Under **Database Access**, create a database user with read/write permissions.
4. Copy your SRV connection string and configure environment variables (see `.env.example`):

```env
MONGODB_URI="mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/optistock_retail?retryWrites=true&w=majority"
JWT_SECRET="your-64-char-random-secret"
JWT_EXPIRES_IN="7d"
PORT="3000"
# Optional: only if Atlas SRV lookups fail with "querySrv ECONNREFUSED" on your network
MONGODB_DNS_SERVERS="8.8.8.8,1.1.1.1"
```

> **Note on Honest Connection State**: If `MONGODB_URI` is missing or unreachable, the application clearly displays the **MongoDB Atlas Connection Required** screen and rejects DB APIs with HTTP `503` instead of simulating fake data.

---

## 3. Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Configure .env from .env.example with your MONGODB_URI and JWT_SECRET
cp .env.example .env

# 3. Seed realistic Indian retail demonstration data (optional — also available in-app on first launch)
npm run seed

# 4. Run full-stack development server on http://localhost:3000
npm run dev

# 5. Typecheck, build, and run tests
npm run lint
npm run build
npm test
```

### Seeded Demo Accounts (when demo dataset is initialized)
- **Admin**: `admin@optistock.in` / `Admin@123` (Full access, RBAC management, dataset reset)
- **Manager**: `manager@optistock.in` / `Manager@123` (Inventory, POS, forecasting, optimization, purchasing, reports)
- **Staff**: `staff@optistock.in` / `Staff@123` (POS billing, product lookup, operational stock adjustments)

---

## 4. Mathematical Models Implemented

### Demand Forecasting (`server/services/forecastingService.ts`)
- **Simple Moving Average (SMA)** & **Weighted Moving Average (WMA)**
- **Exponential Smoothing (SES)** with MSE-tuned smoothing factor $\alpha$
- **Trend + Seasonal Adjustment**: OLS linear trend + Day-of-Week seasonality + Indian Festival Multipliers (`SeasonalEvent`)
- **Genuine Holdout Backtesting**: Splits the trailing window as out-of-sample test observations to compute **MAE**, **RMSE**, **MAPE**, and **WAPE**. Marks forecasts as **Preliminary** when active historical days are insufficient.

### Inventory Optimization (`server/services/optimizationService.ts`)
- **Safety Stock**: $SS = Z \times \sqrt{L \cdot \sigma_d^2 + \bar{d}^2 \cdot \sigma_L^2}$
- **Reorder Point**: $ROP = (\bar{d} \times L) + SS$
- **Economic Order Quantity**: $EOQ = \sqrt{\frac{2 \times D_{\text{annual}} \times S}{H}}$
- **Stockout Risk**: Normal survival probability $P(D_L > \text{Inventory Position})$

---

## 5. Key REST API Endpoints

- `GET /api/health` · `POST /api/health/reconnect` — MongoDB Atlas connectivity status
- `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/me` · `PATCH /api/auth/profile`
- `GET /api/dashboard` — Aggregated KPIs, 30d/90d charts, low-stock & PO alerts
- `GET/POST/PUT/DELETE /api/products` · `GET/POST /api/categories`
- `GET /api/inventory` · `GET /api/inventory/transactions` · `POST /api/inventory/movements`
- `GET/POST /api/sales` · `GET /api/sales/:id` — Atomic stock-checked POS billing & GST invoices
- `GET /api/forecasts` — Statistical demand forecasts & backtest comparison
- `GET /api/optimization` · `PATCH /api/optimization/:productId`
- `GET /api/recommendations` · `POST /api/recommendations/generate` · `POST /api/recommendations/:id/action`
- `GET/POST/PUT/DELETE /api/seasonal`
- `GET/POST/PUT/DELETE /api/suppliers`
- `GET/POST /api/purchase-orders` · `PATCH /api/purchase-orders/:id/status` · `POST /api/purchase-orders/:id/receive` (idempotent `receiptId`)
- `GET /api/reports?type=...` — 11 analytical report queries
- `GET /api/notifications` · `POST /api/notifications/sync` · `PATCH /api/notifications/:id/read`

## 6. Configuration and safety notes

- Production startup now refuses to use the development JWT fallback. Set `JWT_SECRET` to a unique random value of at least 32 characters.
- `MONGODB_URI` is validated before connecting; use only a `mongodb://` or `mongodb+srv://` URI. Do not append a separate port to an Atlas SRV URI.
- Keep `.env` private. Never commit database credentials or JWT secrets.
- The UI respects the operating system's reduced-motion preference and includes a visible keyboard focus style.

### Windows PowerShell setup

```powershell
npm install
Copy-Item .env.example .env
# Edit .env and set MONGODB_URI and JWT_SECRET before running the app.
npm run dev
```

### Production run

Set `NODE_ENV=production` in the hosting provider's environment variables, provide a strong `JWT_SECRET` and a reachable `MONGODB_URI`, then run:

```bash
npm run build
npm start
```

## 7. Verification status for this delivery

The source was inspected and the configuration/accessibility hardening above was applied. Automated build and test results are **not available from the packaging environment**: dependency installation did not complete, so `node_modules` could not be provisioned and `npm run lint`, `npm run build`, and `npm test` could not be executed here. MongoDB-backed flows also require the recipient's own Atlas URI and network access. Run the commands in section 3 after installing dependencies and configuring `.env`; do not treat an unrun test as a pass.


---

## Upgrade Notes (this revision)

### Backend and data integrity
- **Sales** (`POST /api/sales`): stock is deducted atomically per line; if *any* later step fails (invoice creation, line items, ledger) every deduction and partial record is rolled back. An optional `clientRequestId` makes checkout idempotent (a double-click or retry returns the original invoice with `duplicate: true` instead of selling twice). Invoice-number collisions are retried. A cart-level discount now reduces GST proportionally (the POS screen shows the same total the server stores).
- **Purchase order receiving**: over-receipt is guarded atomically on each PO line, so two concurrent receipts cannot exceed the ordered quantity; a failure part-way compensates the stock and line counters and frees the receipt id for a clean retry. Duplicate product lines are rejected at PO creation, the supplier is validated, and PO-number collisions are retried.
- **Stock adjustments**: `ADJUSTMENT` accepts an absolute count (including 0) or a signed quantity. Absolute counts are compare-and-set, so a sale that lands mid-count produces a 409 instead of a wrong stock level.
- **Users**: Admins can create users (`POST /api/auth/users`); anyone can change their own password (`POST /api/auth/change-password`); role/active updates are validated and the last active Admin cannot be demoted or disabled.
- **Atlas DNS workaround**: set `MONGODB_DNS_SERVERS` (comma-separated) to route lookups through public DNS. Nothing is hard-coded; credentials only come from `.env`.

### Frontend
- New white-and-blue design system (`src/index.css`, `src/components/ui.tsx`): tokens, premium cards/tables/inputs, shimmer skeletons, animated KPI counters (final value is always the exact server figure), animated modals/toasts/dropdowns (Motion), confirmation dialogs (`useConfirm`) on every destructive action, route transitions.
- Collapsible, grouped sidebar (state remembered), Ctrl/Cmd+K search focus, outside-click/Escape handling, split-screen sign-in.
- Settings: add user, change password, and a confirmation before the destructive demo reset.

### Verification status
See the final section of this README for exactly what was and was not executed.

## Verification performed for this revision

| Check | Result |
|---|---|
| Forecasting, EOQ / safety stock / reorder point, validation-schema tests (12 tests, run through a minimal vitest-compatible shim because the packages could not be installed in the authoring sandbox) | 12 passed, 0 failed |
| esbuild syntax + import-graph resolution of every `src/**` and `server/**` file | passed |
| `npm install`, `vite build`, server start, MongoDB Atlas connection, auth / CRUD / POS / PO integration flows, report exports, browser rendering | **Not run in the authoring sandbox (no network). Run the commands below on your machine.** |

Run on your machine to complete verification:

```bash
npm install
npm run lint        # tsc --noEmit
npm test            # full Vitest suite (includes bcrypt/JWT/URI tests)
npm run build       # production frontend build
npm run dev         # then open http://localhost:3000
```
#   o p t i s t o c k - r e t a i l - a p i  
 
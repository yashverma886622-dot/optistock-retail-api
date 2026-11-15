
# OptiStock Retail
### Demand-Driven Inventory Optimization System for Retailers

An academic capstone full-stack enterprise web application designed for Indian retailers to reduce stockouts, minimize inventory holding costs, automate replenishment decisions, and forecast seasonal demand using historical sales, supplier lead times, and inventory optimization mathematics.

---

## Overview

OptiStock Retail is a demand-driven inventory management and intelligence platform that helps retailers make smarter purchasing and inventory decisions.

The system combines sales tracking, inventory management, demand forecasting, stock optimization, supplier management, and automated reorder recommendations in one workspace.

## Key Features

- Real-time inventory monitoring
- Product and category management
- Sales and Point of Sale (POS)
- Automatic stock deduction after sales
- Demand forecasting using historical sales
- Safety stock and reorder point calculations
- Economic Order Quantity (EOQ) optimization
- Automated reorder recommendations
- Seasonal demand analysis
- Supplier management
- Purchase order management
- Inventory movement tracking
- Analytics and reports
- Role-based access control
- Notifications and alerts

---

## Technology Stack

### Frontend
- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- React Router
- Recharts
- Lucide React
- jsPDF
- AutoTable

### Backend
- Node.js
- Express.js
- TypeScript
- REST APIs
- Zod Validation
- JWT Authentication
- bcryptjs

### Database
- MongoDB Atlas
- Mongoose ODM
- 13 structured database models
- Unique and pagination indexes
- Atomic stock guards

### Testing
- Vitest automated test suite

---

## Project Architecture

```text
OptiStock-Retail/
│
├── server.ts
├── server/
│   ├── config/
│   │   ├── env.ts
│   │   └── db.ts
│   │
│   ├── models/
│   │   ├── User
│   │   ├── Product
│   │   ├── Category
│   │   ├── Supplier
│   │   ├── Sale
│   │   ├── SaleItem
│   │   ├── InventoryTransaction
│   │   ├── PurchaseOrder
│   │   ├── PurchaseOrderItem
│   │   ├── DemandForecast
│   │   ├── ReorderRecommendation
│   │   ├── SeasonalEvent
│   │   └── Notification
│   │
│   ├── services/
│   │   ├── forecastingService.ts
│   │   ├── optimizationService.ts
│   │   └── notificationService.ts
│   │
│   ├── controllers/
│   ├── middleware/
│   ├── validators/
│   ├── routes/
│   └── seed/
│       └── seedData.ts
│
├── src/
│   ├── context/
│   ├── components/
│   ├── lib/
│   ├── pages/
│   └── tests/
│
├── package.json
├── vite.config.ts
└── README.md
```

---

## Installation and Setup

### 1. Clone the Repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd optistock-retail-api
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root.

Add your actual MongoDB Atlas connection string and the other environment variables required by the application.

Never upload your actual `.env` file to GitHub.

### 4. Configure MongoDB Atlas

1. Create a MongoDB Atlas cluster.
2. Create a database user.
3. Configure Network Access.
4. Copy the MongoDB connection string.
5. Add the connection string to your `.env` file.

For cloud deployment, configure network access securely.

### 5. Start the Application

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

## Database Architecture

The application uses MongoDB Atlas as its primary database.

The database contains 13 structured models covering:

- User authentication and authorization
- Products and categories
- Suppliers
- Sales and sale items
- Inventory transactions
- Purchase orders and order items
- Demand forecasts
- Reorder recommendations
- Seasonal events
- Notifications

MongoDB is the source of truth for application data.

---

## Inventory Optimization

The system uses inventory optimization techniques to support better replenishment decisions.

### Reorder Point (ROP)

```text
ROP = (Average Daily Demand × Lead Time) + Safety Stock
```

### Safety Stock

Safety stock provides a buffer against demand fluctuations and supplier delays.

### Economic Order Quantity (EOQ)

EOQ helps determine an economically suitable replenishment quantity by balancing ordering and holding costs.

---

## Security

- JWT-based authentication
- Password hashing using bcrypt
- Role-based access control
- Request validation
- Protected API routes
- Environment-based configuration
- Centralized error handling

---

## Testing

The project includes an automated Vitest testing suite.

Run available tests using:

```bash
npm test
```

Build and runtime verification should be performed before deployment.

---

## Deployment

The application is intended for cloud deployment using:

- Render for application hosting
- MongoDB Atlas for database hosting
- GitHub for source code management

Environment variables must be configured separately in the hosting dashboard.

---

## Project Information

**Project Name:** Demand-Driven Inventory Optimization System for Retailers

**Application Name:** OptiStock Retail

**Project Type:** Full-Stack Web Application

**Domain:** Retail Inventory Management and Demand Intelligence

**Database:** MongoDB Atlas

---

## License

This project is developed for academic and educational purposes.

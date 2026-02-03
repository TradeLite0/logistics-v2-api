# Logistics Pro - Backend API

Node.js + Express + PostgreSQL Backend for Logistics App

## Setup

```bash
npm install
npm run dev
```

## Environment Variables

```env
PORT=5000
DATABASE_URL=postgresql://user:pass@localhost:5432/logistics
JWT_SECRET=your-secret-key
FIREBASE_SERVER_KEY=your-firebase-key
```

## API Endpoints

### Auth
- POST `/api/auth/register` - Register new user
- POST `/api/auth/login` - Login
- POST `/api/auth/refresh` - Refresh token

### Shipments
- GET `/api/shipments` - List all shipments
- POST `/api/shipments` - Create shipment
- GET `/api/shipments/:id` - Get shipment details
- PUT `/api/shipments/:id/status` - Update status
- GET `/api/shipments/track/:trackingNumber` - Track shipment

### Notifications
- POST `/api/notifications/send` - Send push notification
- POST `/api/notifications/subscribe` - Subscribe to topic

## Database Schema

```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) DEFAULT 'client',
  fcm_token VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shipments table
CREATE TABLE shipments (
  id SERIAL PRIMARY KEY,
  tracking_number VARCHAR(50) UNIQUE NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  customer_email VARCHAR(100),
  origin VARCHAR(200) NOT NULL,
  destination VARCHAR(200) NOT NULL,
  service_type VARCHAR(50) NOT NULL,
  weight DECIMAL(10,2) NOT NULL,
  cost DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'received',
  company_id INTEGER REFERENCES users(id),
  driver_id INTEGER REFERENCES users(id),
  current_location VARCHAR(200),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Status history table
CREATE TABLE status_history (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER REFERENCES shipments(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL,
  location VARCHAR(200),
  notes TEXT,
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

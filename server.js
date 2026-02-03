/**
 * Logistics Pro - Backend API
 * Node.js + Express + PostgreSQL
 */

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
let pool = null;
let dbConnected = false;

const initDB = async () => {
  try {
    if (!process.env.DATABASE_URL) {
      console.log('⚠️  No DATABASE_URL, running without database');
      return false;
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    // Test connection
    await pool.query('SELECT 1');
    console.log('✅ Database connected');

    // Create tables
    await createTables();
    dbConnected = true;
    return true;
  } catch (err) {
    console.error('❌ Database error:', err.message);
    return false;
  }
};

const createTables = async () => {
  try {
    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(20) DEFAULT 'client',
        email VARCHAR(100),
        fcm_token VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Shipments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shipments (
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
      )
    `);

    // Status history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS status_history (
        id SERIAL PRIMARY KEY,
        shipment_id INTEGER REFERENCES shipments(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL,
        location VARCHAR(200),
        notes TEXT,
        updated_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Tables created');
  } catch (err) {
    console.error('❌ Tables error:', err.message);
  }
};

// ==================== ROUTES ====================

// Health check
app.get('/health', async (req, res) => {
  try {
    if (dbConnected) {
      await pool.query('SELECT 1');
      res.json({ status: 'OK', database: 'connected', timestamp: new Date().toISOString() });
    } else {
      res.json({ status: 'OK', database: 'disconnected', timestamp: new Date().toISOString() });
    }
  } catch (err) {
    res.json({ status: 'OK', database: 'error', error: err.message });
  }
});

// Root
app.get('/', (req, res) => {
  res.json({ 
    message: 'Logistics Pro API', 
    version: '1.0.0',
    status: 'running',
    database: dbConnected ? 'connected' : 'disconnected'
  });
});

// GET all shipments
app.get('/api/shipments', async (req, res) => {
  try {
    if (!dbConnected) {
      return res.json({ success: true, shipments: [] });
    }
    const result = await pool.query('SELECT * FROM shipments ORDER BY created_at DESC');
    res.json({ success: true, shipments: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET shipment by tracking number
app.get('/api/shipments/track/:trackingNumber', async (req, res) => {
  try {
    if (!dbConnected) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    const result = await pool.query('SELECT * FROM shipments WHERE tracking_number = $1', [req.params.trackingNumber]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    res.json({ success: true, shipment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create shipment
app.post('/api/shipments', async (req, res) => {
  try {
    if (!dbConnected) {
      return res.status(500).json({ error: 'Database not connected' });
    }
    
    const { customer_name, customer_phone, origin, destination, service_type, weight, cost } = req.body;
    const trackingNumber = 'SH' + Date.now().toString(36).toUpperCase();

    const result = await pool.query(
      `INSERT INTO shipments (tracking_number, customer_name, customer_phone, origin, destination, service_type, weight, cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [trackingNumber, customer_name, customer_phone, origin, destination, service_type, weight, cost]
    );

    res.status(201).json({ success: true, shipment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST login
app.post('/api/auth/login', async (req, res) => {
  const { phone } = req.body;
  res.json({ 
    success: true, 
    token: 'mock_token_' + Date.now(),
    user: { id: 1, phone, name: 'Test User', type: 'company' }
  });
});

// POST register
app.post('/api/auth/register', async (req, res) => {
  const { phone, name } = req.body;
  res.json({ 
    success: true, 
    token: 'mock_token_' + Date.now(),
    user: { id: 1, phone, name, type: 'client' }
  });
});

// Start server
const start = async () => {
  await initDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Server running on port', PORT);
    console.log('📊 Database:', dbConnected ? 'connected' : 'disconnected');
  });
};

start();

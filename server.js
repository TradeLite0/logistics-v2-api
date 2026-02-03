/**
 * Logistics Pro - Backend API
 * Node.js + Express + PostgreSQL + Firebase FCM
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize Database
async function initDB() {
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

    // Notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        body TEXT NOT NULL,
        data JSONB,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Database initialized');
  } catch (err) {
    console.error('❌ Database error:', err);
  }
}

// Auth Middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid token' });
  }
};

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { phone, password, name, type, email, fcm_token } = req.body;
    
    const existing = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Phone already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (phone, password, name, type, email, fcm_token) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, phone, name, type',
      [phone, hashedPassword, name, type || 'client', email, fcm_token]
    );

    const token = jwt.sign(
      { userId: result.rows[0].id, phone, type: result.rows[0].type },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      user: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password, fcm_token } = req.body;
    
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update FCM token if provided
    if (fcm_token) {
      await pool.query('UPDATE users SET fcm_token = $1 WHERE id = $2', [fcm_token, user.id]);
    }

    const token = jwt.sign(
      { userId: user.id, phone: user.phone, type: user.type },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        type: user.type,
        email: user.email
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== SHIPMENT ROUTES ====================

// Create shipment
app.post('/api/shipments', authenticate, async (req, res) => {
  try {
    const {
      customer_name, customer_phone, customer_email,
      origin, destination, service_type,
      weight, cost, notes
    } = req.body;

    // Generate tracking number
    const trackingNumber = 'SH' + Date.now().toString(36).toUpperCase();

    const result = await pool.query(
      `INSERT INTO shipments 
       (tracking_number, customer_name, customer_phone, customer_email, origin, destination, 
        service_type, weight, cost, company_id, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'received')
       RETURNING *`,
      [trackingNumber, customer_name, customer_phone, customer_email, origin, destination,
       service_type, weight, cost, req.user.userId, notes]
    );

    // Add to status history
    await pool.query(
      'INSERT INTO status_history (shipment_id, status, location, notes, updated_by) VALUES ($1, $2, $3, $4, $5)',
      [result.rows[0].id, 'received', origin, 'Shipment received', req.user.userId]
    );

    res.status(201).json({
      success: true,
      shipment: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all shipments (for company)
app.get('/api/shipments', authenticate, async (req, res) => {
  try {
    let query = 'SELECT * FROM shipments';
    let params = [];

    if (req.user.type === 'company') {
      query += ' WHERE company_id = $1';
      params = [req.user.userId];
    } else if (req.user.type === 'driver') {
      query += ' WHERE driver_id = $1';
      params = [req.user.userId];
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json({ success: true, shipments: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get shipment by ID
app.get('/api/shipments/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM shipments WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    // Get status history
    const history = await pool.query(
      'SELECT * FROM status_history WHERE shipment_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );

    res.json({
      success: true,
      shipment: { ...result.rows[0], status_history: history.rows }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Track shipment (public)
app.get('/api/shipments/track/:trackingNumber', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM shipments WHERE tracking_number = $1',
      [req.params.trackingNumber]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    // Get status history
    const history = await pool.query(
      'SELECT * FROM status_history WHERE shipment_id = $1 ORDER BY created_at ASC',
      [result.rows[0].id]
    );

    res.json({
      success: true,
      shipment: { ...result.rows[0], status_history: history.rows }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update shipment status
app.put('/api/shipments/:id/status', authenticate, async (req, res) => {
  try {
    const { status, location, notes } = req.body;
    const shipmentId = req.params.id;

    // Get shipment
    const shipmentResult = await pool.query('SELECT * FROM shipments WHERE id = $1', [shipmentId]);
    if (shipmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    const shipment = shipmentResult.rows[0];

    // Update status
    await pool.query(
      'UPDATE shipments SET status = $1, current_location = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [status, location, shipmentId]
    );

    // Add to history
    await pool.query(
      'INSERT INTO status_history (shipment_id, status, location, notes, updated_by) VALUES ($1, $2, $3, $4, $5)',
      [shipmentId, status, location, notes, req.user.userId]
    );

    // Send notification to customer (if we have their FCM token)
    // This is a placeholder - implement with Firebase Admin SDK
    console.log(`🔔 Notification: Shipment ${shipment.tracking_number} updated to ${status}`);

    res.json({
      success: true,
      message: 'Status updated successfully'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== NOTIFICATION ROUTES ====================

// Save FCM token
app.post('/api/notifications/token', authenticate, async (req, res) => {
  try {
    const { fcm_token } = req.body;
    await pool.query('UPDATE users SET fcm_token = $1 WHERE id = $2', [fcm_token, req.user.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user notifications
app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json({ success: true, notifications: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark notification as read
app.put('/api/notifications/:id/read', authenticate, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', database: 'disconnected' });
  }
});

// Start server
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Logistics API running on port', PORT);
  });
});

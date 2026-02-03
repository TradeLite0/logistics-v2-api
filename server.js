/**
 * Logistics Pro - Backend API
 * Node.js + Express + PostgreSQL
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check (بدون database)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: process.env.DATABASE_URL ? 'configured' : 'not configured'
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Logistics Pro API', 
    version: '1.0.0',
    status: 'running'
  });
});

// API Routes (mock data لو DB مش شغالة)
app.get('/api/shipments', (req, res) => {
  res.json({ 
    success: true, 
    shipments: [
      { id: 1, tracking_number: 'SH001', customer_name: 'Test', status: 'received' }
    ]
  });
});

app.post('/api/auth/login', (req, res) => {
  res.json({ 
    success: true, 
    token: 'mock_token',
    user: { id: 1, name: 'Test User' }
  });
});

// Start server (بسيط - بدون DB)
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Server running on port', PORT);
});

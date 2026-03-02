require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

/* Middleware */
app.use(cors());
app.use(express.json());

/* Routes */
app.use('/api/admin', require('./src/routes/adminAuth.routes'));
app.use('/api/admin/dashboard', require('./src/routes/adminDashboard.routes'));
app.use('/api/admin/analytics', require('./src/routes/analytics.routes'));
app.use('/api/admin/overtime', require('./src/routes/overtimeOffers.routes'));

/* Health */
app.get('/health', (_, res) => res.json({ status: 'OK' }));

module.exports = app;

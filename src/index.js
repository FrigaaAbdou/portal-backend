const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

const { paymentsRouter, handleStripeWebhook } = require('./routes/payments');
const seedAdmin = require('./utils/seedAdmin');

const app = express();

// Middleware
app.use(morgan('dev'));
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || '*',
  credentials: true,
}));
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);
app.use(express.json());

// Health route
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'server', time: new Date().toISOString() });
});

// DB connect (optional if MONGODB_URI provided)
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  mongoose
    .connect(MONGODB_URI)
    .then(async () => {
      console.log('MongoDB connected');
      await seedAdmin();
    })
    .catch((err) => console.error('MongoDB connection error:', err.message));
} else {
  console.log('No MONGODB_URI provided — skipping DB connection');
}

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/players', require('./routes/players'));
app.use('/api/coaches', require('./routes/coaches'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/verification', require('./routes/verification'));
app.use('/api/admin/verifications', require('./routes/adminVerifications'));
app.use('/api/admin/invites', require('./routes/adminInvites'));
app.use('/api/admin/announcements', require('./routes/adminAnnouncements'));
app.use('/api/admin/finance', require('./routes/adminFinance'));
app.use('/api/admin/users', require('./routes/adminUsers'));
app.use('/api/payments', paymentsRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});

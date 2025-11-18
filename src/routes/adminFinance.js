const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const { getStripeClient } = require('../services/stripe');

const router = express.Router();

router.use(adminAuth);

function parseDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function groupKey(date, groupBy) {
  if (groupBy === 'month') {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }
  return date.toISOString().slice(0, 10);
}

// Summary KPIs
router.get('/summary', async (req, res) => {
  try {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to (ISO date) are required' });
    }
    // plan and region accepted but not applied in this v1

    let stripe;
    try {
      stripe = getStripeClient();
    } catch (err) {
      return res.json({
        netRevenue: 0,
        mrr: 0,
        activeSubscribers: 0,
        newSubscriptions: 0,
        warning: 'Stripe not configured; returning empty summary.',
      });
    }

    const createdFilter = { gte: Math.floor(from.getTime() / 1000), lte: Math.floor(to.getTime() / 1000) };

    const [charges, subs, refunds] = await Promise.all([
      stripe.charges.list({ limit: 100, status: 'succeeded', created: createdFilter, expand: ['data.balance_transaction', 'data.refunds'] }),
      stripe.subscriptions.list({ status: 'all', limit: 100 }),
      stripe.refunds.list({ limit: 100, created: createdFilter }),
    ]);

    let netRevenueCents = 0;
    charges.data.forEach((ch) => {
      const fee = ch.balance_transaction?.fee || 0;
      const refunded = ch.amount_refunded || 0;
      netRevenueCents += (ch.amount || 0) - fee - refunded;
    });
    refunds.data.forEach((ref) => {
      netRevenueCents -= ref.amount || 0;
    });

    let activeSubscribers = 0;
    let mrrCents = 0;
    let newSubscriptions = 0;
    const periodStart = from.getTime() / 1000;
    const periodEnd = to.getTime() / 1000;

    subs.data.forEach((sub) => {
      if (['active', 'trialing'].includes(sub.status)) {
        activeSubscribers += 1;
        const item = sub.items?.data?.[0];
        const unit = item?.price?.unit_amount || 0;
        mrrCents += unit;
      }
      if (sub.start_date && sub.start_date >= periodStart && sub.start_date <= periodEnd) {
        if (sub.status === 'active' || sub.status === 'trialing') {
          newSubscriptions += 1;
        }
      }
    });

    res.json({
      netRevenue: Math.round(netRevenueCents) / 100,
      mrr: Math.round(mrrCents) / 100,
      activeSubscribers,
      newSubscriptions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load finance summary' });
  }
});

// Revenue timeseries
router.get('/revenue-timeseries', async (req, res) => {
  try {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const spanDays = Math.max(1, Math.ceil((to - from) / (1000 * 60 * 60 * 24)));
    const groupBy = req.query.groupBy === 'month' ? 'month' : (spanDays > 90 ? 'month' : 'day');
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to (ISO date) are required' });
    }

    let stripe;
    try {
      stripe = getStripeClient();
    } catch (err) {
      // Return mock points
      const points = [];
      const days = Math.max(1, Math.ceil((to - from) / (1000 * 60 * 60 * 24)));
      for (let i = 0; i < Math.min(days, 15); i += 1) {
        const d = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
        points.push({ date: d.toISOString().slice(0, 10), netRevenue: 0 });
      }
      return res.json({ groupBy, points });
    }

    const invoices = await stripe.invoices.list({
      limit: 100,
      status: 'paid',
      created: { gte: Math.floor(from.getTime() / 1000), lte: Math.floor(to.getTime() / 1000) },
    });

    const bucket = {};
    invoices.data.forEach((inv) => {
      const date = new Date(inv.created * 1000);
      const key = groupKey(date, groupBy);
      bucket[key] = (bucket[key] || 0) + ((inv.amount_paid || 0) - (inv.amount_refunded || 0));
    });

    const keys = Object.keys(bucket).sort();
    const points = keys.map((k) => ({ date: k, netRevenue: Math.round(bucket[k]) / 100 }));
    res.json({ groupBy, points });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load revenue timeseries' });
  }
});

// Subscriptions timeseries
router.get('/subscriptions-timeseries', async (req, res) => {
  try {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const spanDays = Math.max(1, Math.ceil((to - from) / (1000 * 60 * 60 * 24)));
    const groupBy = req.query.groupBy === 'month' ? 'month' : (spanDays > 90 ? 'month' : 'day');
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to (ISO date) are required' });
    }

    let stripe;
    try {
      stripe = getStripeClient();
    } catch (err) {
      return res.json({ groupBy, points: [] });
    }

    const subs = await stripe.subscriptions.list({ status: 'all', limit: 100 });
    const bucket = {};
    const periodStart = from.getTime() / 1000;
    const periodEnd = to.getTime() / 1000;

    subs.data.forEach((sub) => {
      const start = sub.start_date;
      const cancel = sub.ended_at;
      if (start && start >= periodStart && start <= periodEnd) {
        const keyDate = new Date(start * 1000);
        const key = groupKey(keyDate, groupBy);
        bucket[key] = bucket[key] || { newSubscriptions: 0, cancelledSubscriptions: 0 };
        bucket[key].newSubscriptions += 1;
      }
      if (cancel && cancel >= periodStart && cancel <= periodEnd) {
        const keyDate = new Date(cancel * 1000);
        const key = groupKey(keyDate, groupBy);
        bucket[key] = bucket[key] || { newSubscriptions: 0, cancelledSubscriptions: 0 };
        bucket[key].cancelledSubscriptions += 1;
      }
    });

    const keys = Object.keys(bucket).sort();
    const points = keys.map((k) => ({ date: k, ...bucket[k] }));
    res.json({ groupBy, points });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load subscriptions timeseries' });
  }
});

// Transactions table
router.get('/transactions', async (req, res) => {
  try {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const statusFilter = req.query.status;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to (ISO date) are required' });
    }

    let stripe;
    try {
      stripe = getStripeClient();
    } catch (err) {
      return res.json({ page, limit, total: 0, transactions: [] });
    }

    const charges = await stripe.charges.list({
      limit,
      created: { gte: Math.floor(from.getTime() / 1000), lte: Math.floor(to.getTime() / 1000) },
      starting_after: req.query.starting_after || undefined,
      ending_before: req.query.ending_before || undefined,
      expand: ['data.invoice'],
    });

    const filtered = charges.data.filter((c) => {
      if (statusFilter === 'paid') return c.status === 'succeeded';
      if (statusFilter === 'failed') return c.status === 'failed';
      if (statusFilter === 'refunded') return c.refunded === true || (c.amount_refunded || 0) > 0;
      return true;
    }).filter((c) => {
      if (req.query.plan && c.metadata?.plan && c.metadata.plan !== req.query.plan) return false;
      if (req.query.region && c.metadata?.region && c.metadata.region !== req.query.region) return false;
      return true;
    });

    const data = filtered.map((c) => ({
      id: c.id,
      date: c.created ? new Date(c.created * 1000).toISOString() : null,
      userName: c.billing_details?.name || c.customer || 'Customer',
      userId: c.customer || '',
      plan: c.metadata?.plan || '',
      amount: (c.amount || 0) / 100,
      currency: (c.currency || 'usd').toUpperCase(),
      status: c.status || '',
      method: c.payment_method_details?.type || '',
      invoiceId: typeof c.invoice === 'object' && c.invoice !== null ? c.invoice.id : (c.invoice || ''),
      country: c.billing_details?.address?.country || '',
      providerReference: c.payment_intent || '',
    }));

    res.json({
      page,
      limit,
      total: data.length,
      transactions: data,
      pageInfo: {
        hasMore: Boolean(charges.has_more),
        nextCursor: charges.data.length ? charges.data[charges.data.length - 1].id : null,
        prevCursor: charges.data.length ? charges.data[0].id : null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load transactions' });
  }
});

module.exports = router;

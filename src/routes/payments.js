const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { getStripeClient } = require('../services/stripe');

const router = express.Router();

function getClientOrigin() {
  return process.env.CLIENT_ORIGIN || 'http://localhost:5173';
}

function resolvePriceId(input) {
  if (input) return input;
  return process.env.STRIPE_PRICE_MONTHLY;
}

async function getOrCreateCustomer(user) {
  const stripe = getStripeClient();
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: {
      userId: user._id.toString(),
    },
  });

  user.stripeCustomerId = customer.id;
  await user.save();
  return customer.id;
}

router.post('/checkout', auth, async (req, res) => {
  try {
    const { priceId } = req.body || {};
    const resolvedPriceId = resolvePriceId(priceId);
    if (!resolvedPriceId) {
      return res.status(400).json({ error: 'Stripe price ID is required' });
    }

    const user = await User.findById(req.user.id).select('email stripeCustomerId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stripe = getStripeClient();
    const customerId = await getOrCreateCustomer(user);
    const clientOrigin = getClientOrigin();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      success_url: `${clientOrigin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientOrigin}/billing/canceled`,
      metadata: {
        userId: user._id.toString(),
        priceId: resolvedPriceId,
      },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

router.post('/portal', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('stripeCustomerId');
    if (!user || !user.stripeCustomerId) {
      return res.status(400).json({ error: 'Stripe customer not found for user' });
    }

    const stripe = getStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${getClientOrigin()}/settings`,
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe portal error', err);
    return res.status(500).json({ error: 'Failed to create portal session' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('subscriptionStatus subscriptionCurrentPeriodEnd subscriptionPriceId stripeCustomerId stripeSubscriptionId')
      .lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      status: user.subscriptionStatus || 'none',
      currentPeriodEnd: user.subscriptionCurrentPeriodEnd || null,
      priceId: user.subscriptionPriceId || null,
      stripeCustomerId: user.stripeCustomerId || null,
      stripeSubscriptionId: user.stripeSubscriptionId || null,
    });
  } catch (err) {
    console.error('Stripe subscription lookup error', err);
    res.status(500).json({ error: 'Failed to load subscription info' });
  }
});

async function updateUserSubscription(userId, payload) {
  if (!userId) return;
  const update = {};
  if (payload.customer) {
    update.stripeCustomerId = payload.customer;
  }
  if (payload.id) {
    update.stripeSubscriptionId = payload.id;
  }
  if (payload.status) {
    update.subscriptionStatus = payload.status;
  }
  if (payload.current_period_end) {
    update.subscriptionCurrentPeriodEnd = new Date(payload.current_period_end * 1000);
  }
  if (payload.items?.data?.[0]?.price?.id) {
    update.subscriptionPriceId = payload.items.data[0].price.id;
  }
  await User.findByIdAndUpdate(userId, { $set: update }).exec();
}

async function handleCheckoutSessionCompleted(session) {
  const userId = session.metadata?.userId;
  const subscriptionId = session.subscription;
  if (!userId || !subscriptionId) return;

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await updateUserSubscription(userId, subscription);
}

async function handleSubscriptionUpdated(subscription) {
  const userId = subscription.metadata?.userId;
  if (userId) {
    await updateUserSubscription(userId, subscription);
    return;
  }

  if (subscription.customer) {
    const user = await User.findOne({ stripeCustomerId: subscription.customer }).select('_id');
    if (user) {
      await updateUserSubscription(user._id, subscription);
    }
  }
}

async function handleInvoicePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;
  const user = await User.findOne({ stripeSubscriptionId: subscriptionId }).select('_id');
  if (user) {
    await User.findByIdAndUpdate(user._id, {
      $set: {
        subscriptionStatus: 'past_due',
      },
    });
  }
}

async function handleStripeWebhook(req, res) {
  const stripe = getStripeClient();
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET');
    return res.status(500).send('Webhook secret not configured');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error('Stripe webhook handler error', err);
    return res.status(500).send('Webhook handler failed');
  }

  return res.json({ received: true });
}

module.exports = {
  paymentsRouter: router,
  handleStripeWebhook,
};

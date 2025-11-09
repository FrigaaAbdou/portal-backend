const Stripe = require('stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

let stripeClient = null;

function getStripeClient() {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  if (!stripeClient) {
    stripeClient = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
    });
  }
  return stripeClient;
}

module.exports = {
  getStripeClient,
};

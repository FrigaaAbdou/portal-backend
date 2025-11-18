const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function seedAdmin() {
  try {
    const email = process.env.ADMIN_SEED_EMAIL;
    const password = process.env.ADMIN_SEED_PASSWORD;
    if (!email || !password) return;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return;

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      role: 'admin',
    });

    console.log(`Seeded admin user ${user.email}`);
  } catch (err) {
    console.error('Failed to seed admin user', err);
  }
}

module.exports = seedAdmin;

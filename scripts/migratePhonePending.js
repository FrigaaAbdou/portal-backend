const path = require('path')
const mongoose = require('mongoose')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const PlayerProfile = require('../src/models/PlayerProfile')

async function run() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI is required to run this migration.')
    process.exit(1)
  }

  await mongoose.connect(uri)

  const now = new Date()
  const result = await PlayerProfile.updateMany(
    { 'verification.status': 'phone_pending' },
    { $set: { 'verification.status': 'stats_pending', 'verification.updatedAt': now } }
  )

  const modified = result?.modifiedCount ?? result?.nModified ?? 0
  console.log(`Updated ${modified} player profiles from phone_pending to stats_pending.`)

  await mongoose.disconnect()
}

run()
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })

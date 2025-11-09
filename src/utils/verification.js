const crypto = require('crypto');

const CODE_LENGTH = 6;
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateNumericCode(length = CODE_LENGTH) {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < length; i += 1) {
    const idx = crypto.randomInt(0, digits.length);
    code += digits[idx];
  }
  return code;
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function buildCodeRecord(code) {
  return {
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
    lastSentAt: new Date(),
  };
}

function isCodeValid(record = {}, code) {
  if (!record || !record.codeHash || !record.expiresAt) return false;
  if (new Date(record.expiresAt).getTime() < Date.now()) return false;
  return hashCode(code) === record.codeHash;
}

module.exports = {
  CODE_LENGTH,
  CODE_TTL_MS,
  generateNumericCode,
  hashCode,
  buildCodeRecord,
  isCodeValid,
};

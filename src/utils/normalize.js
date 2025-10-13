function normalizeInstitutionName(value) {
  if (!value || typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

module.exports = {
  normalizeInstitutionName,
};

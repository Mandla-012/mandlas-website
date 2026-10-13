const toCents = (rands) => Math.round(Number(rands) * 100);
const toRands = (cents) => Math.round(Number(cents || 0)) / 100;
const fmt = (cents) => 'R' + (Number(cents || 0) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

module.exports = { toCents, toRands, fmt };

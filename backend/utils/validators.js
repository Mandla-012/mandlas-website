// Strict input checks used by the settings and checkout screens.
const NAME_RE = /^[\p{L}][\p{L}\p{M}'’ .-]{1,79}$/u;

// Removes control characters and squashes spaces
const cleanText = (v, max) =>
    typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

// South African numbers: 0821234567 or +27821234567 -> +27821234567. '' is allowed (clears it). null = invalid.
function normPhone(v) {
    const s = String(v == null ? '' : v).replace(/[\s-]/g, '');
    if (!s) return '';
    const m = /^(?:\+27|0)([1-9]\d{8})$/.exec(s);
    return m ? '+27' + m[1] : null;
}

// Letters only, lower case. Used to compare names such as the bank account holder.
const normName = (s) => String(s || '').toLowerCase().replace(/[^\p{L}]/gu, '');

module.exports = { NAME_RE, cleanText, normPhone, normName };

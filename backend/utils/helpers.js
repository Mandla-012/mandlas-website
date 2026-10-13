const { ID_RE } = require('../config/constants');

const isId = (v) => typeof v === 'string' && ID_RE.test(v);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "Mandla Kwabe" -> "Mandla K." unless the person chose to show their full name
function publicName(user, viewerId) {
    if (!user) return 'Someone';
    if (viewerId && String(user._id) === String(viewerId)) return user.fullName;
    if (user.privacy && user.privacy.showFullName) return user.fullName;
    const parts = String(user.fullName || '').trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0] || 'Someone';
}

module.exports = { isId, str, escapeRegex, publicName };

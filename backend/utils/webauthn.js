// Face ID / fingerprint / Windows Hello through WebAuthn (passkeys).
const { WEBAUTHN_ORIGIN, WEBAUTHN_RP_ID } = require('../config/env');

let lib;
async function webauthn() {
    if (!lib) lib = await import('@simplewebauthn/server');
    return lib;
}

// Which website address the passkey belongs to. On localhost this works as-is;
// behind a tunnel or on a real domain, set WEBAUTHN_ORIGIN in .env.
function relyingParty(req) {
    const origin = WEBAUTHN_ORIGIN || `${req.protocol}://${req.get('host')}`;
    const rpID = WEBAUTHN_RP_ID || new URL(origin).hostname;
    return { origin, rpID, rpName: "Mandla's Tech..." };
}

module.exports = { webauthn, relyingParty };

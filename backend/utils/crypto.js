// AES-256-GCM encryption for sensitive values such as bank account numbers.
const crypto = require('crypto');
const { DATA_ENCRYPTION_KEY, JWT_SECRET } = require('../config/env');

const key = crypto.createHash('sha256').update('mt-data-v1:' + (DATA_ENCRYPTION_KEY || JWT_SECRET)).digest();

function encrypt(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(payload) {
    const [version, iv, tag, data] = String(payload).split(':');
    if (version !== 'v1') throw new Error('Unknown encryption format');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

module.exports = { encrypt, decrypt, sha256 };

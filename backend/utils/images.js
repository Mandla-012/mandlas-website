// Validates an uploaded photo (data URL) and turns it into binary.
function parseImage(dataUrl, maxBytes = 400 * 1024) {
    if (typeof dataUrl !== 'string') return null;
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!m) return null;
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length < 100 || buf.length > maxBytes) return null;
    const type = m[1];
    const okSignature =
        type === 'image/jpeg'
            ? buf[0] === 0xff && buf[1] === 0xd8
            : type === 'image/png'
            ? buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
            : buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
    return okSignature ? { data: buf, contentType: type } : null;
}

module.exports = { parseImage };

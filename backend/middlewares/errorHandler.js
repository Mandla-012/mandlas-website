// Unknown /api routes return JSON, and bad bodies return a clean error.
function notFoundApi(req, res) {
    res.status(404).json({ success: false, message: 'Not found.' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    if (err.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'That upload is too large.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Invalid request.' });
    console.error(err);
    res.status(500).json({ success: false, message: 'Something went wrong.' });
}

module.exports = { notFoundApi, errorHandler };

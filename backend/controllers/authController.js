const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { EMAIL_RE } = require('../config/constants');
const { str } = require('../utils/helpers');
const { publicUser } = require('../utils/mappers');
const { issueSession, clearSession } = require('../utils/session');

exports.register = async (req, res) => {
    try {
        const body = req.body || {};
        const fullName = str(body.fullName, 80);
        const email = str(body.email, 254).toLowerCase();
        const password = typeof body.password === 'string' ? body.password : '';

        if (fullName.length < 2) return res.status(400).json({ success: false, message: 'Enter your full name (2 to 80 characters).' });
        if (!EMAIL_RE.test(email)) return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
        // bcrypt only uses the first 72 bytes, so cap it
        if (password.length < 8 || password.length > 72) {
            return res.status(400).json({ success: false, message: 'Password must be 8 to 72 characters.' });
        }
        if (await User.findOne({ email })) {
            return res.status(409).json({ success: false, message: 'That email is already registered. Try logging in.' });
        }

        const user = await User.create({ fullName, email, password: await bcrypt.hash(password, 12) });
        issueSession(res, user, body.rememberMe === true);
        res.status(201).json({ success: true, user: publicUser(user) });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'That email is already registered. Try logging in.' });
        }
        console.error(error);
        res.status(500).json({ success: false, message: 'Something went wrong. Try again.' });
    }
};

exports.login = async (req, res) => {
    try {
        const body = req.body || {};
        const email = str(body.email, 254).toLowerCase();
        const password = typeof body.password === 'string' ? body.password : '';

        const user = email ? await User.findOne({ email }) : null;
        const isMatch = user ? await bcrypt.compare(password, user.password) : false;
        // Same message for "no such user" and "wrong password" so attackers can't probe for accounts
        if (!user || !isMatch) {
            return res.status(401).json({ success: false, message: 'Incorrect email or password.' });
        }
        issueSession(res, user, body.rememberMe === true);
        res.json({ success: true, user: publicUser(user) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Something went wrong. Try again.' });
    }
};

exports.logout = (req, res) => {
    clearSession(res);
    res.json({ success: true });
};

exports.me = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(401).json({ success: false, message: 'Please log in first.' });
        res.json({ success: true, user: publicUser(user) });
    } catch {
        res.status(500).json({ success: false, message: 'Something went wrong. Try again.' });
    }
};

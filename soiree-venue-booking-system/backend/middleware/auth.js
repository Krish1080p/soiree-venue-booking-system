const jwt = require('jsonwebtoken');

function readToken(req) {
  return req.cookies?.soiree_token || null;
}

function authenticate(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.clearCookie('soiree_token', cookieOptions());
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch { /* public request */ }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
  next();
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000
  };
}

module.exports = { authenticate, optionalAuth, requireAdmin, cookieOptions };

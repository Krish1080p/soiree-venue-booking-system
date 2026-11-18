const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const pool = require('../db/pool');
const { authenticate, cookieOptions } = require('../middleware/auth');

const router = express.Router();
const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(72),
  phone: z.string().trim().max(20).optional().or(z.literal(''))
});
const loginSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(1).max(72)
});

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, role: row.role };
}

function setSession(res, user) {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h', issuer: 'soiree-venue-booking' }
  );
  res.cookie('soiree_token', token, cookieOptions());
}

router.post('/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { name, email, password, phone } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users(name,email,password_hash,phone)
       VALUES($1,lower($2),$3,$4)
       RETURNING id,name,email,phone,role`,
      [name, email, passwordHash, phone || null]
    );
    const user = publicUser(result.rows[0]);
    setSession(res, user);
    res.status(201).json({ user });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
    const { email, password } = parsed.data;
    const result = await pool.query(
      'SELECT id,name,email,password_hash,phone,role FROM users WHERE lower(email)=lower($1)',
      [email]
    );
    const userRow = result.rows[0];
    const valid = userRow && await bcrypt.compare(password, userRow.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect email or password.' });
    const user = publicUser(userRow);
    setSession(res, user);
    res.json({ user });
  } catch (error) { next(error); }
});

router.post('/logout', (req, res) => {
  res.clearCookie('soiree_token', cookieOptions());
  res.json({ message: 'You have been signed out.' });
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id,name,email,phone,role FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!result.rowCount) {
      res.clearCookie('soiree_token', cookieOptions());
      return res.status(401).json({ error: 'Account no longer exists.' });
    }
    res.json({ user: publicUser(result.rows[0]) });
  } catch (error) { next(error); }
});

module.exports = router;

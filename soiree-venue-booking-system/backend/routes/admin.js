const express = require('express');
const { z } = require('zod');
const pool = require('../db/pool');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate, requireAdmin);

router.get('/dashboard', async (req, res, next) => {
  try {
    const [counts, revenue, recent] = await Promise.all([
      pool.query(`SELECT
        (SELECT count(*) FROM venues WHERE is_active) AS venues,
        (SELECT count(*) FROM bookings) AS bookings,
        (SELECT count(*) FROM users WHERE role='user') AS customers,
        (SELECT count(*) FROM bookings WHERE status='pending') AS pending`),
      pool.query(`SELECT COALESCE(sum(total_price),0) AS revenue FROM bookings WHERE status='confirmed'`),
      pool.query(`SELECT b.id,b.booking_date,b.status,b.total_price,u.name AS customer_name,v.name AS venue_name
                  FROM bookings b JOIN users u ON u.id=b.user_id JOIN venues v ON v.id=b.venue_id
                  ORDER BY b.created_at DESC LIMIT 8`)
    ]);
    res.json({ stats: { ...counts.rows[0], revenue: revenue.rows[0].revenue }, recent: recent.rows });
  } catch (error) { next(error); }
});

router.post('/venues', async (req, res, next) => {
  try {
    const schema = z.object({
      categoryId: z.coerce.number().int().positive(),
      name: z.string().trim().min(2).max(140),
      description: z.string().trim().min(10),
      location: z.string().trim().min(2).max(160),
      city: z.string().trim().min(2).max(80),
      capacity: z.coerce.number().int().positive(),
      pricePerSlot: z.coerce.number().nonnegative(),
      imageUrl: z.string().url().optional().or(z.literal('')),
      amenities: z.array(z.string().trim().min(1).max(60)).max(30).default([])
    }).safeParse(req.body);
    if (!schema.success) return res.status(400).json({ error: schema.error.issues[0].message });
    const d = schema.data;
    const result = await pool.query(
      `INSERT INTO venues(category_id,name,description,location,city,capacity,price_per_slot,image_url,amenities)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id,name,city,capacity,price_per_slot`,
      [d.categoryId,d.name,d.description,d.location,d.city,d.capacity,d.pricePerSlot,d.imageUrl || null,d.amenities]
    );
    res.status(201).json({ venue: result.rows[0] });
  } catch (error) { next(error); }
});

router.patch('/venues/:id/active', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid venue id.' });
    const active = z.boolean().safeParse(req.body.active);
    if (!active.success) return res.status(400).json({ error: 'active must be true or false.' });
    const result = await pool.query('UPDATE venues SET is_active=$1 WHERE id=$2 RETURNING id,is_active',[active.data,req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Venue not found.' });
    res.json({ venue: result.rows[0] });
  } catch (error) { next(error); }
});

module.exports = router;

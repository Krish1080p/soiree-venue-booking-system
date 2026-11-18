const express = require('express');
const { z } = require('zod');
const pool = require('../db/pool');

const router = express.Router();

router.get('/categories', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id,name,slug,tagline,description FROM categories ORDER BY id');
    res.json({ categories: result.rows });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const filters = z.object({
      q: z.string().trim().max(100).optional(),
      city: z.string().trim().max(80).optional(),
      category: z.string().trim().max(80).optional(),
      guests: z.coerce.number().int().positive().max(100000).optional(),
      maxPrice: z.coerce.number().nonnegative().max(100000000).optional(),
      sort: z.enum(['recommended','price_asc','price_desc','capacity']).optional()
    }).safeParse(req.query);
    if (!filters.success) return res.status(400).json({ error: 'Invalid venue filters.' });
    const f = filters.data;
    const values = [];
    const where = ['v.is_active=TRUE'];
    const add = (value) => { values.push(value); return `$${values.length}`; };
    if (f.q) {
      const p = add(`%${f.q}%`);
      where.push(`(v.name ILIKE ${p} OR v.description ILIKE ${p} OR v.location ILIKE ${p} OR v.city ILIKE ${p})`);
    }
    if (f.city) where.push(`v.city ILIKE ${add(f.city)}`);
    if (f.category) where.push(`c.slug=${add(f.category)}`);
    if (f.guests) where.push(`v.capacity >= ${add(f.guests)}`);
    if (f.maxPrice !== undefined) where.push(`v.price_per_slot <= ${add(f.maxPrice)}`);
    const order = {
      recommended: 'v.rating DESC,v.name ASC',
      price_asc: 'v.price_per_slot ASC',
      price_desc: 'v.price_per_slot DESC',
      capacity: 'v.capacity DESC'
    }[f.sort || 'recommended'];
    const result = await pool.query(
      `SELECT v.id,v.name,v.description,v.location,v.city,v.capacity,
              v.price_per_slot,v.amenities,v.image_url,v.rating,
              c.name AS category_name,c.slug AS category_slug
       FROM venues v JOIN categories c ON c.id=v.category_id
       WHERE ${where.join(' AND ')} ORDER BY ${order}`,
      values
    );
    res.json({ venues: result.rows });
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid venue id.' });
    const result = await pool.query(
      `SELECT v.*,c.name AS category_name,c.slug AS category_slug
       FROM venues v JOIN categories c ON c.id=v.category_id
       WHERE v.id=$1 AND v.is_active=TRUE`,
      [req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Venue not found.' });
    const slots = await pool.query(
      'SELECT slot_name,label,start_time,end_time,price_multiplier,sort_order FROM time_slots ORDER BY sort_order'
    );
    const vendors = await pool.query(
      `SELECT d.id,d.name,d.type,d.description,d.city,d.price_from,d.price_unit,d.rating
       FROM vendors d JOIN venue_vendors vv ON vv.vendor_id=d.id
       WHERE vv.venue_id=$1 AND d.is_active=TRUE ORDER BY d.rating DESC`,
      [req.params.id]
    );
    res.json({ venue: result.rows[0], slots: slots.rows, vendors: vendors.rows });
  } catch (error) { next(error); }
});

router.get('/:id/availability', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid venue id.' });
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.date);
    if (!date.success) return res.status(400).json({ error: 'Provide a date in YYYY-MM-DD format.' });
    const result = await pool.query(
      `SELECT t.slot_name,t.label,t.price_multiplier,
              (b.id IS NOT NULL) AS booked
       FROM time_slots t
       LEFT JOIN bookings b
         ON b.slot_name=t.slot_name AND b.booking_date=$1::date AND b.venue_id=$2
       ORDER BY t.sort_order`,
      [date.data, req.params.id]
    );
    res.json({ date: date.data, slots: result.rows });
  } catch (error) { next(error); }
});

module.exports = router;

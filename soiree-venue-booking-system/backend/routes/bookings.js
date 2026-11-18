const express = require('express');
const { z } = require('zod');
const pool = require('../db/pool');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const createSchema = z.object({
  venueId: z.coerce.number().int().positive(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotName: z.enum(['Morning','Afternoon','Evening']),
  eventType: z.string().trim().min(2).max(60),
  guestCount: z.coerce.number().int().positive().max(100000),
  vendorId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  notes: z.string().trim().max(1000).optional()
});

router.use(authenticate);

router.post('/', async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const data = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const venueResult = await client.query(
      `SELECT v.id,v.capacity,v.price_per_slot,v.is_active
       FROM venues v WHERE v.id=$1 FOR SHARE`,
      [data.venueId]
    );
    if (!venueResult.rowCount || !venueResult.rows[0].is_active) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'This venue is unavailable.' });
    }
    const venue = venueResult.rows[0];
    if (data.guestCount > venue.capacity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Guest count exceeds this venue's capacity of ${venue.capacity}.` });
    }
    const dateResult = await client.query(
      `SELECT ($1::date >= CURRENT_DATE) AS valid,
              ($1::date IS NOT NULL) AS parseable`,
      [data.bookingDate]
    );
    if (!dateResult.rows[0].valid) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Booking date cannot be in the past.' });
    }
    const slotResult = await client.query(
      'SELECT price_multiplier FROM time_slots WHERE slot_name=$1',
      [data.slotName]
    );
    if (!slotResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Selected time slot does not exist.' });
    }
    if (data.vendorId) {
      const vendorResult = await client.query(
        `SELECT 1 FROM venue_vendors vv JOIN vendors d ON d.id=vv.vendor_id
         WHERE vv.venue_id=$1 AND vv.vendor_id=$2 AND d.is_active=TRUE`,
        [data.venueId, data.vendorId]
      );
      if (!vendorResult.rowCount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Selected vendor is not available for this venue.' });
      }
    }

    // Release only cancelled/rejected rows. Archive and delete are atomic with the new insert.
    await client.query(
      `INSERT INTO bookings_archive
       (id,user_id,venue_id,vendor_id,booking_date,slot_name,event_type,guest_count,total_price,status,notes,created_at,updated_at)
       SELECT id,user_id,venue_id,vendor_id,booking_date,slot_name,event_type,guest_count,total_price,status,notes,created_at,updated_at
       FROM bookings
       WHERE venue_id=$1 AND booking_date=$2::date AND slot_name=$3
         AND status IN ('cancelled','rejected')`,
      [data.venueId, data.bookingDate, data.slotName]
    );
    await client.query(
      `DELETE FROM bookings WHERE venue_id=$1 AND booking_date=$2::date AND slot_name=$3
       AND status IN ('cancelled','rejected')`,
      [data.venueId, data.bookingDate, data.slotName]
    );

    const total = Number(venue.price_per_slot) * Number(slotResult.rows[0].price_multiplier);
    const inserted = await client.query(
      `INSERT INTO bookings
       (user_id,venue_id,vendor_id,booking_date,slot_name,event_type,guest_count,total_price,notes)
       VALUES($1,$2,$3,$4::date,$5,$6,$7,$8,$9)
       RETURNING id,user_id,venue_id,vendor_id,booking_date,slot_name,event_type,guest_count,total_price,status,notes,created_at`,
      [req.user.id,data.venueId,data.vendorId || null,data.bookingDate,data.slotName,data.eventType,data.guestCount,total,data.notes || null]
    );
    await client.query('COMMIT');
    res.status(201).json({ booking: inserted.rows[0], message: 'Booking request created successfully.' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* transaction may already be closed */ }
    if (error.code === '23505' && error.constraint === 'unique_venue_slot') {
      return res.status(409).json({ error: 'That venue and time slot has just been booked. Please choose another slot.' });
    }
    next(error);
  } finally {
    client.release();
  }
});

router.get('/mine', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.id,b.booking_date,b.slot_name,b.event_type,b.guest_count,b.total_price,b.status,b.notes,b.created_at,
              v.name AS venue_name,v.city,v.location,d.name AS vendor_name
       FROM bookings b JOIN venues v ON v.id=b.venue_id
       LEFT JOIN vendors d ON d.id=b.vendor_id
       WHERE b.user_id=$1 ORDER BY b.booking_date DESC,b.created_at DESC`,
      [req.user.id]
    );
    res.json({ bookings: result.rows });
  } catch (error) { next(error); }
});

router.patch('/:id/cancel', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid booking id.' });
    const result = await pool.query(
      `UPDATE bookings SET status='cancelled',updated_at=now()
       WHERE id=$1 AND user_id=$2 AND status IN ('pending','confirmed')
         AND booking_date >= CURRENT_DATE
       RETURNING id,status`,
      [req.params.id,req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Booking could not be cancelled. It may already be completed or unavailable.' });
    res.json({ booking: result.rows[0], message: 'Booking cancelled.' });
  } catch (error) { next(error); }
});

router.get('/admin/all', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.id,b.booking_date,b.slot_name,b.event_type,b.guest_count,b.total_price,b.status,b.created_at,
              u.name AS customer_name,u.email AS customer_email,
              v.name AS venue_name,v.city
       FROM bookings b JOIN users u ON u.id=b.user_id JOIN venues v ON v.id=b.venue_id
       ORDER BY b.created_at DESC LIMIT 500`
    );
    res.json({ bookings: result.rows });
  } catch (error) { next(error); }
});

router.patch('/admin/:id/status', requireAdmin, async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid booking id.' });
    
    // Normalize and validate status input safely
    const rawStatus = typeof req.body.status === 'string' ? req.body.status.toLowerCase().trim() : '';
    const status = z.enum(['pending', 'confirmed', 'rejected', 'cancelled']).safeParse(rawStatus);
    
    if (!status.success) return res.status(400).json({ error: 'Invalid booking status.' });
    
    const result = await pool.query(
      `UPDATE bookings SET status=$1,updated_at=now()
       WHERE id=$2 RETURNING id,status`,
      [status.data, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Booking not found.' });
    res.json({ booking: result.rows[0] });
  } catch (error) { next(error); }
});

module.exports = router;
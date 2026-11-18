const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const type = req.query.type;
    const allowed = ['catering','decoration','entertainment'];
    if (type && !allowed.includes(type)) return res.status(400).json({ error: 'Invalid vendor type.' });
    const values = type ? [type] : [];
    const result = await pool.query(
      `SELECT id,name,type,description,city,price_from,price_unit,rating
       FROM vendors WHERE is_active=TRUE ${type ? 'AND type=$1' : ''}
       ORDER BY rating DESC,name`,
      values
    );
    res.json({ vendors: result.rows });
  } catch (error) { next(error); }
});

router.get('/:id/menu', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid vendor id.' });
    const result = await pool.query(
      `SELECT id,name,description,price,diet,course
       FROM menu_items WHERE vendor_id=$1 AND is_available=TRUE
       ORDER BY course, name`,
      [req.params.id]
    );
    res.json({ items: result.rows });
  } catch (error) { next(error); }
});

module.exports = router;

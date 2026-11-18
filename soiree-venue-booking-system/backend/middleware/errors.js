function notFound(req, res) {
  res.status(404).json({ error: 'The requested endpoint was not found.' });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  console.error(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
  if (err.code === '23503') return res.status(400).json({ error: 'A referenced record does not exist.' });
  if (err.code === '23514' || err.code === '22P02') return res.status(400).json({ error: 'Some submitted values are invalid.' });
  res.status(err.status || 500).json({
    error: err.status && err.status < 500 ? err.message : 'An unexpected server error occurred.'
  });
}

module.exports = { notFound, errorHandler };

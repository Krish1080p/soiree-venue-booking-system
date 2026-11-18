const { test } = require('node:test');
const assert = require('node:assert/strict');

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const date = process.env.TEST_BOOKING_DATE || '2030-01-15';

async function login(email, password) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({email,password})
  });
  assert.equal(response.status, 200, 'login should succeed');
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie, 'login should set an auth cookie');
  return cookie.split(';')[0];
}

test('health endpoint reports database connectivity', async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.database, 'connected');
});

test('database uniqueness prevents two simultaneous bookings for one slot', async () => {
  const cookieA = await login('aarav@example.com','User@123');
  const cookieB = await login('meera@example.com','User@123');
  const payload = {
    venueId: 1, bookingDate: date, slotName: 'Morning',
    eventType: 'Concurrency test', guestCount: 20, vendorId: null
  };
  // The chosen test date/key must not already be occupied.
  const send = cookie => fetch(`${base}/api/bookings`, {
    method:'POST',
    headers:{'content-type':'application/json','cookie':cookie},
    body:JSON.stringify(payload)
  });
  const results = await Promise.all([send(cookieA),send(cookieB)]);
  const statuses = results.map(r => r.status).sort((a,b)=>a-b);
  assert.deepEqual(statuses,[201,409]);
});

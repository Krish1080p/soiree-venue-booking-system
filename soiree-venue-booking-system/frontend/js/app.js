const state = { user: null, categories: [], venues: [], vendors: [], authMode: 'login', selectedVenue: null, selectedSlot: null, selectedDate: '', toastTimer: null };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
const dateLabel = value => new Date(`${String(value).slice(0,10)}T00:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
function openDialog(id) { const dialog = $(id); if (!dialog.open) dialog.showModal(); }
function closeDialog(id) { const dialog = $(id); if (dialog.open) dialog.close(); }
function setAuthUI() {
  $('#authBtn').textContent = state.user ? `Hi, ${state.user.name.split(' ')[0]}` : 'Sign in';
  $('#myBookingsBtn').textContent = state.user ? 'My bookings' : 'My bookings';
  $('#authBtn').onclick = () => state.user ? (state.user.role === 'admin' ? openAdmin() : openBookings()) : openDialog('#authDialog');
}
function authMode(mode) {
  state.authMode = mode;
  $$('.auth-tabs button').forEach(button => button.classList.toggle('active', button.dataset.authTab === mode));
  $('#nameWrap').classList.toggle('hidden', mode === 'login');
  $('#phoneWrap').classList.toggle('hidden', mode === 'login');
  $('#authTitle').textContent = mode === 'login' ? 'A good moment starts here.' : 'Let’s make it official.';
  $('#authSubmit').textContent = mode === 'login' ? 'Sign in' : 'Create account';
  $('#authForm [name=password]').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('#authMessage').textContent = '';
}
async function loadUser() {
  try { state.user = (await api('/api/auth/me')).user; }
  catch { state.user = null; }
  setAuthUI();
}
async function loadCategories() {
  const data = await api('/api/venues/categories');
  state.categories = data.categories;
  $('#categoryFilter').innerHTML = '<option value="">All occasions</option>' + data.categories.map(c => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('');
  $('#categoryChips').innerHTML = `<button class="chip active" data-category="">All spaces</button>` + data.categories.map(c => `<button class="chip" data-category="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</button>`).join('');
}
function currentFilters() {
  return {
    q: $('#searchQuery').value.trim(),
    category: $('#categoryFilter').value,
    guests: $('#guestFilter').value,
    maxPrice: $('#priceFilter').value,
    sort: $('#sortFilter').value
  };
}
async function loadVenues() {
  const filters = currentFilters();
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key,value]) => { if (value !== '') params.set(key,value); });
  $('#venueGrid').innerHTML = '<div class="loading">Finding beautiful spaces…</div>';
  try {
    const data = await api(`/api/venues?${params}`);
    state.venues = data.venues;
    renderVenues();
  } catch (error) {
    $('#venueGrid').innerHTML = `<div class="loading">${escapeHtml(error.message)}</div>`;
  }
}
function renderVenues() {
  $('#venueCount').textContent = `${state.venues.length} thoughtfully selected ${state.venues.length === 1 ? 'space' : 'spaces'}`;
  $('#venueGrid').innerHTML = state.venues.map(v => `
    <article class="venue-card">
      <div class="venue-image"><img loading="lazy" src="${escapeHtml(v.image_url || '')}" alt="${escapeHtml(v.name)}" onerror="this.src='https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=900'"><span class="venue-category">${escapeHtml(v.category_name)}</span></div>
      <div class="venue-info">
        <div class="venue-meta"><span>${escapeHtml(v.city)} · Up to ${Number(v.capacity).toLocaleString('en-IN')} guests</span><span class="rating">★ ${Number(v.rating).toFixed(1)}</span></div>
        <h3>${escapeHtml(v.name)}</h3><div class="venue-location">⌖ ${escapeHtml(v.location)}</div>
        <div class="venue-bottom"><div class="price"><strong>${money(v.price_per_slot)}</strong><small>starting price / slot</small></div><button class="card-link" data-book="${v.id}">VIEW & BOOK ↗</button></div>
      </div>
    </article>`).join('');
  $('#emptyState').classList.toggle('hidden', state.venues.length !== 0);
}
async function loadVendors() {
  try {
    const data = await api('/api/vendors');
    state.vendors = data.vendors;
    const icons = {catering:'♨',decoration:'✿',entertainment:'♫'};
    $('#vendorGrid').innerHTML = data.vendors.slice(0,6).map(v => `
      <article class="vendor-card"><div class="vendor-icon">${icons[v.type] || '✳'}</div><small>${escapeHtml(v.type)} · ★ ${Number(v.rating).toFixed(1)}</small>
      <h3>${escapeHtml(v.name)}</h3><p>${escapeHtml(v.description)}</p><strong>From ${money(v.price_from)} <span class="muted">${escapeHtml(v.price_unit)}</span></strong></article>`).join('');
  } catch { $('#vendorGrid').innerHTML = '<p class="muted">Event partners are temporarily unavailable.</p>'; }
}
async function showVenue(id) {
  try {
    const data = await api(`/api/venues/${id}`);
    state.selectedVenue = data.venue;
    state.selectedSlot = null;
    state.selectedDate = '';
    const v = data.venue;
    const today = new Date();
    const minDate = new Date(today.getTime() - today.getTimezoneOffset()*60000).toISOString().slice(0,10);
    $('#bookingContent').innerHTML = `
      <div class="booking-head"><img src="${escapeHtml(v.image_url || '')}" alt=""><div><div class="modal-kicker">${escapeHtml(v.category_name)}</div><h2>${escapeHtml(v.name)}</h2><p>${escapeHtml(v.location)}, ${escapeHtml(v.city)} · Capacity ${Number(v.capacity).toLocaleString('en-IN')}</p></div></div>
      <p class="muted">${escapeHtml(v.description)}</p>
      <div class="muted" style="margin:14px 0">${(v.amenities || []).map(a => `✓ ${escapeHtml(a)}`).join('　')}</div>
      <form id="bookingForm" class="booking-form">
        <label>Date<input name="bookingDate" type="date" min="${minDate}" required></label>
        <label>Event type<input name="eventType" maxlength="60" placeholder="e.g. Wedding reception" required></label>
        <div class="full"><label>Choose a time slot</label><div class="slot-options" id="slotOptions">${data.slots.map(s => `<button type="button" class="slot-option" data-slot="${escapeHtml(s.slot_name)}" data-multiplier="${s.price_multiplier}">${escapeHtml(s.label)}<br><small>${money(Number(v.price_per_slot)*Number(s.price_multiplier))}</small></button>`).join('')}</div></div>
        <label>Number of guests<input name="guestCount" type="number" min="1" max="${v.capacity}" placeholder="Up to ${v.capacity}" required></label>
        <label>Event partner (optional)<select name="vendorId"><option value="">No partner selected</option>${data.vendors.map(d => `<option value="${d.id}">${escapeHtml(d.name)} · ${escapeHtml(d.type)}</option>`).join('')}</select></label>
        <label class="full">Notes for the venue<textarea name="notes" maxlength="1000" placeholder="Any special requests?"></textarea></label>
        <div class="full modal-total"><span>Estimated venue price</span><strong id="bookingTotal">${money(v.price_per_slot)}</strong></div>
        <button class="button button-dark button-full full" type="submit">Send booking request ↗</button>
        <p class="form-message full" id="bookingMessage"></p>
      </form>`;
    openDialog('#bookingDialog');
    const dateInput = $('#bookingForm [name=bookingDate]');
    dateInput.addEventListener('change', () => refreshAvailability(id, dateInput.value));
    $('#slotOptions').addEventListener('click', event => {
      const button = event.target.closest('[data-slot]');
      if (!button || button.disabled) return;
      state.selectedSlot = button.dataset.slot;
      $$('.slot-option').forEach(el => el.classList.toggle('selected', el === button));
      updateBookingTotal();
    });
    $('#bookingForm').addEventListener('submit', submitBooking);
  } catch (error) { toast(error.message, true); }
}
async function refreshAvailability(venueId, date) {
  state.selectedDate = date;
  state.selectedSlot = null;
  $$('.slot-option').forEach(el => el.classList.remove('selected'));
  if (!date) return;
  try {
    const data = await api(`/api/venues/${venueId}/availability?date=${encodeURIComponent(date)}`);
    data.slots.forEach(slot => {
      const button = $(`[data-slot="${slot.slot_name}"]`);
      if (button) { button.disabled = slot.booked; button.title = slot.booked ? 'Already booked' : ''; }
    });
    updateBookingTotal();
  } catch (error) { toast(error.message, true); }
}
function updateBookingTotal() {
  const venue = state.selectedVenue;
  const selected = $(`[data-slot="${state.selectedSlot}"]`);
  const multiplier = selected ? Number(selected.dataset.multiplier) : 1;
  $('#bookingTotal').textContent = money(Number(venue.price_per_slot) * multiplier);
}
async function submitBooking(event) {
  event.preventDefault();
  if (!state.user) { closeDialog('#bookingDialog'); openDialog('#authDialog'); toast('Please sign in before requesting a booking.'); return; }
  if (!state.selectedSlot) { $('#bookingMessage').textContent = 'Choose an available time slot.'; return; }
  const form = new FormData(event.currentTarget);
  const payload = {
    venueId: state.selectedVenue.id,
    bookingDate: form.get('bookingDate'),
    slotName: state.selectedSlot,
    eventType: form.get('eventType'),
    guestCount: form.get('guestCount'),
    vendorId: form.get('vendorId') || null,
    notes: form.get('notes')
  };
  const button = $('#bookingForm button[type=submit]');
  button.disabled = true; button.textContent = 'Sending request…';
  try {
    const result = await api('/api/bookings', { method: 'POST', body: JSON.stringify(payload) });
    closeDialog('#bookingDialog');
    toast(`Booking request #${result.booking.id} received.`);
  } catch (error) {
    $('#bookingMessage').textContent = error.message;
    if (error.status === 409) await refreshAvailability(state.selectedVenue.id, payload.bookingDate);
  } finally { button.disabled = false; button.textContent = 'Send booking request ↗'; }
}
async function openBookings() {
  if (!state.user) { openDialog('#authDialog'); return; }
  try {
    const data = await api('/api/bookings/mine');
    $('#bookingsContent').innerHTML = `<div class="modal-kicker">YOUR SOIRÉE</div><h2>Your bookings</h2>
      ${data.bookings.length ? `<div class="booking-list">${data.bookings.map(b => `
        <article class="booking-item"><div><h3>${escapeHtml(b.venue_name)}</h3><p>${dateLabel(b.booking_date)} · ${escapeHtml(b.slot_name)} · ${escapeHtml(b.event_type)}</p><p>${escapeHtml(b.city)} · ${Number(b.guest_count)} guests · ${money(b.total_price)}</p>${b.vendor_name ? `<p>Partner: ${escapeHtml(b.vendor_name)}</p>` : ''}</div>
        <div><span class="status ${escapeHtml(b.status)}">${escapeHtml(b.status)}</span>${['pending','confirmed'].includes(b.status) && String(b.booking_date).slice(0,10) >= new Date().toISOString().slice(0,10) ? `<p><button class="card-link" data-cancel="${b.id}">CANCEL</button></p>` : ''}</div></article>`).join('')}</div>` : '<p class="muted">No bookings yet. Your next memorable event could start here.</p>'}
      <p class="muted">Cancelled and rejected bookings remain in your history.</p>`;
    openDialog('#bookingsDialog');
  } catch (error) { toast(error.message, true); }
}
async function cancelBooking(id) {
  if (!confirm('Cancel this booking request?')) return;
  try { await api(`/api/bookings/${id}/cancel`, { method: 'PATCH' }); toast('Booking cancelled.'); openBookings(); }
  catch (error) { toast(error.message, true); }
}
async function openAdmin() {
  if (!state.user || state.user.role !== 'admin') return openBookings();
  try {
    const [dashboard, bookings] = await Promise.all([api('/api/admin/dashboard'),api('/api/bookings/admin/all')]);
    const s = dashboard.stats;
    $('#adminContent').innerHTML = `<div class="modal-kicker">SOIRÉE CONTROL ROOM</div><h2>Admin dashboard</h2>
      <div class="admin-stats"><div class="stat"><small>Active venues</small><strong>${s.venues}</strong></div><div class="stat"><small>Total bookings</small><strong>${s.bookings}</strong></div><div class="stat"><small>Customers</small><strong>${s.customers}</strong></div><div class="stat"><small>Pending</small><strong>${s.pending}</strong></div></div>
      <p class="muted">Confirmed booking value: <strong>${money(s.revenue)}</strong></p>
      <h3 style="font:20px var(--serif)">Booking requests</h3><div class="table-scroll"><table class="admin-table"><thead><tr><th>EVENT</th><th>CUSTOMER</th><th>DATE</th><th>VALUE</th><th>STATUS</th></tr></thead><tbody>
      ${bookings.bookings.map(b => `<tr><td>${escapeHtml(b.venue_name)}</td><td>${escapeHtml(b.customer_name)}</td><td>${dateLabel(b.booking_date)}</td><td>${money(b.total_price)}</td><td><select data-status="${b.id}"><option value="pending" ${b.status==='pending'?'selected':''}>Pending</option><option value="confirmed" ${b.status==='confirmed'?'selected':''}>Confirmed</option><option value="rejected" ${b.status==='rejected'?'selected':''}>Rejected</option><option value="cancelled" ${b.status==='cancelled'?'selected':''}>Cancelled</option></select></td></tr>`).join('')}
      </tbody></table></div><p class="muted">Changing a status updates the booking immediately. Cancelled/rejected slots can be rebooked and are archived automatically.</p>`;
    openDialog('#adminDialog');
  } catch (error) { toast(error.message, true); }
}
async function changeBookingStatus(id, status) {
  try { await api(`/api/bookings/admin/${id}/status`, { method: 'PATCH', body: JSON.stringify({status}) }); toast('Booking status updated.'); }
  catch (error) { toast(error.message, true); openAdmin(); }
}

document.addEventListener('click', event => {
  const book = event.target.closest('[data-book]');
  if (book) showVenue(book.dataset.book);
  const cancel = event.target.closest('[data-cancel]');
  if (cancel) cancelBooking(cancel.dataset.cancel);
  const category = event.target.closest('[data-category]');
  if (category) {
    $('#categoryFilter').value = category.dataset.category;
    $$('.chip').forEach(chip => chip.classList.toggle('active', chip === category));
    loadVenues();
  }
  const close = event.target.closest('[data-close]');
  if (close) close.closest('dialog').close();
  const authTab = event.target.closest('[data-auth-tab]');
  if (authTab) authMode(authTab.dataset.authTab);
  const status = event.target.closest('[data-status]');
  if (status) changeBookingStatus(status.dataset.status, status.value);
});
$('#searchForm').addEventListener('submit', event => { event.preventDefault(); loadVenues(); });
$('#sortFilter').addEventListener('change', loadVenues);
$('#clearFilters').addEventListener('click', () => {
  $('#searchForm').reset(); $('#sortFilter').value = 'recommended'; $('#categoryFilter').value = '';
  $$('.chip').forEach(chip => chip.classList.toggle('active', !chip.dataset.category)); loadVenues();
});
$('#myBookingsBtn').addEventListener('click', openBookings);
$('#menuToggle').addEventListener('click', () => $('.main-nav').classList.toggle('open'));
$('#authForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  const endpoint = state.authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
  $('#authSubmit').disabled = true;
  try {
    const result = await api(endpoint,{method:'POST',body:JSON.stringify(payload)});
    state.user = result.user; setAuthUI(); closeDialog('#authDialog'); event.currentTarget.reset();
    toast(`Welcome${state.user.name ? `, ${state.user.name.split(' ')[0]}` : ''}.`);
    if (state.user.role === 'admin') openAdmin();
  } catch (error) { $('#authMessage').textContent = error.message; }
  finally { $('#authSubmit').disabled = false; }
});
$('#authBtn').addEventListener('click', () => state.user ? (state.user.role === 'admin' ? openAdmin() : openBookings()) : openDialog('#authDialog'));
$('#year').textContent = new Date().getFullYear();

(async function init() {
  try {
    await Promise.all([loadUser(),loadCategories(),loadVendors()]);
    await loadVenues();
  } catch (error) { toast(error.message, true); }
})();

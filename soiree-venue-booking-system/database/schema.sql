-- Soiree Venue Booking System
-- Run against a dedicated development database. This script drops existing app tables.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP VIEW IF EXISTS all_bookings;
DROP TABLE IF EXISTS bookings_archive, bookings, venue_vendors, menu_items, vendors,
                     venues, categories, time_slots, users CASCADE;

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL CHECK (length(trim(name)) >= 2),
  email VARCHAR(160) NOT NULL,
  password_hash TEXT NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TABLE categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  slug VARCHAR(80) NOT NULL UNIQUE,
  tagline VARCHAR(160) NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE venues (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name VARCHAR(140) NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(160) NOT NULL,
  city VARCHAR(80) NOT NULL,
  capacity INT NOT NULL CHECK (capacity > 0),
  price_per_slot NUMERIC(12,2) NOT NULL CHECK (price_per_slot >= 0),
  amenities TEXT[] NOT NULL DEFAULT '{}',
  image_url TEXT,
  rating NUMERIC(2,1) NOT NULL DEFAULT 4.5 CHECK (rating BETWEEN 0 AND 5),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX venues_category_idx ON venues(category_id);
CREATE INDEX venues_city_idx ON venues(lower(city));
CREATE INDEX venues_price_idx ON venues(price_per_slot);
CREATE INDEX venues_capacity_idx ON venues(capacity);
CREATE INDEX venues_active_idx ON venues(is_active);

CREATE TABLE time_slots (
  slot_name VARCHAR(30) PRIMARY KEY,
  label VARCHAR(60) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  price_multiplier NUMERIC(4,2) NOT NULL CHECK (price_multiplier > 0),
  sort_order INT NOT NULL UNIQUE,
  CHECK (end_time > start_time)
);

CREATE TABLE vendors (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('catering','decoration','entertainment')),
  description TEXT NOT NULL,
  city VARCHAR(80) NOT NULL,
  price_from NUMERIC(12,2) NOT NULL CHECK (price_from >= 0),
  price_unit VARCHAR(20) NOT NULL DEFAULT 'per event',
  contact_email VARCHAR(160),
  phone VARCHAR(20),
  rating NUMERIC(2,1) NOT NULL DEFAULT 4.5 CHECK (rating BETWEEN 0 AND 5),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vendors_type_idx ON vendors(type);

CREATE TABLE menu_items (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name VARCHAR(140) NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  diet VARCHAR(10) NOT NULL CHECK (diet IN ('veg','non-veg')),
  course VARCHAR(20) NOT NULL CHECK (course IN ('starter','main','dessert','beverage')),
  is_available BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX menu_items_vendor_diet_idx ON menu_items(vendor_id,diet);

CREATE TABLE venue_vendors (
  venue_id BIGINT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  vendor_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  PRIMARY KEY (venue_id,vendor_id)
);

CREATE TABLE bookings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  venue_id BIGINT NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
  vendor_id BIGINT REFERENCES vendors(id) ON DELETE SET NULL,
  booking_date DATE NOT NULL,
  slot_name VARCHAR(30) NOT NULL REFERENCES time_slots(slot_name),
  event_type VARCHAR(60) NOT NULL,
  guest_count INT NOT NULL CHECK (guest_count > 0),
  total_price NUMERIC(12,2) NOT NULL CHECK (total_price >= 0),
  status VARCHAR(12) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','rejected','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_venue_slot UNIQUE (venue_id,booking_date,slot_name)
);
CREATE INDEX bookings_user_idx ON bookings(user_id,booking_date DESC);
CREATE INDEX bookings_date_idx ON bookings(booking_date);
CREATE INDEX bookings_status_idx ON bookings(status);

-- Archived rows are immutable historical snapshots and do not occupy a slot.
CREATE TABLE bookings_archive (LIKE bookings INCLUDING DEFAULTS);
ALTER TABLE bookings_archive ADD COLUMN archived_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX bookings_archive_user_idx ON bookings_archive(user_id);

CREATE VIEW all_bookings AS
SELECT id,user_id,venue_id,vendor_id,booking_date,slot_name,event_type,guest_count,total_price,status,notes,created_at,updated_at,FALSE AS archived
FROM bookings
UNION ALL
SELECT id,user_id,venue_id,vendor_id,booking_date,slot_name,event_type,guest_count,total_price,status,notes,created_at,updated_at,TRUE AS archived
FROM bookings_archive;
COMMIT;

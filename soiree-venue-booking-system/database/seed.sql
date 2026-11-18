-- Demo accounts:
-- admin@soiree.test / Admin@123
-- aarav@example.com / User@123
BEGIN;
INSERT INTO users(name,email,password_hash,phone,role) VALUES
('Soiree Admin','admin@soiree.test',crypt('Admin@123',gen_salt('bf',10)),'9810000001','admin'),
('Aarav Sharma','aarav@example.com',crypt('User@123',gen_salt('bf',10)),'9810000002','user'),
('Meera Kapoor','meera@example.com',crypt('User@123',gen_salt('bf',10)),'9810000003','user')
ON CONFLICT DO NOTHING;

INSERT INTO categories(name,slug,tagline,description) VALUES
('Weddings','weddings','Lawns, palaces and banquet halls','Spacious venues for ceremonies and receptions.'),
('Corporate Events','corporate','Offsites, launches and annual meets','Business-ready venues with AV and breakout rooms.'),
('Birthday Parties','birthdays','Terraces and gardens made for celebrating','Intimate and playful spaces for celebrations.'),
('Cocktail Dinners','cocktails','Rooftops and lounges after dark','Lounge-style venues with skyline views.'),
('Anniversaries','anniversaries','Courtyards for the people who matter','Elegant spaces for dinners and renewals.'),
('Conferences','conferences','Halls built for delegates','Auditorium seating and event facilities.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO time_slots(slot_name,label,start_time,end_time,price_multiplier,sort_order) VALUES
('Morning','Morning · 8 AM–12 PM','08:00','12:00',0.80,1),
('Afternoon','Afternoon · 12 PM–4 PM','12:00','16:00',1.00,2),
('Evening','Evening · 6 PM–11 PM','18:00','23:00',1.30,3)
ON CONFLICT (slot_name) DO NOTHING;

INSERT INTO venues(category_id,name,description,location,city,capacity,price_per_slot,amenities,image_url,rating)
SELECT c.id,v.name,v.description,v.location,v.city,v.capacity,v.price,v.amenities,v.image,v.rating
FROM (VALUES
('weddings','The Grand Mahal Banquet','A refined pillared banquet hall with a grand stage, bridal suite and valet parking.','Chhatarpur, South Delhi','Delhi',800,185000::numeric,ARRAY['Bridal suite','Valet parking','Stage & mandap','Generator backup','Air conditioning'],'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1200',4.8),
('weddings','Lotus Lawns & Farmhouse','Five acres of manicured lawn with a lakeside pergola for memorable celebrations.','Sohna Road','Gurugram',1200,240000,ARRAY['Open lawn','Guest rooms','Large parking','Garden lighting'],'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=1200',4.7),
('corporate','Zenith Convention Centre','A modern convention space with a divisible main hall and breakout rooms.','Sector 62','Noida',600,120000,ARRAY['4K projectors','High-speed Wi-Fi','Breakout rooms','On-site tech crew'],'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1200',4.6),
('corporate','The Boardroom Loft','A converted warehouse loft with a long oak table and whiteboard walls.','Indiranagar','Bengaluru',80,38000,ARRAY['Video conferencing','Whiteboard walls','Pantry','Wi-Fi'],'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200',4.5),
('birthdays','Confetti Party Terrace','A string-lit terrace with a DJ corner, photo wall and small stage.','Hauz Khas Village','Delhi',120,32000,ARRAY['DJ corner','Photo wall','String lights','Sound system'],'https://images.unsplash.com/photo-1530103862676-de8c9debuat?w=1200',4.4),
('cocktails','Skyline Rooftop Lounge','A rooftop lounge with fire pits and expansive city views.','Lower Parel','Mumbai',150,95000,ARRAY['Rooftop','Fire pits','Skyline view','Live music corner'],'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200',4.8),
('anniversaries','Rosewood Courtyard','A candle-lit courtyard with a central fountain, set for intimate dinners.','C-Scheme','Jaipur',100,55000,ARRAY['Fountain courtyard','Plated dining','Candle decor','Parking'],'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1200',4.7),
('conferences','Harbour Conference Hall','A 400-seat auditorium with tiered seating and a registration foyer.','BKC','Mumbai',400,150000,ARRAY['Auditorium seating','Stage lighting','Registration foyer','Green rooms'],'https://images.unsplash.com/photo-1503428593586-e225b39c9e9a?w=1200',4.7)
) AS v(slug,name,description,location,city,capacity,price,amenities,image,rating)
JOIN categories c ON c.slug=v.slug
WHERE NOT EXISTS (SELECT 1 FROM venues old WHERE old.name=v.name);

INSERT INTO vendors(name,type,description,city,price_from,price_unit,contact_email,phone,rating) VALUES
('Spice Route Caterers','catering','North Indian menus with live tandoor and chaat counters.','Delhi',1200,'per plate','hello@spiceroute.example','9811100001',4.7),
('Royal Rasoi','catering','Rajasthani and Mughlai menus with vegetarian specialties.','Jaipur',1500,'per plate','bookings@royalrasoi.example','9811100002',4.8),
('Petal & Pearl Decor','decoration','Floral installations, mandap builds and entrance arches.','Delhi',85000,'per event','studio@petalpearl.example','9811100005',4.8),
('Lumen Event Design','decoration','Lighting-led event design, LED walls and stage production.','Bengaluru',45000,'per event','design@lumen.example','9811100007',4.6),
('DJ Nitro','entertainment','Open-format DJ with a four-hour set, sound and lights.','Delhi',40000,'per event','book@djnitro.example','9811100008',4.5),
('Raag & Rhythm Live','entertainment','Live band covering Bollywood, ghazals and sufi music.','Mumbai',75000,'per event','live@raagrhythm.example','9811100009',4.8)
ON CONFLICT DO NOTHING;

INSERT INTO venue_vendors(venue_id,vendor_id)
SELECT v.id,d.id FROM venues v CROSS JOIN vendors d
WHERE (v.city=d.city OR d.city='Delhi')
ON CONFLICT DO NOTHING;

COMMIT;

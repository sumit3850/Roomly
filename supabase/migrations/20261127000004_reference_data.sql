-- ════════════════════════════════════════════════════════════════════
-- 0004: Reference data (categories + amenities). Not demo content.
-- ════════════════════════════════════════════════════════════════════
insert into public.property_categories (slug, name, is_commercial, sort_order) values
  ('apartment',        'Apartment / Flat',        false, 1),
  ('independent-house','Independent House',       false, 2),
  ('room',             'Room / PG',               false, 3),
  ('cottage',          'Cottage / Homestay',      false, 4),
  ('shop',             'Shop / Showroom',         true,  10),
  ('office',           'Office Space',            true,  11),
  ('godown',           'Godown / Warehouse',      true,  12),
  ('hotel-resort',     'Hotel / Resort Property', true,  13),
  ('land',             'Land / Plot',             true,  14)
on conflict (slug) do update set name = excluded.name, is_commercial = excluded.is_commercial, sort_order = excluded.sort_order;

insert into public.amenities (slug, name, icon) values
  ('water-24x7',     '24×7 Water',           'droplets'),
  ('power-backup',   'Power Backup',         'zap'),
  ('parking-car',    'Car Parking',          'car'),
  ('parking-bike',   'Two-wheeler Parking',  'bike'),
  ('wifi',           'Wi-Fi Ready',          'wifi'),
  ('ac',             'Air Conditioning',     'snowflake'),
  ('rcc',            'RCC Construction',     'building'),
  ('tiled',          'Fully Tiled',          'grid-3x3'),
  ('modular-kitchen','Modular Kitchen',      'chef-hat'),
  ('balcony',        'Balcony',              'sun'),
  ('sea-view',       'Sea View',             'waves'),
  ('lift',           'Lift',                 'arrow-up-down'),
  ('security',       'Security / CCTV',      'shield'),
  ('pets-allowed',   'Pets Allowed',         'paw-print'),
  ('water-storage',  'Overhead Water Tank',  'container'),
  ('geyser',         'Geyser',               'flame')
on conflict (slug) do update set name = excluded.name, icon = excluded.icon;

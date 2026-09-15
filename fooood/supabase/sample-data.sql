-- fooood — sample data
--
-- Optional. Run this once in your Supabase project's SQL Editor (after
-- schema.sql) if you want a few lists already filled in instead of
-- starting from a blank app. Safe to tweak the names/prices/notes below
-- before running — nothing here depends on the real app code.
--
-- Re-running this file adds a second copy of everything (it doesn't
-- check for existing rows), so if you want a do-over, delete the lists
-- from the app first rather than running this twice.

with new_list as (
  insert into public.lists (name, store, category, emoji)
  values ('FamilyMart Onigiri', 'FamilyMart', 'Onigiri', '🍙')
  returning id
)
insert into public.food_items (list_id, name, price, notes, rank)
select id, name, price, notes, rank from new_list, (values
  ('Egg Mayo',       2.50, 'Creamy, always a safe pick',        1024),
  ('Salt Salmon',    3.20, 'Salty and simple, no notes',        2048),
  ('Spicy Chicken',  2.80, 'Good kick but a bit dry',           3072),
  ('Tuna Mayo',      2.60, 'Solid backup choice',                4096)
) as items(name, price, notes, rank);

with new_list as (
  insert into public.lists (name, store, category, emoji)
  values ('7-Eleven Iced Coffee', '7-Eleven', 'Drinks', '🥤')
  returning id
)
insert into public.food_items (list_id, name, price, notes, rank)
select id, name, price, notes, rank from new_list, (values
  ('Caramel Macchiato', 5.90, 'Sweet enough to be dessert',     1024),
  ('Mocha',              5.50, 'Rich, a little too much foam',  2048),
  ('Black Coffee',       4.50, 'No nonsense, does the job',      3072)
) as items(name, price, notes, rank);

with new_list as (
  insert into public.lists (name, store, category, emoji)
  values ('Lawson Sandwiches', 'Lawson', 'Sandwiches', '🍔')
  returning id
)
insert into public.food_items (list_id, name, price, notes, rank)
select id, name, price, notes, rank from new_list, (values
  ('Katsu Sando',     6.50, 'Crunchy, the best one here',       1024),
  ('Egg Sando',        4.90, 'Fluffy bread, generous filling',   2048),
  ('Ham & Cheese',     4.20, 'Fine but forgettable',             3072)
) as items(name, price, notes, rank);

with new_list as (
  insert into public.lists (name, store, category, emoji)
  values ('FamilyMart Dessert', 'FamilyMart', 'Dessert', '🍰')
  returning id
)
insert into public.food_items (list_id, name, price, notes, rank)
select id, name, price, notes, rank from new_list, (values
  ('Tiramisu Cup',      6.90, 'Actually really good',           1024),
  ('Pudding',            3.50, 'Classic, never disappoints',     2048),
  ('Chocolate Mousse',   5.20, 'A bit too sweet',                 3072)
) as items(name, price, notes, rank);

with new_list as (
  insert into public.lists (name, store, category, emoji)
  values ('KK Mart Snacks', 'KK Mart', 'Snacks', '🍿')
  returning id
)
insert into public.food_items (list_id, name, price, notes, rank)
select id, name, price, notes, rank from new_list, (values
  ('Seaweed Chips',   2.80, 'Addictive, gone in one sitting',   1024),
  ('Salted Popcorn',   3.00, 'Perfect movie night snack',        2048),
  ('Potato Chips',     3.50, 'Standard, nothing special',        3072)
) as items(name, price, notes, rank);

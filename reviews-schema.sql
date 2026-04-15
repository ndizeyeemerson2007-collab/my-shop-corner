-- Run this in your Supabase SQL Editor to create the reviews table!

CREATE TABLE IF NOT EXISTS reviews (
  id serial primary key,
  product_id integer not null references products(id) on delete cascade,
  user_name varchar(100) not null,
  rating integer check(rating >= 1 and rating <= 5),
  comment text,
  created_at timestamp with time zone default now()
);

-- Seed some dummy reviews so the system looks full immediately
-- Assuming product IDs 1 and 2 exist from the previous seed
INSERT INTO reviews (product_id, user_name, rating, comment) VALUES
(1, 'John Doe', 5, 'These sneakers are incredibly comfortable and well-made! Absolutely love the quality.'),
(1, 'Alice Smith', 4, 'Great fit, but shipping took a little longer than expected.'),
(2, 'Mary Johnson', 5, 'The dress is stunning! Fits perfectly and the material feels premium.'),
(3, 'Robert Brown', 5, 'Best smartwatch I have owned. The battery life is impressive.'),
(3, 'David Lee', 4, 'Very good features, but the screen scratches easily.'),
(4, 'Sarah White', 5, 'Amazing noise cancellation! The sound quality is top notch.'),
(5, 'Michael Green', 3, 'Decent sunglasses for the price, but felt a bit fragile.'),
(7, 'Emma Wilson', 5, 'Beautiful backpack, very spacious and professional looking.');

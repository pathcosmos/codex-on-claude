-- For each user, fetch their orders (N+1 pattern)
SELECT * FROM users WHERE active = true;
-- Then for each user.id:
-- SELECT * FROM orders WHERE user_id = $1;
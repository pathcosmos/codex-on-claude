-- Current slow query (500ms on 1M rows)
SELECT 
  o.id, o.user_id, o.total, o.created_at,
  u.name, u.email,
  COUNT(i.id) as item_count,
  SUM(i.price * i.qty) as item_total
FROM orders o
JOIN users u ON u.id = o.user_id
LEFT JOIN order_items i ON i.order_id = o.id
WHERE o.created_at > NOW() - INTERVAL '30 days'
GROUP BY o.id, u.id, u.name, u.email
ORDER BY o.created_at DESC
LIMIT 100;

-- Missing: indexes on foreign keys, created_at
-- Missing: column analysis
-- Problem: COUNT + SUM aggregate on large table without index
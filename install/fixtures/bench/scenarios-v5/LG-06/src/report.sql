SELECT u.id,
       u.email,
       COUNT(o.id) AS order_count,
       SUM(o.total_cents) AS lifetime_value,
       (SELECT COUNT(*) FROM support_tickets t WHERE t.user_id = u.id AND t.status <> 'closed') AS open_tickets
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.deleted_at IS NULL
  AND LOWER(u.email) LIKE LOWER('%@example.com')
  AND u.created_at >= NOW() - INTERVAL '365 days'
GROUP BY u.id, u.email
HAVING SUM(o.total_cents) > 10000
ORDER BY lifetime_value DESC
LIMIT 100;
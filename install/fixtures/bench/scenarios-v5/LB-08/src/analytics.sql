-- Complex multi-table aggregation (2 second execution on 10M row dataset)
SELECT 
  c.country,
  EXTRACT(MONTH FROM o.created_at) as month,
  COUNT(DISTINCT o.user_id) as unique_customers,
  SUM(CASE WHEN o.status = 'completed' THEN o.total ELSE 0 END) as revenue,
  AVG(DATEDIFF(HOUR, o.created_at, o.completed_at)) as avg_fulfillment_hours,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY oi.price) as p95_item_price
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN returns r ON r.order_id = o.id
WHERE o.created_at >= DATE_TRUNC('month', NOW() - INTERVAL '12 months')
  AND c.country IN (SELECT country FROM active_regions)
GROUP BY c.country, EXTRACT(MONTH FROM o.created_at)
HAVING COUNT(DISTINCT o.user_id) > 10
ORDER BY revenue DESC;
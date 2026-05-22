SELECT * FROM events WHERE user_id = 12345 AND created_at > NOW() - INTERVAL '7 days';
-- Assume only user_id has index, not (user_id, created_at)
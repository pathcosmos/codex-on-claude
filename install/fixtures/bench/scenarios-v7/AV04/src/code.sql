CREATE PROCEDURE GetUser(IN username VARCHAR(50)) BEGIN
  SET @query = CONCAT('SELECT * FROM users WHERE name = ''', username, '''');
  PREPARE stmt FROM @query;  -- BUG: dynamic SQL with user input
  EXECUTE stmt;
END;
-- postgres schema, 2 tables
CREATE TABLE table1 (id INT PRIMARY KEY, data TEXT);
CREATE TABLE table2 (id INT PRIMARY KEY, t1_id INT REFERENCES table1(id));

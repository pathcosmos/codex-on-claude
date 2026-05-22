-- mysql schema, 3 tables
CREATE TABLE table1 (id INT PRIMARY KEY, data TEXT);
CREATE TABLE table2 (id INT PRIMARY KEY, t1_id INT REFERENCES table1(id));
CREATE TABLE table3 (id INT PRIMARY KEY, t2_id INT REFERENCES table2(id));
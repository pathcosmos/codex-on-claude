interface Repository<T> {
  findById(id: string): Promise<T>;
  save(item: T): Promise<T>;
}

interface Entity {
  id: string;
  created_at: Date;
}

function createRepository<T extends Entity>(
  db: Database,
  table: string
): Repository<T> {
  return {
    async findById(id: string) {
      const row = await db.query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
      return row as T;  // UNSAFE CAST
    },
    async save(item: T) {
      // Type check: T must have id and created_at, but no guarantee of other fields
      const { id, created_at, ...rest } = item;
      await db.query(
        `UPDATE ${table} SET updated_at = NOW() WHERE id = ?`,
        [id]
      );
      return item;
    }
  };
}

interface User extends Entity {
  name: string;
  email: string;
}

const userRepo = createRepository<User>(db, 'users');
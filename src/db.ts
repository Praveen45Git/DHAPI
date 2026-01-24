// db.ts
import mysql, { Pool } from 'mysql2/promise';

let pool: Pool;

export async function createPool() {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'testdb',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  return pool;
}

export async function query<T>(sql: string, params?: any[]): Promise<T> {
  if (!pool) {
    await createPool();
  }
  
  const [rows] = await pool.execute(sql, params);
  return rows as T;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call createPool() first.');
  }
  return pool;
}

export async function testConnection(): Promise<void> {
  try {
    if (!pool) {
      await createPool();
    }
    const connection = await pool.getConnection();
    console.log('✅ Connected to database');
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}
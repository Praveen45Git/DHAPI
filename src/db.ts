// db.ts - HARDCODED VERSION
import { Pool } from 'pg';

// ============================================
// HARDCODE YOUR NEON DATABASE URL HERE
// ============================================
const NEON_URL = 'postgresql://neondb_owner:npg_FXK9A5gianJw@ep-empty-truth-ah8r54sc-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

// ============================================
// DATABASE CONFIGURATION
// ============================================
let pool: Pool;

export async function createPool() {
  try {
    console.log('🔗 Using hardcoded Neon URL');
    
    pool = new Pool({
      connectionString: NEON_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000
    });
    
    // Test connection
    const client = await pool.connect();
    console.log('✅ Connected to database successfully!');
    
    // Show database info
    const versionResult = await client.query('SELECT version()');
    console.log('📊 Database:', versionResult.rows[0].version.split(' ')[0]);
    
    client.release();
    return pool;
    
  } catch (error: any) {
    console.error('❌ Database connection failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check your NEON_URL in db.ts');
    console.log('2. Make sure your IP is whitelisted in Neon dashboard');
    console.log('3. For Neon, URL should look like:');
    console.log('   postgresql://user:pass@ep-name.region.aws.neon.tech/dbname?sslmode=require');
    throw error;
  }
}

// ============================================
// QUERY FUNCTIONS
// ============================================
export async function query<T>(sql: string, params?: any[]): Promise<T> {
  if (!pool) {
    await createPool();
  }
  
  try {
    const result = await pool.query(sql, params);
    return result.rows as T;
  } catch (error: any) {
    console.error('Query error:', { sql, params, error: error.message });
    throw error;
  }
}

export async function queryUpdate(sql: string, params?: any[]): Promise<{ affectedRows: number }> {
  if (!pool) {
    await createPool();
  }
  
  try {
    const result = await pool.query(sql, params);
    return { affectedRows: result.rowCount || 0 };
  } catch (error: any) {
    console.error('Update error:', { sql, params, error: error.message });
    throw error;
  }
}

export async function queryInsert(sql: string, params?: any[]): Promise<{ insertId: number }> {
  if (!pool) {
    await createPool();
  }
  
  try {
    // Add RETURNING id for PostgreSQL if not present
    if (!sql.toUpperCase().includes('RETURNING')) {
      sql = sql.replace(/;$/, '') + ' RETURNING id;';
    }
    
    const result = await pool.query(sql, params);
    return { insertId: result.rows[0]?.id || 0 };
  } catch (error: any) {
    console.error('Insert error:', { sql, params, error: error.message });
    throw error;
  }
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call createPool() first.');
  }
  return pool;
}

export async function testConnection(): Promise<void> {
  await createPool();
}
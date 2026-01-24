"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPool = createPool;
exports.query = query;
exports.getPool = getPool;
exports.testConnection = testConnection;
// db.ts
const promise_1 = __importDefault(require("mysql2/promise"));
let pool;
async function createPool() {
    pool = promise_1.default.createPool({
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
async function query(sql, params) {
    if (!pool) {
        await createPool();
    }
    const [rows] = await pool.execute(sql, params);
    return rows;
}
function getPool() {
    if (!pool) {
        throw new Error('Database pool not initialized. Call createPool() first.');
    }
    return pool;
}
async function testConnection() {
    try {
        if (!pool) {
            await createPool();
        }
        const connection = await pool.getConnection();
        console.log('✅ Connected to database');
        connection.release();
    }
    catch (error) {
        console.error('❌ Database connection failed:', error);
        throw error;
    }
}

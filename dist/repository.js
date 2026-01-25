"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageService = exports.OrderService = exports.ProductService = exports.OrderDetailRepository = exports.OrderRepository = exports.MOQRepository = exports.ProductRepository = exports.UserRepository = void 0;
// repository.ts - COMPLETE FIXED VERSION
const db_1 = require("./db"); // Import from YOUR db.ts
// ============ BASE REPOSITORY ============
class BaseRepository {
    constructor(tableName) {
        this.tableName = tableName;
    }
    async findAll() {
        // CHANGE: Use double quotes for table names
        return await (0, db_1.query)(`SELECT * FROM "${this.tableName}" ORDER BY id DESC`);
    }
    async findById(id) {
        // CHANGE: Use double quotes and $1 parameter
        const results = await (0, db_1.query)(`SELECT * FROM "${this.tableName}" WHERE id = $1`, [id]);
        return results[0] || null;
    }
    async create(data) {
        // CHANGE: PostgreSQL syntax for INSERT
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const sql = `INSERT INTO "${this.tableName}" (${keys.join(', ')}) VALUES (${placeholders}) RETURNING id`;
        const result = await (0, db_1.query)(sql, values);
        return result[0].id;
    }
    async update(id, data) {
        // CHANGE: PostgreSQL syntax for UPDATE
        const updates = [];
        const values = [];
        let paramCount = 1;
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
                updates.push(`${key} = $${paramCount}`);
                values.push(value);
                paramCount++;
            }
        }
        if (updates.length === 0)
            return false;
        values.push(id);
        const sql = `UPDATE "${this.tableName}" SET ${updates.join(', ')} WHERE id = $${paramCount}`;
        const result = await (0, db_1.queryUpdate)(sql, values);
        return result.affectedRows > 0;
    }
    async delete(id) {
        // CHANGE: Use $1 parameter
        const result = await (0, db_1.queryUpdate)(`DELETE FROM "${this.tableName}" WHERE id = $1`, [id]);
        return result.affectedRows > 0;
    }
}
// ============ USER REPOSITORY ============
class UserRepository extends BaseRepository {
    constructor() {
        super('users');
    }
    async findByEmail(email) {
        // CHANGE: Use $1 parameter
        const users = await (0, db_1.query)('SELECT * FROM users WHERE email = $1', [email]);
        return users[0] || null;
    }
    async create(user) {
        try {
            const sql = `
        INSERT INTO users 
        (name, email, age, password_hash, is_active, created_at) 
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `;
            const values = [
                user.name,
                user.email,
                user.age,
                user.password_hash,
                user.is_active || 1,
                new Date().toISOString()
            ];
            console.log('Executing SQL:', sql);
            console.log('With values:', values);
            const result = await (0, db_1.query)(sql, values);
            return result[0].id;
        }
        catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }
    async toggleActive(id) {
        // CHANGE: PostgreSQL CASE statement
        const result = await (0, db_1.queryUpdate)(`UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = $1`, [id]);
        return result.affectedRows > 0;
    }
    async searchByName(name) {
        // CHANGE: Use ILIKE for case-insensitive and $1 parameter
        return await (0, db_1.query)('SELECT * FROM users WHERE name ILIKE $1 ORDER BY id DESC', [`%${name}%`]);
    }
    async findByStatus(isActive) {
        // CHANGE: Use $1 parameter
        return await (0, db_1.query)('SELECT * FROM users WHERE is_active = $1 ORDER BY id DESC', [isActive]);
    }
    async count() {
        const result = await (0, db_1.query)('SELECT COUNT(*) as count FROM users');
        return result[0]?.count || 0;
    }
    async getPaginated(page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        // CHANGE: Use $1, $2 parameters
        const users = await (0, db_1.query)('SELECT * FROM users ORDER BY id DESC LIMIT $1 OFFSET $2', [limit, offset]);
        const total = await this.count();
        const totalPages = Math.ceil(total / limit);
        return { users, total, totalPages };
    }
    // Keep original updatePassword method
    async updatePassword(id, hashedPassword) {
        const result = await (0, db_1.queryUpdate)('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, id]);
        return result.affectedRows > 0;
    }
    // Keep original delete method from your code
    async delete(id) {
        const result = await (0, db_1.queryUpdate)('DELETE FROM users WHERE id = $1', [id]);
        return result.affectedRows > 0;
    }
}
exports.UserRepository = UserRepository;
// ============ PRODUCT REPOSITORY ============
class ProductRepository {
    async findAll() {
        const products = await (0, db_1.query)('SELECT * FROM products ORDER BY id DESC');
        const productIds = products.map((p) => p.id).filter((id) => id !== undefined);
        if (productIds.length === 0) {
            return products.map((p) => ({ ...p, moqs: [] }));
        }
        // CHANGE: Use parameterized query with ANY()
        const moqs = await (0, db_1.query)(`SELECT * FROM moqs WHERE product_id = ANY($1) ORDER BY moq ASC`, [productIds]);
        const moqsByProductId = {};
        moqs.forEach((moq) => {
            if (moq.product_id !== undefined) {
                if (!moqsByProductId[moq.product_id]) {
                    moqsByProductId[moq.product_id] = [];
                }
                moqsByProductId[moq.product_id].push(moq);
            }
        });
        return products.map((product) => ({
            ...product,
            moqs: moqsByProductId[product.id] || []
        }));
    }
    async findById(id) {
        // Get the product
        const products = await (0, db_1.query)('SELECT * FROM products WHERE id = $1', [id]);
        const product = products[0];
        if (!product)
            return null;
        // Get MOQs for this product
        const moqs = await this.getMOQsForProduct(id);
        return { ...product, moqs };
    }
    async getMOQsForProduct(productId) {
        return await (0, db_1.query)('SELECT * FROM moqs WHERE product_id = $1 ORDER BY moq ASC', [productId]);
    }
    async create(product) {
        const keys = Object.keys(product);
        const values = Object.values(product);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const sql = `INSERT INTO products (${keys.join(', ')}) VALUES (${placeholders}) RETURNING id`;
        const result = await (0, db_1.query)(sql, values);
        return result[0].id;
    }
    async update(id, product) {
        try {
            // Remove fields that shouldn't be updated
            const { id: _, created_at: __, ...updateData } = product;
            // Build SET clause dynamically
            const updates = [];
            const values = [];
            let paramCount = 1;
            for (const [key, value] of Object.entries(updateData)) {
                if (value !== undefined) {
                    updates.push(`${key} = $${paramCount}`);
                    values.push(value);
                    paramCount++;
                }
            }
            if (updates.length === 0) {
                return false; // Nothing to update
            }
            const sql = `UPDATE products SET ${updates.join(', ')} WHERE id = $${paramCount}`;
            values.push(id);
            console.log('Executing SQL:', sql);
            console.log('With values:', values);
            const result = await (0, db_1.queryUpdate)(sql, values);
            return result.affectedRows > 0;
        }
        catch (error) {
            console.error('Error updating product:', error);
            throw error;
        }
    }
    async toggleActive(id) {
        // CHANGE: PostgreSQL CASE statement
        const result = await (0, db_1.queryUpdate)(`UPDATE products SET active = CASE WHEN active = 'A' THEN 'I' ELSE 'A' END WHERE id = $1`, [id]);
        return result.affectedRows > 0;
    }
    async delete(id) {
        const result = await (0, db_1.queryUpdate)('DELETE FROM products WHERE id = $1', [id]);
        return result.affectedRows > 0;
    }
    // Additional method to get active products with MOQs
    async findActiveProducts() {
        // First get all active products
        const products = await (0, db_1.query)('SELECT * FROM products WHERE active = \'A\' ORDER BY id DESC');
        // Get all MOQs for these products
        const productIds = products.map((p) => p.id).filter((id) => id !== undefined);
        if (productIds.length === 0) {
            return products.map((p) => {
                return ({ ...p, moqs: [] });
            });
        }
        // Get MOQs for all active products at once
        const moqs = await (0, db_1.query)(`SELECT * FROM moqs WHERE product_id = ANY($1) ORDER BY moq ASC`, [productIds]);
        // Group MOQs by product_id
        const moqsByProductId = {};
        moqs.forEach((moq) => {
            if (moq.product_id !== undefined) {
                if (!moqsByProductId[moq.product_id]) {
                    moqsByProductId[moq.product_id] = [];
                }
                moqsByProductId[moq.product_id].push(moq);
            }
        });
        // Combine products with their MOQs
        return products.map((product) => ({
            ...product,
            moqs: moqsByProductId[product.id] || []
        }));
    }
}
exports.ProductRepository = ProductRepository;
// ============ MOQ REPOSITORY ============
class MOQRepository {
    async findByProductId(productId) {
        // CHANGE: Use $1 parameter
        return await (0, db_1.query)('SELECT * FROM moqs WHERE product_id = $1 ORDER BY moq ASC', [productId]);
    }
    async setForProduct(productId, moqs) {
        const pool = (0, db_1.getPool)();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Delete existing MOQs
            await client.query('DELETE FROM moqs WHERE product_id = $1', [productId]);
            // Insert new MOQs
            for (const moq of moqs) {
                await client.query('INSERT INTO moqs (product_id, moq, rate) VALUES ($1, $2, $3)', [productId, moq.moq, moq.rate]);
            }
            await client.query('COMMIT');
            return true;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
}
exports.MOQRepository = MOQRepository;
// ============ ORDER REPOSITORY ============
class OrderRepository {
    async findAll() {
        return await (0, db_1.query)('SELECT * FROM orderfile ORDER BY Created_Date DESC');
    }
    async findById(id) {
        const orders = await (0, db_1.query)('SELECT * FROM orderfile WHERE id = $1', [id]);
        return orders[0] || null;
    }
    async create(order) {
        const sql = `
      INSERT INTO orderfile (
        CustomerCode, Itemcode, Qty, Rate, Amount, status, 
        TransactionId, cancel, Address, deliverycharge, Email, Created_Date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `;
        const values = [
            order.CustomerCode,
            order.Itemcode || 0,
            order.Qty || 0,
            order.Rate || 0,
            order.Amount || 0,
            order.status || 'pending',
            order.TransactionId || null,
            order.cancel || 0,
            order.Address || '',
            order.deliverycharge || 0,
            order.Email || '',
            new Date()
        ];
        const result = await (0, db_1.query)(sql, values);
        return result[0].id;
    }
    async updateStatus(id, status) {
        const result = await (0, db_1.queryUpdate)('UPDATE orderfile SET status = $1 WHERE id = $2', [status, id]);
        return result.affectedRows > 0;
    }
    async cancel(id) {
        const result = await (0, db_1.queryUpdate)('UPDATE orderfile SET cancel = 1, status = \'cancelled\' WHERE id = $1', [id]);
        return result.affectedRows > 0;
    }
    async findByCustomer(customerId) {
        return await (0, db_1.query)('SELECT * FROM orderfile WHERE CustomerCode = $1 ORDER BY Created_Date DESC', [customerId]);
    }
}
exports.OrderRepository = OrderRepository;
// ============ ORDER DETAIL REPOSITORY ============
class OrderDetailRepository {
    async findByOrderId(orderId) {
        return await (0, db_1.query)('SELECT * FROM orderdetail WHERE orderId = $1', [orderId]);
    }
    async createForOrder(orderId, details) {
        const pool = (0, db_1.getPool)();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const detail of details) {
                await client.query('INSERT INTO orderdetail (orderId, Itemcode, Qty, Rate, Amount) VALUES ($1, $2, $3, $4, $5)', [orderId, detail.Itemcode, detail.Qty, detail.Rate, detail.Amount]);
            }
            await client.query('COMMIT');
            return true;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getOrderTotal(orderId) {
        const result = await (0, db_1.query)('SELECT SUM(Amount) as total FROM orderdetail WHERE orderId = $1', [orderId]);
        return result[0]?.total || 0;
    }
}
exports.OrderDetailRepository = OrderDetailRepository;
// ============ COMPOSITE SERVICES ============
class ProductService {
    constructor() {
        this.productRepo = new ProductRepository();
        this.moqRepo = new MOQRepository();
    }
    async getProductWithMOQs(id) {
        const productWithMoqs = await this.productRepo.findById(id);
        if (!productWithMoqs)
            return null;
        return productWithMoqs;
    }
    async createProductWithMOQs(productData, moqs) {
        const pool = (0, db_1.getPool)();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Create product
            const productResult = await client.query('INSERT INTO products (name, price, description, image_url, active, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [productData.name, productData.price, productData.description, productData.image_url, productData.active || 'A', new Date()]);
            const productId = productResult.rows[0].id;
            // Create MOQs
            for (const moq of moqs) {
                await client.query('INSERT INTO moqs (product_id, moq, rate, created_at) VALUES ($1, $2, $3, $4)', [productId, moq.moq, moq.rate, new Date()]);
            }
            await client.query('COMMIT');
            return productId;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async updateProductMOQs(productId, moqs) {
        try {
            const moqData = moqs.map(moq => ({
                moq: moq.moq,
                rate: moq.rate
            }));
            return await this.moqRepo.setForProduct(productId, moqData);
        }
        catch (error) {
            throw error;
        }
    }
}
exports.ProductService = ProductService;
class OrderService {
    constructor() {
        this.orderRepo = new OrderRepository();
        this.orderDetailRepo = new OrderDetailRepository();
    }
    async createOrderWithDetails(order, details) {
        const pool = (0, db_1.getPool)();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Create order
            const orderId = await this.orderRepo.create(order);
            // Create order details
            await this.orderDetailRepo.createForOrder(orderId, details);
            await client.query('COMMIT');
            return orderId;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getOrderFullDetails(orderId) {
        const order = await this.orderRepo.findById(orderId);
        if (!order)
            return null;
        const details = await this.orderDetailRepo.findByOrderId(orderId);
        const total = await this.orderDetailRepo.getOrderTotal(orderId);
        return { order, details, total };
    }
}
exports.OrderService = OrderService;
// ============ IMAGE SERVICE ============
class ImageService {
    constructor() {
        this.baseUrl = process.env.BASE_URL || 'https://dhapi.onrender.com';
    }
    getFullUrl(filename) {
        return `${this.baseUrl}/uploads/products/${filename}`;
    }
    getFilenameFromUrl(url) {
        return url.split('/').pop() || '';
    }
}
exports.ImageService = ImageService;

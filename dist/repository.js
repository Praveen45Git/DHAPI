"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageService = exports.OrderService = exports.ProductService = exports.OrderDetailRepository = exports.OrderRepository = exports.MOQRepository = exports.ProductRepository = exports.UserRepository = void 0;
// repository.ts
const db_1 = require("./db");
// ============ BASE REPOSITORY ============
class BaseRepository {
    constructor(tableName) {
        this.tableName = tableName;
    }
    async findAll() {
        return await (0, db_1.query)(`SELECT * FROM ${this.tableName} ORDER BY id DESC`);
    }
    async findById(id) {
        const results = await (0, db_1.query)(`SELECT * FROM ${this.tableName} WHERE id = ?`, [id]);
        return results[0] || null;
    }
    async create(data) {
        const result = await (0, db_1.query)(`INSERT INTO ${this.tableName} SET ?`, [data]);
        return result.insertId;
    }
    async update(id, data) {
        const result = await (0, db_1.query)(`UPDATE ${this.tableName} SET ? WHERE id = ?`, [data, id]);
        return result.affectedRows > 0;
    }
    async delete(id) {
        const result = await (0, db_1.query)(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
        return result.affectedRows > 0;
    }
}
// ============ USER REPOSITORY ============
class UserRepository extends BaseRepository {
    constructor() {
        super('users');
    }
    async findByEmail(email) {
        const users = await (0, db_1.query)('SELECT * FROM users WHERE email = ?', [email]);
        return users[0] || null;
    }
}
exports.UserRepository = UserRepository;
// ============ PRODUCT REPOSITORY ============
class ProductRepository {
    async findAll() {
        return await (0, db_1.query)('SELECT * FROM products  ORDER BY id DESC');
    }
    async findById(id) {
        const products = await (0, db_1.query)('SELECT * FROM products WHERE id = ?', [id]);
        return products[0] || null;
    }
    async create(product) {
        const result = await (0, db_1.query)('INSERT INTO products SET ?', [product]);
        return result.insertId;
    }
    async update(id, product) {
        try {
            // Remove fields that shouldn't be updated
            const { id: _, created_at: __, ...updateData } = product;
            // Build SET clause dynamically
            const setClauses = [];
            const values = [];
            for (const [key, value] of Object.entries(updateData)) {
                if (value !== undefined) {
                    setClauses.push(`${key} = ?`);
                    values.push(value);
                }
            }
            if (setClauses.length === 0) {
                return false; // Nothing to update
            }
            const sql = `UPDATE products SET ${setClauses.join(', ')} WHERE id = ?`;
            values.push(id);
            console.log('Executing SQL:', sql);
            console.log('With values:', values);
            const result = await (0, db_1.query)(sql, values);
            return result.affectedRows > 0;
        }
        catch (error) {
            console.error('Error updating product:', error);
            throw error;
        }
    }
    async toggleActive(id) {
        const result = await (0, db_1.query)('UPDATE products SET active = IF(active = "A", "I", "A") WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
    async delete(id) {
        const result = await (0, db_1.query)('DELETE FROM products WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}
exports.ProductRepository = ProductRepository;
// ============ MOQ REPOSITORY ============
class MOQRepository {
    async findByProductId(productId) {
        return await (0, db_1.query)('SELECT * FROM moqs WHERE product_id = ? ORDER BY moq ASC', [productId]);
    }
    async setForProduct(productId, moqs) {
        const connection = await (0, db_1.getPool)().getConnection();
        try {
            await connection.beginTransaction();
            // Delete existing MOQs
            await connection.execute('DELETE FROM moqs WHERE product_id = ?', [productId]);
            // Insert new MOQs
            for (const moq of moqs) {
                await connection.execute('INSERT INTO moqs (product_id, moq, rate) VALUES (?, ?, ?)', [productId, moq.moq, moq.rate]);
            }
            await connection.commit();
            return true;
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
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
        const orders = await (0, db_1.query)('SELECT * FROM orderfile WHERE id = ?', [id]);
        return orders[0] || null;
    }
    async create(order) {
        const sql = `
      INSERT INTO orderfile (
        CustomerCode, Itemcode, Qty, Rate, Amount, status, 
        TransactionId, cancel, Address, deliverycharge, Email, Created_Date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        return result.insertId;
    }
    async updateStatus(id, status) {
        const result = await (0, db_1.query)('UPDATE orderfile SET status = ? WHERE id = ?', [status, id]);
        return result.affectedRows > 0;
    }
    async cancel(id) {
        const result = await (0, db_1.query)('UPDATE orderfile SET cancel = 1, status = "cancelled" WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
    async findByCustomer(customerId) {
        return await (0, db_1.query)('SELECT * FROM orderfile WHERE CustomerCode = ? ORDER BY Created_Date DESC', [customerId]);
    }
}
exports.OrderRepository = OrderRepository;
// ============ ORDER DETAIL REPOSITORY ============
class OrderDetailRepository {
    async findByOrderId(orderId) {
        return await (0, db_1.query)('SELECT * FROM orderdetail WHERE orderId = ?', [orderId]);
    }
    async createForOrder(orderId, details) {
        const connection = await (0, db_1.getPool)().getConnection();
        try {
            await connection.beginTransaction();
            for (const detail of details) {
                await connection.execute('INSERT INTO orderdetail (orderId, Itemcode, Qty, Rate, Amount) VALUES (?, ?, ?, ?, ?)', [orderId, detail.Itemcode, detail.Qty, detail.Rate, detail.Amount]);
            }
            await connection.commit();
            return true;
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async getOrderTotal(orderId) {
        const [result] = await (0, db_1.query)('SELECT SUM(Amount) as total FROM orderdetail WHERE orderId = ?', [orderId]);
        return result?.total || 0;
    }
}
exports.OrderDetailRepository = OrderDetailRepository;
// ============ COMPOSITE SERVICES ============
class ProductService {
    constructor(productRepo = new ProductRepository(), moqRepo = new MOQRepository()) {
        this.productRepo = productRepo;
        this.moqRepo = moqRepo;
    }
    async getProductWithMOQs(id) {
        const product = await this.productRepo.findById(id);
        if (!product)
            return null;
        const moqs = await this.moqRepo.findByProductId(id);
        return { ...product, moqs };
    }
    async createProductWithMOQs(productData, moqs) {
        const connection = await (0, db_1.getPool)().getConnection();
        try {
            await connection.beginTransaction();
            // Create product
            const [productResult] = await connection.execute('INSERT INTO products (name, price, description, image_url, active, created_at) VALUES (?, ?, ?, ?, ?, ?)', [productData.name, productData.price, productData.description, productData.image_url, productData.active || 'A', new Date()]);
            const productId = productResult.insertId;
            // Create MOQs
            for (const moq of moqs) {
                await connection.execute('INSERT INTO moqs (product_id, moq, rate, created_at) VALUES (?, ?, ?, ?)', [productId, moq.moq, moq.rate, new Date()]);
            }
            await connection.commit();
            return productId;
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
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
    constructor(orderRepo = new OrderRepository(), orderDetailRepo = new OrderDetailRepository()) {
        this.orderRepo = orderRepo;
        this.orderDetailRepo = orderDetailRepo;
    }
    async createOrderWithDetails(order, details) {
        const connection = await (0, db_1.getPool)().getConnection();
        try {
            await connection.beginTransaction();
            // Create order
            const orderId = await this.orderRepo.create(order);
            // Create order details
            await this.orderDetailRepo.createForOrder(orderId, details);
            await connection.commit();
            return orderId;
        }
        catch (error) {
            await connection.rollback();
            throw error;
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
        this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    }
    getFullUrl(filename) {
        return `${this.baseUrl}/uploads/products/${filename}`;
    }
    getFilenameFromUrl(url) {
        return url.split('/').pop() || '';
    }
}
exports.ImageService = ImageService;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImagePath = exports.deleteImageFile = exports.uploadImageHandler = exports.getImageUrl = exports.upload = exports.OrderRepository = exports.OrderDetailRepository = exports.ProductRepository = exports.MOQRepository = exports.UserRepository = void 0;
// repository.ts - Complete updated version with MOQ, Order support and fixed image upload
const db_1 = require("./db");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
class UserRepository {
    async findAll() {
        return await (0, db_1.query)('SELECT * FROM users ORDER BY id DESC');
    }
    async findById(id) {
        const users = await (0, db_1.query)('SELECT * FROM users WHERE id = ?', [id]);
        return users[0] || null;
    }
    async create(user) {
        const result = await (0, db_1.query)('INSERT INTO users (name, email, age) VALUES (?, ?, ?)', [user.name, user.email, user.age]);
        return result.insertId;
    }
    async update(id, user) {
        const result = await (0, db_1.query)('UPDATE users SET ? WHERE id = ?', [user, id]);
        return result.affectedRows > 0;
    }
    async delete(id) {
        const result = await (0, db_1.query)('DELETE FROM users WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}
exports.UserRepository = UserRepository;
UserRepository.endpoints = [
    { method: 'get', path: '/users', handlerName: 'findAll' },
    { method: 'get', path: '/users/:id', handlerName: 'findById' },
    { method: 'post', path: '/users', handlerName: 'create' },
    { method: 'put', path: '/users/:id', handlerName: 'update' },
    { method: 'delete', path: '/users/:id', handlerName: 'delete' }
];
class MOQRepository {
    async findByProductId(productId) {
        return await (0, db_1.query)('SELECT * FROM moqs WHERE product_id = ? ORDER BY moq ASC', [productId]);
    }
    async findById(id) {
        const moqs = await (0, db_1.query)('SELECT * FROM moqs WHERE id = ?', [id]);
        return moqs[0] || null;
    }
    async create(moq) {
        const result = await (0, db_1.query)('INSERT INTO moqs (product_id, moq, rate) VALUES (?, ?, ?)', [moq.product_id, moq.moq, moq.rate]);
        return result.insertId;
    }
    async createMultiple(productId, moqs) {
        const insertIds = [];
        // Use transaction for multiple inserts
        const connection = await (0, db_1.getPool)().getConnection();
        try {
            await connection.beginTransaction();
            for (const moq of moqs) {
                const [result] = await connection.execute('INSERT INTO moqs (product_id, moq, rate) VALUES (?, ?, ?)', [productId, moq.moq, moq.rate]);
                insertIds.push(result.insertId);
            }
            await connection.commit();
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
        return insertIds;
    }
    async bulkUpdate(productId, moqs) {
        const connection = await (0, db_1.getPool)().getConnection();
        try {
            await connection.beginTransaction();
            const result = {
                created: [],
                updated: 0,
                deleted: 0
            };
            // Delete all existing MOQs for this product
            const [deleteResult] = await connection.execute('DELETE FROM moqs WHERE product_id = ?', [productId]);
            result.deleted = deleteResult.affectedRows;
            // Create all new MOQs
            for (const moq of moqs) {
                const [createResult] = await connection.execute('INSERT INTO moqs (product_id, moq, rate) VALUES (?, ?, ?)', [productId, moq.moq, moq.rate]);
                result.created.push(createResult.insertId);
            }
            await connection.commit();
            return result;
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async replaceMOQs(productId, moqs) {
        const connection = await (0, db_1.getPool)().getConnection();
        try {
            await connection.beginTransaction();
            // Delete all existing MOQs for this product
            await connection.execute('DELETE FROM moqs WHERE product_id = ?', [productId]);
            // Insert new MOQs
            const insertIds = [];
            for (const moq of moqs) {
                const [result] = await connection.execute('INSERT INTO moqs (product_id, moq, rate) VALUES (?, ?, ?)', [productId, moq.moq, moq.rate]);
                insertIds.push(result.insertId);
            }
            await connection.commit();
            return insertIds;
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async update(id, moq) {
        const result = await (0, db_1.query)('UPDATE moqs SET ? WHERE id = ?', [moq, id]);
        return result.affectedRows > 0;
    }
    async delete(id) {
        const result = await (0, db_1.query)('DELETE FROM moqs WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
    async deleteByProductId(productId) {
        const result = await (0, db_1.query)('DELETE FROM moqs WHERE product_id = ?', [productId]);
        return result.affectedRows > 0;
    }
}
exports.MOQRepository = MOQRepository;
MOQRepository.endpoints = [
    { method: 'get', path: '/products/:productId/moqs', handlerName: 'findByProductId' },
    { method: 'get', path: '/moqs/:id', handlerName: 'findById' },
    { method: 'post', path: '/products/:productId/moqs', handlerName: 'create' },
    { method: 'post', path: '/products/:productId/moqs/multiple', handlerName: 'createMultiple' },
    { method: 'put', path: '/moqs/:id', handlerName: 'update' },
    { method: 'put', path: '/products/:productId/moqs/bulk', handlerName: 'bulkUpdate' },
    { method: 'put', path: '/products/:productId/moqs/replace', handlerName: 'replaceMOQs' },
    { method: 'delete', path: '/moqs/:id', handlerName: 'delete' },
    { method: 'delete', path: '/products/:productId/moqs', handlerName: 'deleteByProductId' }
];
class ProductRepository {
    constructor() {
        // Base URL for serving images
        this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    }
    // Helper method to build full image URL from filename
    buildImageUrl(filename) {
        if (!filename)
            return null;
        // If it's already a full URL, return it as is
        if (filename.startsWith('http://') || filename.startsWith('https://')) {
            return filename;
        }
        // For filenames without path, add the full path
        return `${this.baseUrl}/uploads/products/${filename}`;
    }
    // Helper to extract filename from URL
    extractFilename(imageUrl) {
        if (!imageUrl)
            return null;
        // If it's already just a filename, return it
        if (!imageUrl.includes('/')) {
            return imageUrl;
        }
        // Extract just the filename from the URL
        let filename = imageUrl;
        // Remove base URL part if present
        if (filename.startsWith(`${this.baseUrl}/uploads/products/`)) {
            filename = filename.replace(`${this.baseUrl}/uploads/products/`, '');
        }
        // Remove /uploads/products/ prefix
        else if (filename.startsWith('/uploads/products/')) {
            filename = filename.replace('/uploads/products/', '');
        }
        // Remove any leading path
        else {
            filename = path_1.default.basename(filename);
        }
        return filename;
    }
    async findAll() {
        const products = await (0, db_1.query)('SELECT * FROM products WHERE active = "A" ORDER BY id DESC');
        // Transform products to include full image URLs
        return products.map(product => ({
            ...product,
            image_url: this.buildImageUrl(product.image_url)
        }));
    }
    async findById(id) {
        const products = await (0, db_1.query)('SELECT * FROM products WHERE id = ?', [id]);
        if (products.length === 0) {
            return null;
        }
        // Transform product to include full image URL
        const product = products[0];
        return {
            ...product,
            image_url: this.buildImageUrl(product.image_url)
        };
    }
    async findByIdWithMOQs(id) {
        const products = await (0, db_1.query)('SELECT * FROM products WHERE id = ?', [id]);
        if (products.length === 0) {
            return null;
        }
        // Get MOQs for the product
        const moqRepository = new MOQRepository();
        const moqs = await moqRepository.findByProductId(id);
        // Transform product to include full image URL and MOQs
        const product = products[0];
        return {
            ...product,
            image_url: this.buildImageUrl(product.image_url),
            moqs
        };
    }
    async findAllWithMOQs() {
        const products = await (0, db_1.query)('SELECT * FROM products WHERE active = "A" ORDER BY id DESC');
        // Transform products to include full image URLs and MOQs
        const productsWithMOQs = await Promise.all(products.map(async (product) => {
            // Get MOQs for each product
            const moqRepository = new MOQRepository();
            const moqs = await moqRepository.findByProductId(product.id);
            return {
                ...product,
                image_url: this.buildImageUrl(product.image_url),
                moqs
            };
        }));
        return productsWithMOQs;
    }
    async activeProducts() {
        const products = await (0, db_1.query)('SELECT * FROM products WHERE active = ? ORDER BY id DESC', ["A"]);
        // Transform products to include full image URLs
        return products.map(product => ({
            ...product,
            image_url: this.buildImageUrl(product.image_url)
        }));
    }
    async create(product) {
        // Extract just the filename before storing
        let imageUrl = product.image_url;
        if (imageUrl) {
            const filename = this.extractFilename(imageUrl);
            imageUrl = filename; // Store only filename in database
        }
        const result = await (0, db_1.query)('INSERT INTO products (name, price, description, image_url, active) VALUES (?, ?, ?, ?, ?)', [
            product.name,
            product.price,
            product.description,
            imageUrl || null,
            product.active || 'A'
        ]);
        return result.insertId;
    }
    async createWithMOQs(productData) {
        const connection = await (0, db_1.getPool)().getConnection();
        try {
            await connection.beginTransaction();
            // Extract just the filename before storing
            let imageUrl = productData.image_url;
            if (imageUrl) {
                const filename = this.extractFilename(imageUrl);
                imageUrl = filename; // Store only filename in database
            }
            // Create the product
            const [productResult] = await connection.execute('INSERT INTO products (name, price, description, image_url, active) VALUES (?, ?, ?, ?, ?)', [
                productData.name,
                productData.price,
                productData.description,
                imageUrl || null,
                productData.active || 'A'
            ]);
            const productId = productResult.insertId;
            const moqIds = [];
            // Create MOQs if provided
            if (productData.moqs && productData.moqs.length > 0) {
                for (const moq of productData.moqs) {
                    const [moqResult] = await connection.execute('INSERT INTO moqs (product_id, moq, rate) VALUES (?, ?, ?)', [productId, moq.moq, moq.rate]);
                    moqIds.push(moqResult.insertId);
                }
            }
            await connection.commit();
            return {
                productId,
                moqIds
            };
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async update(id, product) {
        // Build the SET clause dynamically
        const updates = [];
        const values = [];
        if (product.name !== undefined) {
            updates.push('name = ?');
            values.push(product.name);
        }
        if (product.price !== undefined) {
            updates.push('price = ?');
            values.push(product.price);
        }
        if (product.description !== undefined) {
            updates.push('description = ?');
            values.push(product.description);
        }
        if (product.image_url !== undefined) {
            // Extract just the filename before storing
            let imageUrl = product.image_url;
            if (imageUrl) {
                const filename = this.extractFilename(imageUrl);
                imageUrl = filename; // Store only filename in database
            }
            updates.push('image_url = ?');
            values.push(imageUrl);
        }
        if (product.active !== undefined) {
            updates.push('active = ?');
            values.push(product.active);
        }
        if (updates.length === 0) {
            return false; // Nothing to update
        }
        values.push(id);
        const sql = `UPDATE products SET ${updates.join(', ')} WHERE id = ?`;
        const result = await (0, db_1.query)(sql, values);
        return result.affectedRows > 0;
    }
    async updateWithMOQs(id, productData) {
        const connection = await (0, db_1.getPool)().getConnection();
        try {
            await connection.beginTransaction();
            // Update the product first
            let productUpdated = false;
            if (productData.name !== undefined ||
                productData.price !== undefined ||
                productData.description !== undefined ||
                productData.image_url !== undefined ||
                productData.active !== undefined) {
                const productUpdate = {};
                if (productData.name !== undefined)
                    productUpdate.name = productData.name;
                if (productData.price !== undefined)
                    productUpdate.price = productData.price;
                if (productData.description !== undefined)
                    productUpdate.description = productData.description;
                // Handle image URL extraction
                if (productData.image_url !== undefined) {
                    let imageUrl = productData.image_url;
                    if (imageUrl) {
                        const filename = this.extractFilename(imageUrl);
                        productUpdate.image_url = filename; // Store only filename in database
                    }
                    else {
                        productUpdate.image_url = null;
                    }
                }
                if (productData.active !== undefined)
                    productUpdate.active = productData.active;
                const [productResult] = await connection.execute('UPDATE products SET name = ?, price = ?, description = ?, image_url = ?, active = ? WHERE id = ?', [
                    productUpdate.name || '',
                    productUpdate.price || 0,
                    productUpdate.description || '',
                    productUpdate.image_url || null,
                    productUpdate.active || 'A',
                    id
                ]);
                productUpdated = productResult.affectedRows > 0;
            }
            // Handle MOQ updates if provided
            const moqChanges = {
                created: [],
                updated: 0,
                deleted: 0
            };
            if (productData.moqs !== undefined && Array.isArray(productData.moqs)) {
                // First, delete all existing MOQs for this product
                const [deleteResult] = await connection.execute('DELETE FROM moqs WHERE product_id = ?', [id]);
                moqChanges.deleted = deleteResult.affectedRows;
                // Then create all new MOQs
                for (const moq of productData.moqs) {
                    // Validate MOQ data
                    if (moq.moq === undefined || moq.rate === undefined) {
                        throw new Error('Invalid MOQ data: moq and rate are required');
                    }
                    const [createResult] = await connection.execute('INSERT INTO moqs (product_id, moq, rate) VALUES (?, ?, ?)', [id, moq.moq, moq.rate]);
                    moqChanges.created.push(createResult.insertId);
                }
            }
            await connection.commit();
            return {
                updated: productUpdated || moqChanges.created.length > 0 || moqChanges.deleted > 0,
                productId: id,
                moqChanges
            };
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async uploadImage(id, imageUrl) {
        // Extract just the filename before storing
        const filename = this.extractFilename(imageUrl);
        const result = await (0, db_1.query)('UPDATE products SET image_url = ? WHERE id = ?', [filename, id]);
        return result.affectedRows > 0;
    }
    async removeImage(id) {
        // Get current product to delete the file
        const product = await this.findById(id);
        if (product?.image_url) {
            try {
                // Extract filename from URL
                const filename = this.extractFilename(product.image_url);
                if (filename) {
                    const imagePath = path_1.default.join(__dirname, '../uploads/products', filename);
                    if (fs_1.default.existsSync(imagePath)) {
                        fs_1.default.unlinkSync(imagePath);
                    }
                }
            }
            catch (error) {
                console.error('Error deleting image file:', error);
            }
        }
        const result = await (0, db_1.query)('UPDATE products SET image_url = NULL WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
    async activate(id, product) {
        const result = await (0, db_1.query)('UPDATE products SET active = ? WHERE id = ?', [product.active, id]);
        return result.affectedRows > 0;
    }
    async delete(id) {
        const connection = await (0, db_1.getPool)().getConnection();
        try {
            await connection.beginTransaction();
            // Delete MOQs first (foreign key constraint)
            await connection.execute('DELETE FROM moqs WHERE product_id = ?', [id]);
            // Get product to delete its image
            const product = await this.findById(id);
            if (product?.image_url) {
                try {
                    // Extract filename from URL
                    const filename = this.extractFilename(product.image_url);
                    if (filename) {
                        const imagePath = path_1.default.join(__dirname, '../uploads/products', filename);
                        if (fs_1.default.existsSync(imagePath)) {
                            fs_1.default.unlinkSync(imagePath);
                        }
                    }
                }
                catch (error) {
                    console.error('Error deleting image file:', error);
                }
            }
            // Delete the product
            const [result] = await connection.execute('DELETE FROM products WHERE id = ?', [id]);
            await connection.commit();
            return result.affectedRows > 0;
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
exports.ProductRepository = ProductRepository;
ProductRepository.endpoints = [
    { method: 'get', path: '/products', handlerName: 'findAll' },
    { method: 'get', path: '/products-with-moqs', handlerName: 'findAllWithMOQs' },
    { method: 'get', path: '/activeproducts', handlerName: 'activeProducts' },
    { method: 'get', path: '/products/:id', handlerName: 'findById' },
    { method: 'get', path: '/products/:id/with-moqs', handlerName: 'findByIdWithMOQs' },
    { method: 'post', path: '/products', handlerName: 'create' },
    { method: 'post', path: '/products/with-moqs', handlerName: 'createWithMOQs' },
    { method: 'put', path: '/products/:id', handlerName: 'update' },
    { method: 'put', path: '/products/:id/with-moqs', handlerName: 'updateWithMOQs' },
    { method: 'put', path: '/products/:id/activate', handlerName: 'activate' },
    { method: 'delete', path: '/products/:id', handlerName: 'delete' },
    { method: 'delete', path: '/products/:id/image', handlerName: 'removeImage' },
];
// OrderDetail Repository
class OrderDetailRepository {
    getItemSalesSummary(salesItemId) {
        throw new Error('Method not implemented.');
    }
    async findByOrderId(orderId) {
        return await (0, db_1.query)('SELECT * FROM orderdetail WHERE orderId = ? ORDER BY id DESC', [orderId]);
    }
    async findById(id) {
        const details = await (0, db_1.query)('SELECT * FROM orderdetail WHERE id = ?', [id]);
        return details[0] || null;
    }
    async findByItemId(itemId) {
        return await (0, db_1.query)('SELECT * FROM orderdetail WHERE ItemId = ? ORDER BY created_at DESC', [itemId]);
    }
    async create(detail) {
        const result = await (0, db_1.query)('INSERT INTO orderdetail (orderId, ItemId, Qty, Rate, Amount, DeliveryCharge) VALUES (?, ?, ?, ?, ?, ?)', [
            detail.orderId,
            detail.Itemcode,
            detail.Qty,
            detail.Rate,
            detail.Amount,
            detail.DeliveryCharge || 0
        ]);
        return result.insertId;
    }
    async createMultiple(details) {
        const connection = await (0, db_1.getPool)().getConnection();
        const insertIds = [];
        try {
            await connection.beginTransaction();
            for (const detail of details) {
                const [result] = await connection.execute('INSERT INTO orderdetail (orderId, Itemcode, Qty, Rate, Amount, DeliveryCharge) VALUES (?, ?, ?, ?, ?, ?)', [
                    detail.orderId,
                    detail.Itemcode,
                    detail.Qty,
                    detail.Rate,
                    detail.Amount,
                    detail.DeliveryCharge || 0
                ]);
                insertIds.push(result.insertId);
            }
            await connection.commit();
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
        return insertIds;
    }
    async update(id, detail) {
        const result = await (0, db_1.query)('UPDATE orderdetail SET ? WHERE id = ?', [detail, id]);
        return result.affectedRows > 0;
    }
    async delete(id) {
        const result = await (0, db_1.query)('DELETE FROM orderdetail WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
    async deleteByOrderId(orderId) {
        const result = await (0, db_1.query)('DELETE FROM orderdetail WHERE orderId = ?', [orderId]);
        return result.affectedRows > 0;
    }
    async getOrderSummary(orderId) {
        const [summary] = await (0, db_1.query)(`
      SELECT 
        COUNT(*) as totalItems,
        SUM(Qty) as totalQty,
        SUM(Amount) as totalAmount,
        SUM(DeliveryCharge) as totalDeliveryCharge
      FROM orderdetail 
      WHERE orderId = ?
    `, [orderId]);
        return {
            totalItems: summary?.totalItems || 0,
            totalQty: summary?.totalQty || 0,
            totalAmount: summary?.totalAmount || 0,
            totalDeliveryCharge: summary?.totalDeliveryCharge || 0
        };
    }
    async getItemSales(itemId) {
        const [sales] = await (0, db_1.query)(`
      SELECT 
        COUNT(*) as totalOrders,
        SUM(Qty) as totalQty,
        SUM(Amount) as totalAmount
      FROM orderdetail 
      WHERE ItemId = ?
    `, [itemId]);
        return {
            totalOrders: sales?.totalOrders || 0,
            totalQty: sales?.totalQty || 0,
            totalAmount: sales?.totalAmount || 0
        };
    }
    async getOrderWithDetails(orderId) {
        const orderRepository = new OrderRepository();
        const order = await orderRepository.findById(orderId);
        if (!order) {
            return null;
        }
        const details = await this.findByOrderId(orderId);
        return {
            order,
            details
        };
    }
}
exports.OrderDetailRepository = OrderDetailRepository;
OrderDetailRepository.endpoints = [
    { method: 'get', path: '/order-details/order/:orderId', handlerName: 'findByOrderId' },
    { method: 'get', path: '/order-details/:id', handlerName: 'findById' },
    { method: 'get', path: '/order-details/item/:itemId', handlerName: 'findByItemId' },
    { method: 'get', path: '/order-details/order/:orderId/summary', handlerName: 'getOrderSummary' },
    { method: 'get', path: '/order-details/item/:itemId/sales', handlerName: 'getItemSales' },
    { method: 'get', path: '/orders/:orderId/with-details', handlerName: 'getOrderWithDetails' },
    { method: 'post', path: '/order-details', handlerName: 'create' },
    { method: 'post', path: '/order-details/bulk', handlerName: 'createMultiple' },
    { method: 'put', path: '/order-details/:id', handlerName: 'update' },
    { method: 'delete', path: '/order-details/:id', handlerName: 'delete' },
    { method: 'delete', path: '/order-details/order/:orderId', handlerName: 'deleteByOrderId' }
];
// Updated OrderRepository with order detail insertion
class OrderRepository {
    async findAll() {
        return await (0, db_1.query)('SELECT * FROM orderfile ORDER BY id DESC');
    }
    async findById(id) {
        const orders = await (0, db_1.query)('SELECT * FROM orderfile WHERE id = ?', [id]);
        return orders[0] || null;
    }
    async findByCustomerId(customerId) {
        return await (0, db_1.query)('SELECT * FROM orderfile WHERE CustomerCode = ? ORDER BY created_at DESC', [customerId]);
    }
    async findByStatus(status) {
        return await (0, db_1.query)('SELECT * FROM orderfile WHERE status = ? ORDER BY created_at DESC', [status]);
    }
    async findByTransactionId(transactionId) {
        const orders = await (0, db_1.query)('SELECT * FROM orderfile WHERE TransactionId = ?', [transactionId]);
        return orders[0] || null;
    }
    async create(order) {
        return await this.createWithDetails(order);
    }
    async createWithDetails(order, details) {
        const connection = await (0, db_1.getPool)().getConnection();
        try {
            await connection.beginTransaction();
            console.log('Creating order with data:', order);
            // Validate required fields
            if (!order.Itemcode || !order.Qty || !order.Rate) {
                throw new Error('Missing required order fields');
            }
            // Insert the main order
            const [orderResult] = await connection.execute(`INSERT INTO orderfile (
          CustomerCode, Itemcode, Qty, Rate, Amount, 
          status, TransactionId, cancel, Address, deliverycharge, Email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                order.CustomerCode || 'Guest',
                order.Itemcode || 0,
                order.Qty || 0,
                order.Rate || 0,
                order.Amount || 0,
                order.status || 'pending',
                order.TransactionId || '',
                order.cancel || 0,
                order.Address || '',
                order.deliverycharge || 0,
                order.Email || ''
            ]);
            const orderId = orderResult.insertId;
            console.log('Order inserted with ID:', orderId);
            // Insert order details if provided
            if (details && details.length > 0) {
                const orderDetailRepo = new OrderDetailRepository();
                const detailInserts = details.map(detail => ({
                    ...detail,
                    orderId: orderId
                }));
                await orderDetailRepo.createMultiple(detailInserts);
                console.log(`Inserted ${details.length} order details for order ${orderId}`);
            }
            await connection.commit();
            return orderId;
        }
        catch (error) {
            await connection.rollback();
            console.error('Error creating order with details:', error);
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async update(id, order) {
        const result = await (0, db_1.query)('UPDATE orderfile SET ? WHERE id = ?', [order, id]);
        return result.affectedRows > 0;
    }
    async updateStatus(id, status) {
        const result = await (0, db_1.query)('UPDATE orderfile SET status = ? WHERE id = ?', [status, id]);
        return result.affectedRows > 0;
    }
    async updateTransactionId(id, transactionId) {
        const result = await (0, db_1.query)('UPDATE orderfile SET TransactionId = ? WHERE id = ?', [transactionId, id]);
        return result.affectedRows > 0;
    }
    async cancel(id, cancel = 1) {
        const result = await (0, db_1.query)('UPDATE orderfile SET cancel = ?, status = "cancelled" WHERE id = ?', [cancel, id]);
        return result.affectedRows > 0;
    }
    async delete(id) {
        const connection = await (0, db_1.getPool)().getConnection();
        try {
            await connection.beginTransaction();
            // Delete order details first (foreign key constraint)
            await connection.execute('DELETE FROM orderdetail WHERE orderId = ?', [id]);
            // Delete the main order
            const [result] = await connection.execute('DELETE FROM orderfile WHERE id = ?', [id]);
            await connection.commit();
            return result.affectedRows > 0;
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async getOrderSummary(customerId) {
        const [summary] = await (0, db_1.query)(`
      SELECT 
        COUNT(*) as totalOrders,
        SUM(Amount) as totalAmount,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingOrders,
        SUM(CASE WHEN cancel = 1 THEN 1 ELSE 0 END) as cancelledOrders
      FROM orderfile 
      WHERE CustomerCode = ?
    `, [customerId]);
        return {
            totalOrders: summary?.totalOrders || 0,
            totalAmount: summary?.totalAmount || 0,
            pendingOrders: summary?.pendingOrders || 0,
            cancelledOrders: summary?.cancelledOrders || 0
        };
    }
    async getRecentOrders(limit = 10) {
        return await (0, db_1.query)('SELECT * FROM orderfile ORDER BY created_at DESC LIMIT ?', [limit]);
    }
    async getOrdersByDateRange(startDate, endDate) {
        return await (0, db_1.query)('SELECT * FROM orderfile WHERE created_at BETWEEN ? AND ? ORDER BY created_at DESC', [startDate, endDate]);
    }
    // Bulk operations
    async createMultiple(orders) {
        const connection = await (0, db_1.getPool)().getConnection();
        const insertIds = [];
        try {
            await connection.beginTransaction();
            for (const order of orders) {
                const [result] = await connection.execute(`INSERT INTO orderfile (
            CustomerCode, Itemcode, Qty, Rate, Amount, 
            status, TransactionId, cancel, Address, deliverycharge, Email
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    order.CustomerCode,
                    order.Itemcode,
                    order.Qty,
                    order.Rate,
                    order.Amount,
                    order.status || 'pending',
                    order.TransactionId || '',
                    order.cancel || 0,
                    order.Address || '',
                    order.deliverycharge || 0,
                    order.Email || ''
                ]);
                insertIds.push(result.insertId);
            }
            await connection.commit();
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
        return insertIds;
    }
    async bulkUpdateStatus(orderIds, status) {
        if (orderIds.length === 0)
            return 0;
        const placeholders = orderIds.map(() => '?').join(',');
        const result = await (0, db_1.query)(`UPDATE orderfile SET status = ? WHERE id IN (${placeholders})`, [status, ...orderIds]);
        return result.affectedRows;
    }
    async bulkCancel(orderIds, cancel = 1) {
        if (orderIds.length === 0)
            return 0;
        const placeholders = orderIds.map(() => '?').join(',');
        const result = await (0, db_1.query)(`UPDATE orderfile SET cancel = ?, status = "cancelled" WHERE id IN (${placeholders})`, [cancel, ...orderIds]);
        return result.affectedRows;
    }
}
exports.OrderRepository = OrderRepository;
// In repository.ts, in the OrderRepository class
OrderRepository.endpoints = [
    { method: 'get', path: '/orders', handlerName: 'findAll' },
    { method: 'get', path: '/orders/recent', handlerName: 'getRecentOrders' },
    { method: 'get', path: '/orders/:id', handlerName: 'findById' },
    { method: 'get', path: '/customers/:customerId/orders', handlerName: 'findByCustomerId' },
    { method: 'get', path: '/orders/status/:status', handlerName: 'findByStatus' },
    { method: 'get', path: '/orders/transaction/:transactionId', handlerName: 'findByTransactionId' },
    { method: 'get', path: '/customers/:customerId/order-summary', handlerName: 'getOrderSummary' },
    { method: 'post', path: '/orders', handlerName: 'create' },
    { method: 'post', path: '/orders/with-details', handlerName: 'createWithDetails' }, // ADD THIS LINE
    { method: 'post', path: '/orders/bulk', handlerName: 'createMultiple' },
    { method: 'put', path: '/orders/:id', handlerName: 'update' },
    { method: 'put', path: '/orders/:id/status', handlerName: 'updateStatus' },
    { method: 'put', path: '/orders/:id/transaction', handlerName: 'updateTransactionId' },
    { method: 'put', path: '/orders/:id/cancel', handlerName: 'cancel' },
    { method: 'put', path: '/orders/bulk/status', handlerName: 'bulkUpdateStatus' },
    { method: 'put', path: '/orders/bulk/cancel', handlerName: 'bulkCancel' },
    { method: 'delete', path: '/orders/:id', handlerName: 'delete' },
];
// Multer configuration for file uploads
const storage = multer_1.default.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path_1.default.join(__dirname, '../uploads/products');
        // Create directory if it doesn't exist
        if (!fs_1.default.existsSync(uploadDir)) {
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path_1.default.extname(file.originalname);
        cb(null, 'product-' + uniqueSuffix + ext);
    }
});
// File filter for images only
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path_1.default.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
        return cb(null, true);
    }
    else {
        cb(new Error('Only image files are allowed'));
    }
};
exports.upload = (0, multer_1.default)({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: fileFilter
});
// Helper function to get image URL
const getImageUrl = (filename) => {
    // Return relative path
    return `/uploads/products/${filename}`;
};
exports.getImageUrl = getImageUrl;
// Handle single image upload
const uploadImageHandler = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const filename = req.file.filename;
    const imageUrl = (0, exports.getImageUrl)(filename);
    res.json({
        success: true,
        imageUrl: imageUrl,
        filename: filename
    });
};
exports.uploadImageHandler = uploadImageHandler;
// Helper function to delete image file
const deleteImageFile = (filename) => {
    try {
        const imagePath = path_1.default.join(__dirname, '../uploads/products', filename);
        if (fs_1.default.existsSync(imagePath)) {
            fs_1.default.unlinkSync(imagePath);
            return true;
        }
        return false;
    }
    catch (error) {
        console.error('Error deleting image file:', error);
        return false;
    }
};
exports.deleteImageFile = deleteImageFile;
// Helper function to get absolute path for image
const getImagePath = (filename) => {
    return path_1.default.join(__dirname, '../uploads/products', filename);
};
exports.getImagePath = getImagePath;

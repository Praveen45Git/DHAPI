// repository.ts - COMPLETE FIXED VERSION
import { query, queryUpdate, getPool } from './db'; // Import from YOUR db.ts
import { User, Product, MOQ, orderfile, orderdetail } from './entities';

// ============ BASE REPOSITORY ============
class BaseRepository<T> {
  protected tableName: string;
  
  constructor(tableName: string) {
    this.tableName = tableName;
  }

  async findAll(): Promise<T[]> {
    // CHANGE: Use double quotes for table names
    return await query<T[]>(`SELECT * FROM "${this.tableName}" ORDER BY id DESC`);
  }

  async findById(id: number): Promise<T | null> {
    // CHANGE: Use double quotes and $1 parameter
    const results = await query<T[]>(
      `SELECT * FROM "${this.tableName}" WHERE id = $1`,
      [id]
    );
    return results[0] || null;
  }

  async create(data: Partial<T>): Promise<number> {
    // CHANGE: PostgreSQL syntax for INSERT
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    
    const sql = `INSERT INTO "${this.tableName}" (${keys.join(', ')}) VALUES (${placeholders}) RETURNING id`;
    const result = await query<{ id: number; }[]>(sql, values);
    return result[0].id;
  }

  async update(id: number, data: Partial<T>): Promise<boolean> {
    // CHANGE: PostgreSQL syntax for UPDATE
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updates.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }
    
    if (updates.length === 0) return false;
    
    values.push(id);
    const sql = `UPDATE "${this.tableName}" SET ${updates.join(', ')} WHERE id = $${paramCount}`;
    const result = await queryUpdate(sql, values);
    return result.affectedRows > 0;
  }

  async delete(id: number): Promise<boolean> {
    // CHANGE: Use $1 parameter
    const result = await queryUpdate(`DELETE FROM "${this.tableName}" WHERE id = $1`, [id]);
    return result.affectedRows > 0;
  }
}

// ============ USER REPOSITORY ============
export class UserRepository extends BaseRepository<User> {
  constructor() {
    super('users');
  }

  async findByEmail(email: string): Promise<User | null> {
    // CHANGE: Use $1 parameter
    const users = await query<User[]>('SELECT * FROM users WHERE email = $1', [email]);
    return users[0] || null;
  }

  async create(user: Omit<User, 'id' | 'created_at'>): Promise<number> {
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
      
      const result = await query<{ id: number; }[]>(sql, values);
      return result[0].id;
      
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async toggleActive(id: number): Promise<boolean> {
    // CHANGE: PostgreSQL CASE statement
    const result = await queryUpdate(
      `UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = $1`,
      [id]
    );
    return result.affectedRows > 0;
  }

  async searchByName(name: string): Promise<User[]> {
    // CHANGE: Use ILIKE for case-insensitive and $1 parameter
    return await query<User[]>(
      'SELECT * FROM users WHERE name ILIKE $1 ORDER BY id DESC',
      [`%${name}%`]
    );
  }

  async findByStatus(isActive: number): Promise<User[]> {
    // CHANGE: Use $1 parameter
    return await query<User[]>(
      'SELECT * FROM users WHERE is_active = $1 ORDER BY id DESC',
      [isActive]
    );
  }

  async count(): Promise<number> {
    const result = await query<any[]>('SELECT COUNT(*) as count FROM users');
    return result[0]?.count || 0;
  }

  async getPaginated(page: number = 1, limit: number = 10): Promise<{ users: User[]; total: number; totalPages: number }> {
    const offset = (page - 1) * limit;
    
    // CHANGE: Use $1, $2 parameters
    const users = await query<User[]>(
      'SELECT * FROM users ORDER BY id DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    
    const total = await this.count();
    const totalPages = Math.ceil(total / limit);
    
    return { users, total, totalPages };
  }

  // Keep original updatePassword method
  async updatePassword(id: number, hashedPassword: string): Promise<boolean> {
    const result = await queryUpdate(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hashedPassword, id]
    );
    return result.affectedRows > 0;
  }

  // Keep original delete method from your code
  async delete(id: number): Promise<boolean> {
    const result = await queryUpdate('DELETE FROM users WHERE id = $1', [id]);
    return result.affectedRows > 0;
  }
}

// ============ PRODUCT REPOSITORY ============
export class ProductRepository {
  async findAll(): Promise<(Product & { moqs?: MOQ[] })[]> {
    const products = await query<Product[]>('SELECT * FROM products ORDER BY id DESC');
    
    const productIds = products.map((p: { id: any; }) => p.id).filter((id: undefined) => id !== undefined);
    
    if (productIds.length === 0) {
      return products.map((p: any) => ({ ...p, moqs: [] }));
    }
    
    // CHANGE: Use parameterized query with ANY()
    const moqs = await query<MOQ[]>(
      `SELECT * FROM moqs WHERE product_id = ANY($1) ORDER BY moq ASC`,
      [productIds]
    );
    
    const moqsByProductId: { [key: number]: MOQ[] } = {};
    moqs.forEach((moq: MOQ) => {
      if (moq.product_id !== undefined) {
        if (!moqsByProductId[moq.product_id]) {
          moqsByProductId[moq.product_id] = [];
        }
        moqsByProductId[moq.product_id].push(moq);
      }
    });
    
    return products.map((product: Product) => ({
      ...product,
      moqs: moqsByProductId[product.id!] || []
    }));
  }

  async findById(id: number): Promise<(Product & { moqs?: MOQ[] }) | null> {
    // Get the product
    const products = await query<Product[]>('SELECT * FROM products WHERE id = $1', [id]);
    const product = products[0];
    
    if (!product) return null;
    
    // Get MOQs for this product
    const moqs = await this.getMOQsForProduct(id);
    
    return { ...product, moqs };
  }

  async getMOQsForProduct(productId: number): Promise<MOQ[]> {
    return await query<MOQ[]>('SELECT * FROM moqs WHERE product_id = $1 ORDER BY moq ASC', [productId]);
  }

  async create(product: Omit<Product, 'id' | 'created_at'>): Promise<number> {
    const keys = Object.keys(product);
    const values = Object.values(product);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    
    const sql = `INSERT INTO products (${keys.join(', ')}) VALUES (${placeholders}) RETURNING id`;
    const result = await query<{ id: number; }[]>(sql, values);
    return result[0].id;
  }

  async update(id: number, product: Partial<Product>): Promise<boolean> {
    try {
      // Remove fields that shouldn't be updated
      const { id: _, created_at: __, ...updateData } = product;
      
      // Build SET clause dynamically
      const updates: string[] = [];
      const values: any[] = [];
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
      
      const result = await queryUpdate(sql, values);
      return result.affectedRows > 0;
      
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  }

  async toggleActive(id: number): Promise<boolean> {
    // CHANGE: PostgreSQL CASE statement
    const result = await queryUpdate(
      `UPDATE products SET active = CASE WHEN active = 'A' THEN 'I' ELSE 'A' END WHERE id = $1`,
      [id]
    );
    return result.affectedRows > 0;
  }

  async delete(id: number): Promise<boolean> {
    const result = await queryUpdate('DELETE FROM products WHERE id = $1', [id]);
    return result.affectedRows > 0;
  }

  // Additional method to get active products with MOQs
  async findActiveProducts(): Promise<(Product & { moqs?: MOQ[] })[]> {
    // First get all active products
    const products = await query<Product[]>('SELECT * FROM products WHERE active = \'A\' ORDER BY id DESC');
    
    // Get all MOQs for these products
    const productIds = products.map((p: { id: any; }) => p.id).filter((id: undefined) => id !== undefined);
    
    if (productIds.length === 0) {
      return products.map((p: any) => {
        return ({ ...p, moqs: [] });
      });
    }
    
    // Get MOQs for all active products at once
    const moqs = await query<MOQ[]>(
      `SELECT * FROM moqs WHERE product_id = ANY($1) ORDER BY moq ASC`,
      [productIds]
    );
    
    // Group MOQs by product_id
    const moqsByProductId: { [key: number]: MOQ[] } = {};
    moqs.forEach((moq: MOQ) => {
      if (moq.product_id !== undefined) {
        if (!moqsByProductId[moq.product_id]) {
          moqsByProductId[moq.product_id] = [];
        }
        moqsByProductId[moq.product_id].push(moq);
      }
    });
    
    // Combine products with their MOQs
    return products.map((product: Product) => ({
      ...product,
      moqs: moqsByProductId[product.id!] || []
    }));
  }
}

// ============ MOQ REPOSITORY ============
export class MOQRepository {
  async findByProductId(productId: number): Promise<MOQ[]> {
    // CHANGE: Use $1 parameter
    return await query<MOQ[]>('SELECT * FROM moqs WHERE product_id = $1 ORDER BY moq ASC', [productId]);
  }

  async setForProduct(productId: number, moqs: Omit<MOQ, 'id' | 'product_id' | 'created_at'>[]): Promise<boolean> {
    const pool = getPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete existing MOQs
      await client.query('DELETE FROM moqs WHERE product_id = $1', [productId]);
      
      // Insert new MOQs
      for (const moq of moqs) {
        await client.query(
          'INSERT INTO moqs (product_id, moq, rate) VALUES ($1, $2, $3)',
          [productId, moq.moq, moq.rate]
        );
      }
      
      await client.query('COMMIT');
      return true;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

// ============ ORDER REPOSITORY ============
export class OrderRepository {
  async findAll(): Promise<orderfile[]> {
    return await query<orderfile[]>('SELECT * FROM orderfile ORDER BY Created_Date DESC');
  }

  async findById(id: number): Promise<orderfile | null> {
    const orders = await query<orderfile[]>('SELECT * FROM orderfile WHERE id = $1', [id]);
    return orders[0] || null;
  }

  async create(order: Omit<orderfile, 'id' | 'Created_Date'>): Promise<number> {
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
    
    const result = await query<{ id: number; }[]>(sql, values);
    return result[0].id;
  }

  async updateStatus(id: number, status: string): Promise<boolean> {
    const result = await queryUpdate('UPDATE orderfile SET status = $1 WHERE id = $2', [status, id]);
    return result.affectedRows > 0;
  }

  async cancel(id: number): Promise<boolean> {
    const result = await queryUpdate('UPDATE orderfile SET cancel = 1, status = \'cancelled\' WHERE id = $1', [id]);
    return result.affectedRows > 0;
  }

  async findByCustomer(customerId: number): Promise<orderfile[]> {
    return await query<orderfile[]>(
      'SELECT * FROM orderfile WHERE CustomerCode = $1 ORDER BY Created_Date DESC',
      [customerId]
    );
  }
}

// ============ ORDER DETAIL REPOSITORY ============
export class OrderDetailRepository {
  async findByOrderId(orderId: number): Promise<orderdetail[]> {
    return await query<orderdetail[]>('SELECT * FROM orderdetail WHERE orderId = $1', [orderId]);
  }

  async createForOrder(orderId: number, details: Omit<orderdetail, 'id' | 'orderId' | 'Created_Date'>[]): Promise<boolean> {
    const pool = getPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const detail of details) {
        await client.query(
          'INSERT INTO orderdetail (orderId, Itemcode, Qty, Rate, Amount) VALUES ($1, $2, $3, $4, $5)',
          [orderId, detail.Itemcode, detail.Qty, detail.Rate, detail.Amount]
        );
      }
      
      await client.query('COMMIT');
      return true;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getOrderTotal(orderId: number): Promise<number> {
    const result = await query<any[]>('SELECT SUM(Amount) as total FROM orderdetail WHERE orderId = $1', [orderId]);
    return result[0]?.total || 0;
  }
}

// ============ COMPOSITE SERVICES ============
export class ProductService {
  private productRepo: ProductRepository;
  private moqRepo: MOQRepository;

  constructor() {
    this.productRepo = new ProductRepository();
    this.moqRepo = new MOQRepository();
  }

  async getProductWithMOQs(id: number): Promise<(Product & { moqs: MOQ[] }) | null> {
    const productWithMoqs = await this.productRepo.findById(id);
    if (!productWithMoqs) return null;
    
    return productWithMoqs as Product & { moqs: MOQ[] };
  }

  async createProductWithMOQs(productData: any, moqs: Omit<MOQ, 'id' | 'product_id' | 'created_at'>[]): Promise<number> {
    const pool = getPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create product
      const productResult = await client.query(
        'INSERT INTO products (name, price, description, image_url, active, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [productData.name, productData.price, productData.description, productData.image_url, productData.active || 'A', new Date()]
      );
      
      const productId = productResult.rows[0].id;
      
      // Create MOQs
      for (const moq of moqs) {
        await client.query(
          'INSERT INTO moqs (product_id, moq, rate, created_at) VALUES ($1, $2, $3, $4)',
          [productId, moq.moq, moq.rate, new Date()]
        );
      }
      
      await client.query('COMMIT');
      return productId;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateProductMOQs(productId: number, moqs: any[]): Promise<boolean> {
    try {
      const moqData: Omit<MOQ, 'id' | 'product_id' | 'created_at'>[] = moqs.map(moq => ({
        moq: moq.moq,
        rate: moq.rate
      }));
      
      return await this.moqRepo.setForProduct(productId, moqData);
    } catch (error) {
      throw error;
    }
  }
}

export class OrderService {
  private orderRepo: OrderRepository;
  private orderDetailRepo: OrderDetailRepository;

  constructor() {
    this.orderRepo = new OrderRepository();
    this.orderDetailRepo = new OrderDetailRepository();
  }

  async createOrderWithDetails(
    order: Omit<orderfile, 'id' | 'Created_Date'>,
    details: Omit<orderdetail, 'id' | 'orderId' | 'Created_Date'>[]
  ): Promise<number> {
    const pool = getPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create order
      const orderId = await this.orderRepo.create(order);
      
      // Create order details
      await this.orderDetailRepo.createForOrder(orderId, details);
      
      await client.query('COMMIT');
      return orderId;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getOrderFullDetails(orderId: number): Promise<{ order: orderfile; details: orderdetail[]; total: number } | null> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) return null;

    const details = await this.orderDetailRepo.findByOrderId(orderId);
    const total = await this.orderDetailRepo.getOrderTotal(orderId);

    return { order, details, total };
  }
}

// ============ IMAGE SERVICE ============
export class ImageService {
  private baseUrl = process.env.BASE_URL || 'http://localhost:3000';

  getFullUrl(filename: string): string {
    return `${this.baseUrl}/uploads/products/${filename}`;
  }

  getFilenameFromUrl(url: string): string {
    return url.split('/').pop() || '';
  }
}
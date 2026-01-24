// repository.ts
import { query, getPool } from './db';
import { User, Product, MOQ, orderfile, orderdetail } from './entities';

// ============ BASE REPOSITORY ============
class BaseRepository<T> {
  protected tableName: string;
  
  constructor(tableName: string) {
    this.tableName = tableName;
  }

  async findAll(): Promise<T[]> {
    return await query<T[]>(`SELECT * FROM ${this.tableName} ORDER BY id DESC`);
  }

  async findById(id: number): Promise<T | null> {
    const results = await query<T[]>(`SELECT * FROM ${this.tableName} WHERE id = ?`, [id]);
    return results[0] || null;
  }

  async create(data: Partial<T>): Promise<number> {
    const result = await query<any>(`INSERT INTO ${this.tableName} SET ?`, [data]);
    return result.insertId;
  }

  async update(id: number, data: Partial<T>): Promise<boolean> {
    const result = await query<any>(`UPDATE ${this.tableName} SET ? WHERE id = ?`, [data, id]);
    return result.affectedRows > 0;
  }

  async delete(id: number): Promise<boolean> {
    const result = await query<any>(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
    return result.affectedRows > 0;
  }
}

// ============ USER REPOSITORY ============
export class UserRepository extends BaseRepository<User> {
  constructor() {
    super('users');
  }

  async findByEmail(email: string): Promise<User | null> {
    const users = await query<User[]>('SELECT * FROM users WHERE email = ?', [email]);
    return users[0] || null;
  }
}

// ============ PRODUCT REPOSITORY ============
export class ProductRepository {
  async findAll(): Promise<Product[]> {
    return await query<Product[]>('SELECT * FROM products  ORDER BY id DESC');
  }

  async findById(id: number): Promise<Product | null> {
    const products = await query<Product[]>('SELECT * FROM products WHERE id = ?', [id]);
    return products[0] || null;
  }

  async create(product: Omit<Product, 'id' | 'created_at'>): Promise<number> {
    const result = await query<any>(
      'INSERT INTO products SET ?',
      [product]
    );
    return result.insertId;
  }

  async update(id: number, product: Partial<Product>): Promise<boolean> {
    try {
      // Remove fields that shouldn't be updated
      const { id: _, created_at: __, ...updateData } = product;
      
      // Build SET clause dynamically
      const setClauses: string[] = [];
      const values: any[] = [];
      
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
      
      const result = await query<any>(sql, values);
      return result.affectedRows > 0;
      
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  }

  async toggleActive(id: number): Promise<boolean> {
    const result = await query<any>(
      'UPDATE products SET active = IF(active = "A", "I", "A") WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  async delete(id: number): Promise<boolean> {
    const result = await query<any>('DELETE FROM products WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

// ============ MOQ REPOSITORY ============
export class MOQRepository {
  async findByProductId(productId: number): Promise<MOQ[]> {
    return await query<MOQ[]>('SELECT * FROM moqs WHERE product_id = ? ORDER BY moq ASC', [productId]);
  }

  async setForProduct(productId: number, moqs: Omit<MOQ, 'id' | 'product_id' | 'created_at'>[]): Promise<boolean> {
    const connection = await getPool().getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Delete existing MOQs
      await connection.execute('DELETE FROM moqs WHERE product_id = ?', [productId]);
      
      // Insert new MOQs
      for (const moq of moqs) {
        await connection.execute(
          'INSERT INTO moqs (product_id, moq, rate) VALUES (?, ?, ?)',
          [productId, moq.moq, moq.rate]
        );
      }
      
      await connection.commit();
      return true;
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

// ============ ORDER REPOSITORY ============
export class OrderRepository {
  async findAll(): Promise<orderfile[]> {
    return await query<orderfile[]>('SELECT * FROM orderfile ORDER BY Created_Date DESC');
  }

  async findById(id: number): Promise<orderfile | null> {
    const orders = await query<orderfile[]>('SELECT * FROM orderfile WHERE id = ?', [id]);
    return orders[0] || null;
  }

  async create(order: Omit<orderfile, 'id' | 'Created_Date'>): Promise<number> {
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
    
    const result = await query<any>(sql, values);
    return result.insertId;
  }

  async updateStatus(id: number, status: string): Promise<boolean> {
    const result = await query<any>('UPDATE orderfile SET status = ? WHERE id = ?', [status, id]);
    return result.affectedRows > 0;
  }

  async cancel(id: number): Promise<boolean> {
    const result = await query<any>('UPDATE orderfile SET cancel = 1, status = "cancelled" WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  async findByCustomer(customerId: number): Promise<orderfile[]> {
    return await query<orderfile[]>(
      'SELECT * FROM orderfile WHERE CustomerCode = ? ORDER BY Created_Date DESC',
      [customerId]
    );
  }
}

// ============ ORDER DETAIL REPOSITORY ============
export class OrderDetailRepository {
  async findByOrderId(orderId: number): Promise<orderdetail[]> {
    return await query<orderdetail[]>('SELECT * FROM orderdetail WHERE orderId = ?', [orderId]);
  }

  async createForOrder(orderId: number, details: Omit<orderdetail, 'id' | 'orderId' | 'Created_Date'>[]): Promise<boolean> {
    const connection = await getPool().getConnection();
    
    try {
      await connection.beginTransaction();
      
      for (const detail of details) {
        await connection.execute(
          'INSERT INTO orderdetail (orderId, Itemcode, Qty, Rate, Amount) VALUES (?, ?, ?, ?, ?)',
          [orderId, detail.Itemcode, detail.Qty, detail.Rate, detail.Amount]
        );
      }
      
      await connection.commit();
      return true;
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getOrderTotal(orderId: number): Promise<number> {
    const [result] = await query<any[]>('SELECT SUM(Amount) as total FROM orderdetail WHERE orderId = ?', [orderId]);
    return result?.total || 0;
  }
}

// ============ COMPOSITE SERVICES ============
export class ProductService {
  constructor(
    private productRepo = new ProductRepository(),
    private moqRepo = new MOQRepository()
  ) {}

  async getProductWithMOQs(id: number): Promise<(Product & { moqs: MOQ[] }) | null> {
    const product = await this.productRepo.findById(id);
    if (!product) return null;

    const moqs = await this.moqRepo.findByProductId(id);
    return { ...product, moqs };
  }

  async createProductWithMOQs(productData: any, moqs: Omit<MOQ, 'id' | 'product_id' | 'created_at'>[]): Promise<number> {
    const connection = await getPool().getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Create product
      const [productResult] = await connection.execute(
        'INSERT INTO products (name, price, description, image_url, active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [productData.name, productData.price, productData.description, productData.image_url, productData.active || 'A', new Date()]
      );
      
      const productId = (productResult as any).insertId;
      
      // Create MOQs
      for (const moq of moqs) {
        await connection.execute(
          'INSERT INTO moqs (product_id, moq, rate, created_at) VALUES (?, ?, ?, ?)',
          [productId, moq.moq, moq.rate, new Date()]
        );
      }
      
      await connection.commit();
      return productId;
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
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
  constructor(
    private orderRepo = new OrderRepository(),
    private orderDetailRepo = new OrderDetailRepository()
  ) {}

  async createOrderWithDetails(
    order: Omit<orderfile, 'id' | 'Created_Date'>,
    details: Omit<orderdetail, 'id' | 'orderId' | 'Created_Date'>[]
  ): Promise<number> {
    const connection = await getPool().getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Create order
      const orderId = await this.orderRepo.create(order);
      
      // Create order details
      await this.orderDetailRepo.createForOrder(orderId, details);
      
      await connection.commit();
      return orderId;
      
    } catch (error) {
      await connection.rollback();
      throw error;
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
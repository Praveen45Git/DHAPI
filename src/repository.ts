// repository.ts - WITH COMPLETE CLOUDINARY INTEGRATION FOR MULTIPLE IMAGES
import { query, queryUpdate, getPool } from './db';
import { User, Product, MOQ, orderfile, orderdetail, ProductGroup } from './entities';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: "dr2spdknx",
  api_key: "365316328269886",
  api_secret: "5nQbqSSbfTkf7ksS4RatCU3wUrs"
});

// ============ TYPE DEFINITIONS ============
interface ProductImages {
  image_url?: Buffer | string;
  image_url2?: Buffer | string;
  image_url3?: Buffer | string;
  image_url4?: Buffer | string;
}

interface UploadedImages {
  image_url?: string;
  image_url2?: string;
  image_url3?: string;
  image_url4?: string;
}

// ============ BASE REPOSITORY ============
class BaseRepository<T> {
  protected tableName: string;
  
  constructor(tableName: string) {
    this.tableName = tableName;
  }

  async findAll(): Promise<T[]> {
    return await query<T[]>(`SELECT * FROM "${this.tableName}" ORDER BY id DESC`);
  }

  async findById(id: number): Promise<T | null> {
    const results = await query<T[]>(
      `SELECT * FROM "${this.tableName}" WHERE id = $1`,
      [id]
    );
    return results[0] || null;
  }

  async create(data: Partial<T>): Promise<number> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    
    const sql = `INSERT INTO "${this.tableName}" (${keys.join(', ')}) VALUES (${placeholders}) RETURNING id`;
    const result = await query<{ id: number; }[]>(sql, values);
    return result[0].id;
  }

  async update(id: number, data: Partial<T>): Promise<boolean> {
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
    const result = await queryUpdate(`DELETE FROM "${this.tableName}" WHERE id = $1`, [id]);
    return result.affectedRows > 0;
  }

  // Add query method to BaseRepository
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    return await query<T[]>(sql, params);
  }
}

// ============ USER REPOSITORY ============
export class UserRepository extends BaseRepository<User> {
  constructor() {
    super('users');
  }

  async findByEmail(email: string): Promise<User | null> {
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
    const result = await queryUpdate(
      `UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = $1`,
      [id]
    );
    return result.affectedRows > 0;
  }

  async searchByName(name: string): Promise<User[]> {
    return await query<User[]>(
      'SELECT * FROM users WHERE name ILIKE $1 ORDER BY id DESC',
      [`%${name}%`]
    );
  }

  async findByStatus(isActive: number): Promise<User[]> {
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
    
    const users = await query<User[]>(
      'SELECT * FROM users ORDER BY id DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    
    const total = await this.count();
    const totalPages = Math.ceil(total / limit);
    
    return { users, total, totalPages };
  }

  async updatePassword(id: number, hashedPassword: string): Promise<boolean> {
    const result = await queryUpdate(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hashedPassword, id]
    );
    return result.affectedRows > 0;
  }
}

// ============ PRODUCT REPOSITORY ============
export class ProductRepository extends BaseRepository<Product> {
  constructor() {
    super('products');
  }

  async findAllWithMOQs(): Promise<(Product & { moqs?: MOQ[] })[]> {
    const products = await query<Product[]>('SELECT * FROM products ORDER BY id DESC');
    
    const productIds = products.map(p => p.id).filter(id => id !== undefined);
    
    if (productIds.length === 0) {
      return products.map(p => ({ ...p, moqs: [] }));
    }
    
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
    
    return products.map(product => ({
      ...product,
      moqs: moqsByProductId[product.id] || []
    }));
  }

  async findByIdWithMOQs(id: number): Promise<(Product & { moqs?: MOQ[] }) | null> {
    const product = await this.findById(id);
    if (!product) return null;
    
    const moqs = await this.getMOQsForProduct(id);
    
    return { ...product, moqs };
  }

  async getMOQsForProduct(productId: number): Promise<MOQ[]> {
    return await query<MOQ[]>('SELECT * FROM moqs WHERE product_id = $1 ORDER BY moq ASC', [productId]);
  }

  async createProduct(product: Omit<Product, 'id' | 'created_at'>): Promise<number> {
    const keys = Object.keys(product);
    const values = Object.values(product);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    
    const sql = `INSERT INTO products (${keys.join(', ')}) VALUES (${placeholders}) RETURNING id`;
    const result = await query<{ id: number; }[]>(sql, values);
    return result[0].id;
  }

  async updateProduct(id: number, product: Partial<Product>): Promise<boolean> {
    try {
      const { id: _, created_at: __, ...updateData } = product;
      
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
        return false;
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
    const result = await queryUpdate(
      `UPDATE products SET active = CASE WHEN active = 'A' THEN 'I' ELSE 'A' END WHERE id = $1`,
      [id]
    );
    return result.affectedRows > 0;
  }

  async deleteProduct(id: number): Promise<boolean> {
    const result = await queryUpdate('DELETE FROM products WHERE id = $1', [id]);
    return result.affectedRows > 0;
  }

  async findActiveProducts(): Promise<(Product & { moqs?: MOQ[] })[]> {
    const products = await query<Product[]>('SELECT * FROM products WHERE active = \'A\' ORDER BY id DESC');
    
    const productIds = products.map(p => p.id).filter(id => id !== undefined);
    
    if (productIds.length === 0) {
      return products.map(p => ({ ...p, moqs: [] }));
    }
    
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
    
    return products.map(product => ({
      ...product,
      moqs: moqsByProductId[product.id] || []
    }));
  }

  // NEW: Get product with all image URLs
  async getProductImages(productId: number): Promise<{
    image_url: string | null;
    image_url2: string | null;
    image_url3: string | null;
    image_url4: string | null;
  } | null> {
    const result = await query<any[]>(
      'SELECT image_url, image_url2, image_url3, image_url4 FROM products WHERE id = $1',
      [productId]
    );
    
    return result[0] || null;
  }

  // NEW: Update only image URLs
  async updateProductImages(
    productId: number,
    images: {
      image_url?: string | null;
      image_url2?: string | null;
      image_url3?: string | null;
      image_url4?: string | null;
    }
  ): Promise<boolean> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    for (const [key, value] of Object.entries(images)) {
      if (value !== undefined) {
        updates.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }
    
    if (updates.length === 0) return false;
    
    values.push(productId);
    const sql = `UPDATE products SET ${updates.join(', ')} WHERE id = $${paramCount}`;
    const result = await queryUpdate(sql, values);
    
    return result.affectedRows > 0;
  }

  // Get products by group ID
  async getProductsByGroupId(groupId: number): Promise<Product[]> {
    return await query<Product[]>(
      'SELECT * FROM products WHERE groupid = $1 ORDER BY name ASC',
      [groupId]
    );
  }

  // Get products with group information
  async getProductsWithGroups(): Promise<(Product & { group_name?: string })[]> {
    return await query<(Product & { group_name?: string })[]>(
      `SELECT p.*, pg.groupname as group_name 
       FROM products p 
       LEFT JOIN productgroups pg ON p.groupid = pg.id 
       ORDER BY p.id DESC`
    );
  }
}

// ============ MOQ REPOSITORY ============
export class MOQRepository {
  async findByProductId(productId: number): Promise<MOQ[]> {
    return await query<MOQ[]>('SELECT * FROM moqs WHERE product_id = $1 ORDER BY moq ASC', [productId]);
  }

  async setForProduct(productId: number, moqs: Omit<MOQ, 'id' | 'product_id' | 'created_at'>[]): Promise<boolean> {
    const pool = getPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      await client.query('DELETE FROM moqs WHERE product_id = $1', [productId]);
      
      for (const moq of moqs) {
        await client.query(
          'INSERT INTO moqs (product_id, moq, rate, created_at) VALUES ($1, $2, $3, $4)',
          [productId, moq.moq, moq.rate, new Date().toISOString()]
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

  async deleteByProductId(productId: number): Promise<boolean> {
    const result = await queryUpdate('DELETE FROM moqs WHERE product_id = $1', [productId]);
    return result.affectedRows > 0;
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
  // Original method - returns basic order details
  async findByOrderId(orderId: number): Promise<orderdetail[]> {
    return await query<orderdetail[]>('SELECT * FROM orderdetail WHERE orderId = $1', [orderId]);
  }

  // NEW: Find order details with product information including product name
  async findByOrderIdWithProducts(orderId: number): Promise<(orderdetail & { product_name?: string })[]> {
    const sql = `
      SELECT 
        od.*,
        p.name as product_name
      FROM orderdetail od
      LEFT JOIN products p ON od.itemcode = p.id
      WHERE od.orderId = $1
      ORDER BY od.id
    `;
    
    return await query<(orderdetail & { product_name?: string })[]>(sql, [orderId]);
  }

  // NEW: Find order details with full product information
  async findByOrderIdWithFullProducts(orderId: number): Promise<(orderdetail & { 
    product_name?: string;
    product_price?: number;
    product_description?: string;
    product_image_url?: string;
  })[]> {
    const sql = `
      SELECT 
        od.*,
        p.name as product_name,
        p.price as product_price,
        p.description as product_description,
        p.image_url as product_image_url
      FROM orderdetail od
      LEFT JOIN products p ON od.itemcode = p.id
      WHERE od.orderId = $1
      ORDER BY od.id
    `;
    
    const results = await query<any[]>(sql, [orderId]);
    
    // Map the results to include proper types
    return results.map(item => ({
      id: item.id,
      orderId: item.orderid,
      Itemcode: item.itemcode,
      Qty: item.qty,
      Rate: parseFloat(item.rate),
      Amount: parseFloat(item.amount),
      Created_Date: item.created_date,
      product_name: item.product_name,
      product_price: parseFloat(item.product_price),
      product_description: item.product_description,
      product_image_url: item.product_image_url,
      product_image_url2: item.product_image_url2,
      product_image_url3: item.product_image_url3,
      DeliveryCharge: parseFloat(item.deliverycharge)
    }));
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

// ============ IMAGE SERVICE (CLOUDINARY) ============
export class ImageService {
  private baseUrl = process.env.CLOUDINARY_BASE_URL || 'https://res.cloudinary.com';

  // Upload image to Cloudinary
  async uploadImage(fileBuffer: Buffer, options: {
    folder?: string;
    public_id?: string;
    transformation?: any[];
  } = {}): Promise<{
    url: string;
    secure_url: string;
    public_id: string;
    format: string;
    bytes: number;
    width: number;
    height: number;
  }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder || 'products',
          public_id: options.public_id,
          transformation: options.transformation,
          resource_type: 'auto'
        },
        (error: any, result: UploadApiResponse | undefined) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(new Error(`Failed to upload image: ${error.message}`));
          } else if (result) {
            resolve({
              url: result.url,
              secure_url: result.secure_url,
              public_id: result.public_id,
              format: result.format,
              bytes: result.bytes,
              width: result.width,
              height: result.height
            });
          } else {
            reject(new Error('No result from Cloudinary'));
          }
        }
      );

      uploadStream.end(fileBuffer);
    });
  }

  // Upload image from base64 string
  async uploadImageFromBase64(base64String: string, options: {
    folder?: string;
    public_id?: string;
    transformation?: any[];
  } = {}): Promise<{
    url: string;
    secure_url: string;
    public_id: string;
    format: string;
    bytes: number;
    width: number;
    height: number;
  }> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        base64String,
        {
          folder: options.folder || 'products',
          public_id: options.public_id,
          transformation: options.transformation,
          resource_type: 'image'
        },
        (error: any, result: UploadApiResponse | undefined) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(new Error(`Failed to upload image: ${error.message}`));
          } else if (result) {
            resolve({
              url: result.url,
              secure_url: result.secure_url,
              public_id: result.public_id,
              format: result.format,
              bytes: result.bytes,
              width: result.width,
              height: result.height
            });
          } else {
            reject(new Error('No result from Cloudinary'));
          }
        }
      );
    });
  }

  // Delete image from Cloudinary
  async deleteImage(publicId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, (error: any, result: any) => {
        if (error) {
          console.error('Cloudinary delete error:', error);
          reject(new Error(`Failed to delete image: ${error.message}`));
        } else {
          resolve(result.result === 'ok');
        }
      });
    });
  }

  // Extract public_id from Cloudinary URL
  extractPublicIdFromUrl(url: string): string | null {
    try {
      const urlParts = url.split('/');
      const uploadIndex = urlParts.findIndex(part => part === 'upload');
      
      if (uploadIndex === -1) return null;
      
      let publicIdParts = urlParts.slice(uploadIndex + 1);
      
      if (publicIdParts[0].startsWith('v')) {
        publicIdParts = publicIdParts.slice(1);
      }
      
      const publicIdWithExtension = publicIdParts.join('/');
      
      const lastDotIndex = publicIdWithExtension.lastIndexOf('.');
      if (lastDotIndex !== -1) {
        return publicIdWithExtension.substring(0, lastDotIndex);
      }
      
      return publicIdWithExtension;
    } catch (error) {
      console.error('Error extracting public_id from URL:', error);
      return null;
    }
  }

  // Generate Cloudinary URL with transformations
  generateUrl(publicId: string, transformation: any[] = []): string {
    return cloudinary.url(publicId, {
      transformation: transformation
    });
  }

  // Get optimized product image URL
  getProductImageUrl(imagePath: string, width: number = 400, height: number = 300): string {
    if (!imagePath) return '';
    
    if (imagePath.includes('cloudinary.com')) {
      const publicId = this.extractPublicIdFromUrl(imagePath);
      if (publicId) {
        return cloudinary.url(publicId, {
          transformation: [
            { width, height, crop: 'fill' },
            { quality: 'auto' },
            { fetch_format: 'auto' }
          ]
        });
      }
    }
    
    return imagePath;
  }
}

// ============ PRODUCT SERVICE WITH MULTIPLE IMAGE SUPPORT ============
export class ProductService {
  private productRepo: ProductRepository;
  private moqRepo: MOQRepository;
  private imageService: ImageService;

  constructor() {
    this.productRepo = new ProductRepository();
    this.moqRepo = new MOQRepository();
    this.imageService = new ImageService();
  }

  async getProductWithMOQs(id: number): Promise<(Product & { moqs: MOQ[] }) | null> {
    const productWithMoqs = await this.productRepo.findByIdWithMOQs(id);
    if (!productWithMoqs) return null;
    
    return productWithMoqs as Product & { moqs: MOQ[] };
  }

  // NEW: Method to handle multiple image uploads
  async uploadProductImages(
    imageFiles: ProductImages,
    productId?: number
  ): Promise<UploadedImages> {
    const uploadedImages: UploadedImages = {};

    const uploadPromises: Promise<void>[] = [];

    // Helper function to upload a single image
    const uploadImage = async (
      key: keyof ProductImages,
      file: Buffer | string
    ): Promise<void> => {
      try {
        const publicId = productId 
          ? `product_${productId}_${key}_${Date.now()}`
          : `product_${key}_${Date.now()}`;

        let uploadResult;
        if (typeof file === 'string') {
          // Base64 string
          uploadResult = await this.imageService.uploadImageFromBase64(file, {
            folder: 'products',
            public_id: publicId
          });
        } else if (Buffer.isBuffer(file)) {
          // Buffer
          uploadResult = await this.imageService.uploadImage(file, {
            folder: 'products',
            public_id: publicId
          });
        }
        
        if (uploadResult) {
          (uploadedImages as any)[key] = uploadResult.secure_url;
        }
      } catch (error) {
        console.error(`Failed to upload ${key}:`, error);
        (uploadedImages as any)[key] = '';
      }
    };

    // Create upload promises for each image
    if (imageFiles.image_url) {
      uploadPromises.push(uploadImage('image_url', imageFiles.image_url));
    }
    if (imageFiles.image_url2) {
      uploadPromises.push(uploadImage('image_url2', imageFiles.image_url2));
    }
    if (imageFiles.image_url3) {
      uploadPromises.push(uploadImage('image_url3', imageFiles.image_url3));
    }
    if (imageFiles.image_url4) {
      uploadPromises.push(uploadImage('image_url4', imageFiles.image_url4));
    }

    // Wait for all uploads to complete
    await Promise.allSettled(uploadPromises);

    return uploadedImages;
  }

  // NEW: Delete old images when updating
  async deleteOldImages(imageUrls: UploadedImages): Promise<void> {
    const deletePromises: Promise<void>[] = [];

    const deleteImage = async (url: string): Promise<void> => {
      if (url && url.includes('cloudinary.com')) {
        const publicId = this.imageService.extractPublicIdFromUrl(url);
        if (publicId) {
          try {
            await this.imageService.deleteImage(publicId);
          } catch (error) {
            console.warn(`Failed to delete image from Cloudinary: ${publicId}`, error);
          }
        }
      }
    };

    if (imageUrls.image_url) {
      deletePromises.push(deleteImage(imageUrls.image_url));
    }
    if (imageUrls.image_url2) {
      deletePromises.push(deleteImage(imageUrls.image_url2));
    }
    if (imageUrls.image_url3) {
      deletePromises.push(deleteImage(imageUrls.image_url3));
    }
    if (imageUrls.image_url4) {
      deletePromises.push(deleteImage(imageUrls.image_url4));
    }

    await Promise.allSettled(deletePromises);
  }

  // NEW: Create product with multiple images
  async createProductWithImages(
    productData: any,
    moqs: Omit<MOQ, 'id' | 'product_id' | 'created_at'>[],
    images?: ProductImages
  ): Promise<number> {
    const pool = getPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Upload images if provided
      let uploadedImages: UploadedImages = {};
      if (images) {
        uploadedImages = await this.uploadProductImages(images);
      }
      
      // Create product with image URLs
      const productResult = await client.query(
        `INSERT INTO products (
          name, price, description, active, created_at, specialprice,
          image_url, image_url2, image_url3, image_url4, groupid
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          productData.name,
          productData.price,
          productData.description || '',
          productData.active || 'A',
          new Date().toISOString(),
          productData.specialprice || null,
          uploadedImages.image_url || '',
          uploadedImages.image_url2 || '',
          uploadedImages.image_url3 || '',
          uploadedImages.image_url4 || '',
          productData.groupid || null
        ]
      );
      
      const productId = productResult.rows[0].id;
      
      // Create MOQs if provided
      if (moqs && moqs.length > 0) {
        for (const moq of moqs) {
          await client.query(
            'INSERT INTO moqs (product_id, moq, rate, created_at) VALUES ($1, $2, $3, $4)',
            [productId, moq.moq, moq.rate, new Date().toISOString()]
          );
        }
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

  // NEW: Update product with multiple images
  async updateProductWithImages(
    productId: number,
    productData: Partial<Product>,
    moqs?: Omit<MOQ, 'id' | 'product_id' | 'created_at'>[],
    images?: ProductImages
  ): Promise<boolean> {
    const pool = getPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current product to check for existing images
      const productResult = await client.query(
        'SELECT image_url, image_url2, image_url3, image_url4 FROM products WHERE id = $1',
        [productId]
      );
      
      if (productResult.rows.length === 0) {
        throw new Error('Product not found');
      }
      
      const currentProduct = productResult.rows[0];
      let uploadedImages: UploadedImages = {};
      
      // Upload new images if provided
      if (images) {
        // Prepare images to delete (only if new image is provided for that field)
        const imagesToDelete: UploadedImages = {
          image_url: images.image_url ? currentProduct.image_url : undefined,
          image_url2: images.image_url2 ? currentProduct.image_url2 : undefined,
          image_url3: images.image_url3 ? currentProduct.image_url3 : undefined,
          image_url4: images.image_url4 ? currentProduct.image_url4 : undefined
        };
        
        // Delete old images
        await this.deleteOldImages(imagesToDelete);
        
        // Upload new images
        uploadedImages = await this.uploadProductImages(images, productId);
      }
      
      // Prepare update data
      const updateData: any = { ...productData };
      
      // Only update image fields if new images were uploaded
      if (uploadedImages.image_url !== undefined) {
        updateData.image_url = uploadedImages.image_url;
      }
      if (uploadedImages.image_url2 !== undefined) {
        updateData.image_url2 = uploadedImages.image_url2;
      }
      if (uploadedImages.image_url3 !== undefined) {
        updateData.image_url3 = uploadedImages.image_url3;
      }
      if (uploadedImages.image_url4 !== undefined) {
        updateData.image_url4 = uploadedImages.image_url4;
      }
      
      // Build SET clause for product update
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;
      
      // Remove id and created_at from update data
      const { id, created_at, ...updateFields } = updateData;
      
      for (const [key, value] of Object.entries(updateFields)) {
        if (value !== undefined) {
          updates.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      }
      
      // Update product if there are fields to update
      if (updates.length > 0) {
        values.push(productId);
        const sql = `UPDATE products SET ${updates.join(', ')} WHERE id = $${paramCount}`;
        await client.query(sql, values);
      }
      
      // Update MOQs if provided
      if (moqs) {
        // Delete existing MOQs
        await client.query('DELETE FROM moqs WHERE product_id = $1', [productId]);
        
        // Insert new MOQs
        for (const moq of moqs) {
          await client.query(
            'INSERT INTO moqs (product_id, moq, rate, created_at) VALUES ($1, $2, $3, $4)',
            [productId, moq.moq, moq.rate, new Date().toISOString()]
          );
        }
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

  // NEW: Update specific product image
  async updateProductImage(
    productId: number,
    imageType: 'image_url' | 'image_url2' | 'image_url3' | 'image_url4',
    imageFile: Buffer | string
  ): Promise<string> {
    const pool = getPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current product to check for existing image
      const productResult = await client.query(
        'SELECT image_url, image_url2, image_url3, image_url4 FROM products WHERE id = $1',
        [productId]
      );
      
      if (productResult.rows.length === 0) {
        throw new Error('Product not found');
      }
      
      const currentProduct = productResult.rows[0];
      const currentImageUrl = currentProduct[imageType];
      
      // Delete old image if it exists
      if (currentImageUrl && currentImageUrl.includes('cloudinary.com')) {
        const publicId = this.imageService.extractPublicIdFromUrl(currentImageUrl);
        if (publicId) {
          await this.imageService.deleteImage(publicId);
        }
      }
      
      // Upload new image
      let newImageUrl = '';
      const publicId = `product_${productId}_${imageType}_${Date.now()}`;
      
      if (typeof imageFile === 'string') {
        const uploadResult = await this.imageService.uploadImageFromBase64(imageFile, {
          folder: 'products',
          public_id: publicId
        });
        newImageUrl = uploadResult.secure_url;
      } else if (Buffer.isBuffer(imageFile)) {
        const uploadResult = await this.imageService.uploadImage(imageFile, {
          folder: 'products',
          public_id: publicId
        });
        newImageUrl = uploadResult.secure_url;
      }
      
      // Update product with new image URL
      await client.query(
        `UPDATE products SET ${imageType} = $1 WHERE id = $2`,
        [newImageUrl, productId]
      );
      
      await client.query('COMMIT');
      return newImageUrl;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // NEW: Delete specific product image
  async deleteProductImage(
    productId: number,
    imageType: 'image_url' | 'image_url2' | 'image_url3' | 'image_url4'
  ): Promise<boolean> {
    const pool = getPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current product to check for existing image
      const productResult = await client.query(
        'SELECT image_url, image_url2, image_url3, image_url4 FROM products WHERE id = $1',
        [productId]
      );
      
      if (productResult.rows.length === 0) {
        throw new Error('Product not found');
      }
      
      const currentProduct = productResult.rows[0];
      const currentImageUrl = currentProduct[imageType];
      
      // Delete from Cloudinary if it exists
      if (currentImageUrl && currentImageUrl.includes('cloudinary.com')) {
        const publicId = this.imageService.extractPublicIdFromUrl(currentImageUrl);
        if (publicId) {
          await this.imageService.deleteImage(publicId);
        }
      }
      
      // Update database to set the image field to null
      await client.query(
        `UPDATE products SET ${imageType} = NULL WHERE id = $1`,
        [productId]
      );
      
      await client.query('COMMIT');
      return true;
      
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

  // Get optimized image URL for product
  async getProductOptimizedImage(productId: number, width: number = 400, height: number = 300): Promise<{
    image_url: string;
    image_url2: string;
    image_url3: string;
    image_url4: string;
  }> {
    const product = await this.productRepo.findById(productId);
    
    const result = {
      image_url: '',
      image_url2: '',
      image_url3: '',
      image_url4: ''
    };
    
    if (product) {
      if (product.image_url) {
        result.image_url = this.imageService.getProductImageUrl(product.image_url, width, height);
      }
      if (product.image_url2) {
        result.image_url2 = this.imageService.getProductImageUrl(product.image_url2, width, height);
      }
      if (product.image_url3) {
        result.image_url3 = this.imageService.getProductImageUrl(product.image_url3, width, height);
      }
      if (product.image_url4) {
        result.image_url4 = this.imageService.getProductImageUrl(product.image_url4, width, height);
      }
    }
    
    return result;
  }

  // NEW: Get products by group ID with MOQs
  async getProductsByGroupId(groupId: number): Promise<(Product & { moqs?: MOQ[] })[]> {
    const products = await this.productRepo.getProductsByGroupId(groupId);
    
    const productIds = products.map(p => p.id).filter(id => id !== undefined);
    
    if (productIds.length === 0) {
      return products.map(p => ({ ...p, moqs: [] }));
    }
    
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
    
    return products.map(product => ({
      ...product,
      moqs: moqsByProductId[product.id] || []
    }));
  }

  // NEW: Update product group
  async updateProductGroup(productId: number, groupId: number | null): Promise<boolean> {
    const result = await queryUpdate(
      'UPDATE products SET groupid = $1 WHERE id = $2',
      [groupId, productId]
    );
    return result.affectedRows > 0;
  }

  // NEW: Get products with group information and MOQs
  async getProductsWithGroups(): Promise<(Product & { moqs?: MOQ[]; group_name?: string })[]> {
    const products = await this.productRepo.getProductsWithGroups();
    
    const productIds = products.map(p => p.id).filter(id => id !== undefined);
    
    if (productIds.length === 0) {
      return products.map(p => ({ ...p, moqs: [] }));
    }
    
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
    
    return products.map(product => ({
      ...product,
      moqs: moqsByProductId[product.id] || [],
      group_name: product.group_name
    }));
  }
}

// ============ ORDER SERVICE ============
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

  async getOrderFullDetails(orderId: number): Promise<{ 
    order: orderfile; 
    details: (orderdetail & { product_name?: string })[]; 
    total: number 
  } | null> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) return null;

    // Get details with product information
    const details = await this.orderDetailRepo.findByOrderIdWithProducts(orderId);
    const total = await this.orderDetailRepo.getOrderTotal(orderId);

    return { order, details, total };
  }

  // NEW: Get order with full product information
  async getOrderFullDetailsWithProducts(orderId: number): Promise<{ 
    order: orderfile; 
    details: (orderdetail & { 
      product_name?: string;
      product_price?: number;
      product_description?: string;
      product_image_url?: string;
    })[]; 
    total: number 
  } | null> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) return null;

    // Get details with full product information
    const details = await this.orderDetailRepo.findByOrderIdWithFullProducts(orderId);
    const total = await this.orderDetailRepo.getOrderTotal(orderId);

    return { order, details, total };
  }
}

// ============ PRODUCT GROUP REPOSITORY ============
export class ProductGroupRepository extends BaseRepository<ProductGroup> {
  constructor() {
    super('productgroups'); // Assuming your table is named 'productgroups'
  }

  async createGroup(group: Omit<ProductGroup, 'id' | 'created_at'>): Promise<number> {
    const sql = `
      INSERT INTO productgroups (groupname, is_active, created_at) 
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    
    const values = [
      group.groupname,
      group.is_active !== undefined ? group.is_active : 1,
      new Date().toISOString()
    ];
    
    const result = await query<{ id: number; }[]>(sql, values);
    return result[0].id;
  }

  async updateGroup(id: number, group: Partial<ProductGroup>): Promise<boolean> {
    const { id: _, created_at: __, ...updateData } = group;
    
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
    
    if (updates.length === 0) return false;
    
    values.push(id);
    const sql = `UPDATE productgroups SET ${updates.join(', ')} WHERE id = $${paramCount}`;
    const result = await queryUpdate(sql, values);
    
    return result.affectedRows > 0;
  }

  async toggleActive(id: number): Promise<boolean> {
    const result = await queryUpdate(
      `UPDATE productgroups SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = $1`,
      [id]
    );
    return result.affectedRows > 0;
  }

  async getActiveGroups(): Promise<ProductGroup[]> {
    return await query<ProductGroup[]>(
      'SELECT * FROM productgroups WHERE is_active = 1 ORDER BY groupname ASC'
    );
  }

  async getGroupsWithProductCount(): Promise<(ProductGroup & { product_count: number })[]> {
    const sql = `
      SELECT 
        pg.*,
        COUNT(p.id) as product_count
      FROM productgroups pg
      LEFT JOIN products p ON pg.id = p.groupid
      GROUP BY pg.id
      ORDER BY pg.groupname ASC
    `;
    
    return await query<(ProductGroup & { product_count: number })[]>(sql);
  }

  async searchGroups(searchTerm: string): Promise<ProductGroup[]> {
    return await query<ProductGroup[]>(
      'SELECT * FROM productgroups WHERE groupname ILIKE $1 OR description ILIKE $2 ORDER BY groupname ASC',
      [`%${searchTerm}%`, `%${searchTerm}%`]
    );
  }

  async getGroupProducts(groupId: number): Promise<Product[]> {
    return await query<Product[]>(
      'SELECT * FROM products WHERE groupid = $1 ORDER BY name ASC',
      [groupId]
    );
  }

  async count(): Promise<number> {
    const result = await query<any[]>('SELECT COUNT(*) as count FROM productgroups');
    return result[0]?.count || 0;
  }

  async getPaginated(page: number = 1, limit: number = 10): Promise<{ groups: ProductGroup[]; total: number; totalPages: number }> {
    const offset = (page - 1) * limit;
    
    const groups = await query<ProductGroup[]>(
      'SELECT * FROM productgroups ORDER BY groupname ASC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    
    const total = await this.count();
    const totalPages = Math.ceil(total / limit);
    
    return { groups, total, totalPages };
  }
}
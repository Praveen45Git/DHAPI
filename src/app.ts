// app.ts - WITH CLOUDINARY INTEGRATION AND NEON KEEP-ALIVE (UPDATED FOR MULTIPLE IMAGES)
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import bcrypt from 'bcrypt';
import { createPool, testConnection } from './db';
import { 
  ProductService, 
  OrderService,
  UserRepository,
  ProductRepository,
  OrderRepository,
  OrderDetailRepository,
  ImageService,
  ProductGroupRepository  
} from './repository';
import { MOQ } from './entities';
import { parse } from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

// Cloudinary configuration - make sure these are set in your .env file
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn('⚠️  Cloudinary environment variables not set. Image uploads will fail.');
}

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:8080', 
    'http://localhost:3000', 
    'http://localhost:8081', 
    'http://diamondholdingsco.com',
    'https://diamondholdingsco.com',
    'https://www.diamondholdingsco.com',
    'http://admin.diamondholdingsco.com', 
    'https://admin.diamondholdingsco.com',
    'https://www.admin.diamondholdingsco.com'
  ],
  credentials: true
};

// Multer configuration for file uploads
const storage = multer.memoryStorage();

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const isValid = allowedTypes.test(file.mimetype);
    if (isValid) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// ============ MIDDLEWARE ============
app.use(cors(corsOptions));
app.use(express.json());

// Services
const userRepo = new UserRepository();
const productRepo = new ProductRepository();
const orderRepo = new OrderRepository();
const orderDetailRepo = new OrderDetailRepository();
const orderService = new OrderService();
const imageService = new ImageService();
const productGroupRepo = new ProductGroupRepository();

// ============ HELPER FUNCTIONS ============
function removePasswordFromUser(user: any): any {
  const { password_hash, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

// Parse MOQs from string
function parseMOQs(moqsString: string): any[] {
  try {
    return JSON.parse(moqsString);
  } catch (error) {
    console.error('Error parsing MOQs:', error);
    return [];
  }
}

// ============ KEEP NEON DATABASE ALIVE ============
let keepAliveInterval: NodeJS.Timeout;

function startKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  keepAliveInterval = setInterval(async () => {
    try {
      const { getPool } = await import('./db');
      const pool = getPool();
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('💚 Neon keep-alive ping sent');
    } catch (error) {
      console.error('💔 Neon keep-alive ping failed:', error);
    }
  }, 4 * 60 * 1000);
  
  console.log('🚀 Neon keep-alive service started (prevents cold starts)');
}

// ============ INITIALIZE APP ============
async function initializeApp() {
  try {
    await createPool();
    await testConnection();
    console.log('✅ Database connected');
    
    // Start keep-alive to prevent Neon from sleeping
    startKeepAlive();
    
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    cloudinary: {
      configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
    }
  });
});

// ============ TEST CLOUDINARY UPLOAD ============
app.post('/api/test-cloudinary-upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image uploaded' });
    }

    const uploadResult = await imageService.uploadImage(req.file.buffer, {
      folder: 'test',
      public_id: `test_${Date.now()}`,
      transformation: [
        { width: 800, height: 600, crop: 'fill' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    });

    res.json({ 
      success: true, 
      message: 'Cloudinary upload successful',
      data: uploadResult
    });
  } catch (error: any) {
    console.error('Cloudinary upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to upload to Cloudinary: ${error.message}` 
    });
  }
});

// ============ USERS ============
app.get('/users', async (req, res) => {
  try {
    const users = await userRepo.findAll();
    const safeUsers = users.map(removePasswordFromUser);
    res.json({ success: true, data: safeUsers });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

app.get('/users/:id', async (req, res) => {
  try {
    const user = await userRepo.findById(parseInt(req.params.id));
    if (user) {
      const safeUser = removePasswordFromUser(user);
      res.json({ success: true, data: safeUser });
    } else {
      res.status(404).json({ success: false, error: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
});

app.post('/users', async (req, res) => {
  try {
    const { name, email, age, password, is_active } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name, email and password are required' 
      });
    }

    const existingUser = await userRepo.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email already registered' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userData = {
      name,
      email,
      age: age || 0,
      password_hash: hashedPassword,
      is_active: is_active !== undefined ? is_active : 1,
      created_at: new Date().toISOString()
    };

    const userId = await userRepo.create(userData);
    res.status(201).json({ 
      success: true, 
      data: { 
        id: userId,
        name: userData.name,
        email: userData.email,
        age: userData.age,
        is_active: userData.is_active
      }
    });
  } catch (error: any) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create user' 
    });
  }
});

app.put('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { name, email, age, is_active, password } = req.body;
    
    const existingUser = await userRepo.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    if (email && email !== existingUser.email) {
      const emailUser = await userRepo.findByEmail(email);
      if (emailUser) {
        return res.status(400).json({ 
          success: false, 
          error: 'Email already in use' 
        });
      }
    }
    
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (age !== undefined) updateData.age = age;
    if (is_active !== undefined) updateData.is_active = is_active;
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password_hash = hashedPassword;
    }
    
    const success = await userRepo.update(userId, updateData);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'User updated successfully' 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
  } catch (error: any) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to update user' 
    });
  }
});

app.delete('/users/:id', async (req, res) => {
  try {
    const success = await userRepo.delete(parseInt(req.params.id));
    if (success) {
      res.json({ 
        success: true, 
        message: 'User deleted successfully' 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete user' 
    });
  }
});

app.put('/users/:id/toggle-active', async (req, res) => {
  try {
    const success = await userRepo.toggleActive(parseInt(req.params.id));
    if (success) {
      res.json({ 
        success: true, 
        message: 'User status updated' 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update user status' 
    });
  }
});

app.get('/users/search/:query', async (req, res) => {
  try {
    const users = await userRepo.searchByName(req.params.query);
    const safeUsers = users.map(removePasswordFromUser);
    res.json({ 
      success: true, 
      data: safeUsers 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to search users' 
    });
  }
});

app.get('/users/status/:status', async (req, res) => {
  try {
    const status = parseInt(req.params.status);
    const users = await userRepo.findByStatus(status);
    const safeUsers = users.map(removePasswordFromUser);
    res.json({ 
      success: true, 
      data: safeUsers 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch users' 
    });
  }
});

app.get('/users/page/:page', async (req, res) => {
  try {
    const page = parseInt(req.params.page) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const { users, total, totalPages } = await userRepo.getPaginated(page, limit);
    const safeUsers = users.map(removePasswordFromUser);
    
    res.json({ 
      success: true, 
      data: {
        users: safeUsers,
        total,
        totalPages,
        currentPage: page,
        limit
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch users' 
    });
  }
});

app.get('/users/stats', async (req, res) => {
  try {
    const users = await userRepo.findAll();
    
    const total = users.length;
    const active = users.filter((user: { is_active: number; }) => user.is_active === 1).length;
    const inactive = total - active;
    const averageAge = users.length > 0 
      ? users.reduce((sum: any, user: { age: any; }) => sum + user.age, 0) / users.length 
      : 0;

    res.json({ 
      success: true, 
      data: {
        total,
        active,
        inactive,
        averageAge: parseFloat(averageAge.toFixed(2))
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get user statistics' 
    });
  }
});

app.post('/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and password are required' 
      });
    }
    
    const user = await userRepo.findByEmail(email);
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }
    
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }
    
    const safeUser = removePasswordFromUser(user);
    res.json({ 
      success: true, 
      message: 'Login successful',
      data: safeUser
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Login failed' 
    });
  }
});

app.put('/users/:id/change-password', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Current password and new password are required' 
      });
    }
    
    const user = await userRepo.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Current password is incorrect' 
      });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const success = await userRepo.updatePassword(userId, hashedPassword);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Password changed successfully' 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to change password' 
    });
  }
});

// ============ PRODUCTS WITH MULTIPLE IMAGES ============

// NEW: Create product with multiple images
app.post('/products/create-with-images', 
  upload.fields([
    { name: 'image_url', maxCount: 1 },
    { name: 'image_url2', maxCount: 1 },
    { name: 'image_url3', maxCount: 1 },
    { name: 'image_url4', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const { name, price, description, active, moqs, specialprice, groupid } = req.body;
      
      if (!name || !price) {
        return res.status(400).json({ success: false, error: 'Name and price are required' });
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      const images: any = {};
      
      // Process uploaded files
      if (files?.image_url) {
        images.image_url = files.image_url[0].buffer;
      }
      if (files?.image_url2) {
        images.image_url2 = files.image_url2[0].buffer;
      }
      if (files?.image_url3) {
        images.image_url3 = files.image_url3[0].buffer;
      }
      if (files?.image_url4) {
        images.image_url4 = files.image_url4[0].buffer;
      }
      
      // Parse MOQs if provided
      const moqsArray = moqs ? parseMOQs(moqs) : [];
      
      const productData = { 
        name, 
        price: parseFloat(price), 
        description: description || '', 
        active: active || 'A',
        specialprice: specialprice ? parseFloat(specialprice) : null,
        groupid: groupid || null
      };

      // Create product with images
      const productId = await new ProductService().createProductWithImages(
        productData,
        moqsArray,
        Object.keys(images).length > 0 ? images : undefined
      );
      
      const createdProduct = await new ProductService().getProductWithMOQs(productId);
      
      res.status(201).json({ 
        success: true, 
        message: 'Product created successfully with multiple Cloudinary image uploads',
        data: createdProduct
      });

    } catch (error: any) {
      console.error('Error creating product:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to create product' 
      });
    }
  }
);

// UPDATED: Update product with multiple images
app.put('/products/:id/update-with-images',
  upload.fields([
    { name: 'image_url', maxCount: 1 },
    { name: 'image_url2', maxCount: 1 },
    { name: 'image_url3', maxCount: 1 },
    { name: 'image_url4', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { name, price, description, active, moqs, specialprice, groupid } = req.body;
      
      if (!name || !price) {
        return res.status(400).json({ success: false, error: 'Name and price are required' });
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      const images: any = {};
      
      // Process uploaded files
      if (files?.image_url) {
        images.image_url = files.image_url[0].buffer;
      }
      if (files?.image_url2) {
        images.image_url2 = files.image_url2[0].buffer;
      }
      if (files?.image_url3) {
        images.image_url3 = files.image_url3[0].buffer;
      }
      if (files?.image_url4) {
        images.image_url4 = files.image_url4[0].buffer;
      }
      
      const updateData: any = { 
        name, 
        price: parseFloat(price), 
        description: description || '',
        active: active || 'A',
        specialprice: specialprice ? parseFloat(specialprice) : null,
        groupid: groupid || null
      };

      // Parse MOQs if provided
      const moqsArray = moqs ? parseMOQs(moqs) : undefined;
      
      // Update product with images
      const success = await new ProductService().updateProductWithImages(
        productId,
        updateData,
        moqsArray,
        Object.keys(images).length > 0 ? images : undefined
      );
      
      if (!success) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }
      
      const updatedProduct = await new ProductService().getProductWithMOQs(productId);
      
      // Get optimized image URLs
      const optimizedImages = await new ProductService().getProductOptimizedImage(productId);
      
      res.json({ 
        success: true, 
        message: 'Product updated successfully with multiple Cloudinary images',
        data: {
          ...updatedProduct,
          ...optimizedImages
        }
      });

    } catch (error: any) {
      console.error('Error updating product:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to update product' 
      });
    }
  }
);

// Get all products
app.get('/products', async (req, res) => {
  try {
    const products = await productRepo.findAll();
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
});

// Get active products
app.get('/products/active', async (req, res) => {
  try {
    const products = await productRepo.findAll();
    const activeProducts = products.filter(p => p.active === 'A');
    res.json({ success: true, data: activeProducts });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
});

// Get single product with details
app.get('/products/:id', async (req, res) => {
  try {
    const product = await new ProductService().getProductWithMOQs(parseInt(req.params.id));
    if (product) {
      // Get optimized image URLs
      const optimizedImages = await new ProductService().getProductOptimizedImage(parseInt(req.params.id));
      
      res.json({ 
        success: true, 
        data: {
          ...product,
          ...optimizedImages
        }
      });
    } else {
      res.status(404).json({ success: false, error: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch product' });
  }
});

// Get product with full details including optimized images
app.get('/products/:id/full', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const product = await new ProductService().getProductWithMOQs(productId);
    
    if (product) {
      // Get all optimized image URLs
      const optimizedImages = await new ProductService().getProductOptimizedImage(productId);
      
      res.json({ 
        success: true, 
        data: {
          ...product,
          ...optimizedImages
        }
      });
    } else {
      res.status(404).json({ success: false, error: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch product' });
  }
});

// Legacy product creation (for backward compatibility)
app.post('/products', upload.single('image'), async (req, res) => {
  try {
    const { name, price, description, active, SpecialPrice } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ success: false, error: 'Name and price are required' });
    }

    const productData = { 
      name, 
      price: parseFloat(price), 
      description: description || '', 
      image_url: '',
      active: active || 'A',
      created_at: new Date().toISOString(),
      SpecialPrice: SpecialPrice ? parseFloat(SpecialPrice) : null,
      image_url2: null,
      image_url3: null,
      image_url4: null
    };

    let productId: number;
    
    if (req.file) {
      // Upload single image
      const images = { image_url: req.file.buffer };
      productId = await new ProductService().createProductWithImages(
        productData,
        [],
        images
      );
    } else {
      // Create without image
      productId = await new ProductService().createProductWithImages(
        productData,
        [],
        undefined
      );
    }
    
    res.status(201).json({ 
      success: true, 
      data: { 
        id: productId, 
        name: productData.name,
        price: productData.price,
        description: productData.description,
        active: productData.active
      }
    });

  } catch (error: any) {
    console.error('Error creating product:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create product' 
    });
  }
});

// Basic product update
app.put('/products/:id', async (req, res) => {
  try {
    const success = await productRepo.update(parseInt(req.params.id), req.body);
    if (success) {
      res.json({ success: true, message: 'Product updated' });
    } else {
      res.status(404).json({ success: false, error: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update product' });
  }
});

// Delete product
app.delete('/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    // Get product to delete images from Cloudinary
    const product = await productRepo.findById(productId);
    
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    // Delete images from Cloudinary
    await new ProductService().deleteOldImages({
      image_url: product.image_url || '',
      image_url2: product.image_url2 || '',
      image_url3: product.image_url3 || '',
      image_url4: product.image_url4 || ''
    });
    
    // Delete the product from database
    const success = await productRepo.delete(productId);
    
    if (success) {
      res.json({ success: true, message: 'Product deleted' });
    } else {
      res.status(404).json({ success: false, error: 'Product not found' });
    }
  } catch (error: any) {
    console.error('Error deleting product:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to delete product' 
    });
  }
});

// Update specific product image
app.put('/products/:id/images/:imageType',
  upload.single('image'),
  async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const imageType = req.params.imageType as 'image_url' | 'image_url2' | 'image_url3' | 'image_url4';
      
      // Validate image type
      const validImageTypes = ['image_url', 'image_url2', 'image_url3', 'image_url4'];
      if (!validImageTypes.includes(imageType)) {
        return res.status(400).json({ success: false, error: 'Invalid image type' });
      }
      
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image file provided' });
      }
      
      // Update the specific image
      const newImageUrl = await new ProductService().updateProductImage(
        productId,
        imageType,
        req.file.buffer
      );
      
      res.json({
        success: true,
        imageUrl: newImageUrl,
        message: `Image ${imageType} updated successfully`
      });
      
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete specific product image
app.delete('/products/:id/images/:imageType', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const imageType = req.params.imageType as 'image_url' | 'image_url2' | 'image_url3' | 'image_url4';
    
    // Validate image type
    const validImageTypes = ['image_url', 'image_url2', 'image_url3', 'image_url4'];
    if (!validImageTypes.includes(imageType)) {
      return res.status(400).json({ success: false, error: 'Invalid image type' });
    }
    
    const success = await new ProductService().deleteProductImage(productId, imageType);
    
    res.json({
      success,
      message: `Image ${imageType} deleted successfully`
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get product images
app.get('/products/:id/images', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    const images = await productRepo.getProductImages(productId);
    
    if (!images) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    // Generate optimized URLs for display
    const optimizedImages: any = {};
    for (const [key, url] of Object.entries(images)) {
      if (url) {
        optimizedImages[`${key}_optimized`] = imageService.getProductImageUrl(url, 400, 300);
      } else {
        optimizedImages[`${key}_optimized`] = null;
      }
    }
    
    res.json({
      success: true,
      data: {
        ...images,
        ...optimizedImages
      }
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Legacy product creation with MOQs (for backward compatibility)
app.post('/products/create-with-moqs', upload.single('image'), async (req, res) => {
  try {
    const { name, price, description, active, moqs } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ success: false, error: 'Name and price are required' });
    }

    const productData = { 
      name, 
      price: parseFloat(price), 
      description: description || '', 
      image_url: '',
      active: active || 'A',
      image_url2: null,
      image_url3: null,
      image_url4: null
    };

    const moqsArray = moqs ? parseMOQs(moqs) : [];
    
    let productId: number;
    
    if (req.file) {
      // Upload single image
      const images = { image_url: req.file.buffer };
      productId = await new ProductService().createProductWithImages(
        productData,
        moqsArray,
        images
      );
    } else {
      productId = await new ProductService().createProductWithImages(
        productData,
        moqsArray,
        undefined
      );
    }
    
    const createdProduct = await new ProductService().getProductWithMOQs(productId);
    
    res.status(201).json({ 
      success: true, 
      message: 'Product created successfully with Cloudinary image upload',
      data: createdProduct
    });

  } catch (error: any) {
    console.error('Error creating product:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create product' 
    });
  }
});

// Legacy update product with MOQs (for backward compatibility)
app.put('/products/:id/update-with-moqs', upload.single('image'), async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { name, price, description, active, moqs, specialprice } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ success: false, error: 'Name and price are required' });
    }

    const updateData: any = { 
      name, 
      price: parseFloat(price), 
      description: description || '',
      active: active || 'A',
      specialprice: parseFloat(specialprice)
    };

    const moqsArray = moqs ? parseMOQs(moqs) : [];
    
    // If image is provided, update it
    if (req.file) {
      const newImageUrl = await new ProductService().updateProductImage(
        productId,
        'image_url',
        req.file.buffer
      );
      updateData.image_url = newImageUrl;
    }
    
    // Update product with MOQs
    const success = await new ProductService().updateProductWithImages(
      productId,
      updateData,
      moqsArray,
      undefined
    );
    
    if (!success) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    const updatedProduct = await new ProductService().getProductWithMOQs(productId);
    
    res.json({ 
      success: true, 
      message: 'Product updated successfully',
      data: updatedProduct
    });

  } catch (error: any) {
    console.error('Error updating product:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to update product' 
    });
  }
});

// Toggle product active status
app.put('/products/:id/toggle-active', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const success = await productRepo.toggleActive(productId);
    
    if (success) {
      res.json({ success: true, message: 'Product status updated' });
    } else {
      res.status(404).json({ success: false, error: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update product status' });
  }
});

// ============ CLOUDINARY IMAGE MANAGEMENT ============
app.delete('/cloudinary/images/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    const success = await imageService.deleteImage(publicId);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Image deleted from Cloudinary' 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'Failed to delete image' 
      });
    }
  } catch (error: any) {
    console.error('Error deleting image:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to delete image' 
    });
  }
});

app.get('/cloudinary/optimize-url', async (req, res) => {
  try {
    const { url, width, height } = req.query;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'URL parameter is required' 
      });
    }
    
    const optimizedUrl = imageService.getProductImageUrl(
      url, 
      width ? parseInt(width as string) : 400, 
      height ? parseInt(height as string) : 300
    );
    
    res.json({ 
      success: true, 
      data: { 
        originalUrl: url,
        optimizedUrl 
      }
    });
  } catch (error: any) {
    console.error('Error generating optimized URL:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to generate optimized URL' 
    });
  }
});

// ============ ORDERS ============
app.get('/orders', async (req, res) => {
  try {
    const orders = await orderRepo.findAll();
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

// UPDATED: Get order by ID with product information
app.get('/orders/:id', async (req, res) => {
  try {
    const order = await orderService.getOrderFullDetails(parseInt(req.params.id));
    if (order) {
      res.json({ success: true, data: order });
    } else {
      res.status(404).json({ success: false, error: 'Order not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch order' });
  }
});

// NEW: Get order with full product information
app.get('/orders/:id/full', async (req, res) => {
  try {
    const order = await orderService.getOrderFullDetailsWithProducts(parseInt(req.params.id));
    if (order) {
      res.json({ success: true, data: order });
    } else {
      res.status(404).json({ success: false, error: 'Order not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch order' });
  }
});

app.post('/orders', async (req, res) => {
  try {
    const { order, details } = req.body;
    
    let orderId;
    if (details && details.length > 0) {
      orderId = await orderService.createOrderWithDetails(order, details);
    } else {
      orderId = await orderRepo.create(order);
    }

    res.status(201).json({ success: true, data: { id: orderId } });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ success: false, error: 'Failed to create order' });
  }
});

app.put('/orders/:id/status', async (req, res) => {
  try {
    const success = await orderRepo.updateStatus(parseInt(req.params.id), req.body.status);
    if (success) {
      res.json({ success: true, message: 'Order status updated' });
    } else {
      res.status(404).json({ success: false, error: 'Order not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update order status' });
  }
});

app.get('/customers/:customerId/orders', async (req, res) => {
  try {
    const orders = await orderRepo.findByCustomer(parseInt(req.params.customerId));
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

// ============ GENERAL IMAGE UPLOAD ============
app.post('/upload/cloudinary', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image uploaded' });
    }

    const uploadResult = await imageService.uploadImage(req.file.buffer, {
      folder: 'uploads',
      public_id: `upload_${Date.now()}`,
      transformation: [
        { width: 1200, height: 800, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    });

    res.json({ 
      success: true, 
      message: 'Image uploaded to Cloudinary successfully',
      data: uploadResult
    });
  } catch (error: any) {
    console.error('Cloudinary upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to upload to Cloudinary: ${error.message}` 
    });
  }
});

// ============ PRODUCT GROUPS API ============

// Get all product groups
app.get('/product-groups', async (req, res) => {
  try {
    const groups = await productGroupRepo.findAll();
    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch product groups' });
  }
});

// Get active product groups
app.get('/product-groups/active', async (req, res) => {
  try {
    const groups = await productGroupRepo.getActiveGroups();
    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch active product groups' });
  }
});

// Get product groups with product count
app.get('/product-groups/with-count', async (req, res) => {
  try {
    const groups = await productGroupRepo.getGroupsWithProductCount();
    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch product groups with count' });
  }
});

// Get single product group
app.get('/product-groups/:id', async (req, res) => {
  try {
    const group = await productGroupRepo.findById(parseInt(req.params.id));
    if (group) {
      res.json({ success: true, data: group });
    } else {
      res.status(404).json({ success: false, error: 'Product group not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch product group' });
  }
});

// Create product group
app.post('/product-groups', async (req, res) => {
  try {
    const { groupname, description, is_active } = req.body;
    
    if (!groupname) {
      return res.status(400).json({ 
        success: false, 
        error: 'Group name is required' 
      });
    }
    
    const groupData = {
      groupname,
      description: description || '',
      is_active: is_active !== undefined ? is_active : 1
    };
    
    const groupId = await productGroupRepo.createGroup(groupData);
    
    res.status(201).json({ 
      success: true, 
      data: { 
        id: groupId,
        ...groupData
      }
    });
  } catch (error: any) {
    console.error('Error creating product group:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create product group' 
    });
  }
});

// Update product group
app.put('/product-groups/:id', async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const { groupname, description, is_active } = req.body;
    
    const existingGroup = await productGroupRepo.findById(groupId);
    if (!existingGroup) {
      return res.status(404).json({ 
        success: false, 
        error: 'Product group not found' 
      });
    }
    
    const updateData: any = {};
    if (groupname !== undefined) updateData.groupname = groupname;
    if (is_active !== undefined) updateData.is_active = is_active;
    
    const success = await productGroupRepo.updateGroup(groupId, updateData);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Product group updated successfully' 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'Product group not found' 
      });
    }
  } catch (error: any) {
    console.error('Error updating product group:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to update product group' 
    });
  }
});

// Delete product group
app.delete('/product-groups/:id', async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    
    // Check if group has products using ProductService
    const products = await new ProductService().getProductsByGroupId(groupId);
    
    // Check if there are any products in this group
    if (products && products.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete product group that has products. Please reassign or delete products first.' 
      });
    }
    
    const success = await productGroupRepo.delete(groupId);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Product group deleted successfully' 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'Product group not found' 
      });
    }
  } catch (error: any) {
    console.error('Error deleting product group:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to delete product group' 
    });
  }
});

// Toggle product group active status
app.put('/product-groups/:id/toggle-active', async (req, res) => {
  try {
    const success = await productGroupRepo.toggleActive(parseInt(req.params.id));
    if (success) {
      res.json({ 
        success: true, 
        message: 'Product group status updated' 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'Product group not found' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update product group status' 
    });
  }
});

// Search product groups
app.get('/product-groups/search/:query', async (req, res) => {
  try {
    const groups = await productGroupRepo.searchGroups(req.params.query);
    res.json({ 
      success: true, 
      data: groups 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to search product groups' 
    });
  }
});

// Get paginated product groups
app.get('/product-groups/page/:page', async (req, res) => {
  try {
    const page = parseInt(req.params.page) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const { groups, total, totalPages } = await productGroupRepo.getPaginated(page, limit);
    
    res.json({ 
      success: true, 
      data: {
        groups,
        total,
        totalPages,
        currentPage: page,
        limit
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch product groups' 
    });
  }
});

// ============ PRODUCTS BY GROUP ID ============

// Get products by group ID
app.get('/products/group/:groupId', async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    
    // Check if group exists
    const group = await productGroupRepo.findById(groupId);
    if (!group) {
      return res.status(404).json({ 
        success: false, 
        error: 'Product group not found' 
      });
    }
    
    // Call instance method
    const products = await new ProductService().getProductsByGroupId(groupId);
    
    res.json({ 
      success: true, 
      data: {
        group,
        products
      }
    });
  } catch (error: any) {
    console.error('Error fetching products by group:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch products by group' 
    });
  }
});

// Get active products by group ID
app.get('/products/group/:groupId/active', async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    
    // Check if group exists
    const group = await productGroupRepo.findById(groupId);
    if (!group) {
      return res.status(404).json({ 
        success: false, 
        error: 'Product group not found' 
      });
    }
    
    // Call instance method
    const allProducts = await new ProductService().getProductsByGroupId(groupId);
    const activeProducts = allProducts.filter(p => p.active === 'A');
    
    res.json({ 
      success: true, 
      data: {
        group,
        products: activeProducts
      }
    });
  } catch (error: any) {
    console.error('Error fetching active products by group:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch active products by group' 
    });
  }
});

// Get products with group information
app.get('/products/with-groups', async (req, res) => {
  try {
    // Call instance method with await
    const products = await new ProductService().getProductsWithGroups();
    res.json({ 
      success: true, 
      data: products 
    });
  } catch (error: any) {
    console.error('Error fetching products with groups:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch products with groups' 
    });
  }
});

// Update product group assignment
app.put('/products/:id/group', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { groupid } = req.body;
    
    // Check if product exists
    const product = await productRepo.findById(productId);
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        error: 'Product not found' 
      });
    }
    
    // If groupid is provided, check if group exists
    if (groupid !== null && groupid !== undefined) {
      const group = await productGroupRepo.findById(groupid);
      if (!group) {
        return res.status(404).json({ 
          success: false, 
          error: 'Product group not found' 
        });
      }
    }
    
    // Call instance method
    const success = await new ProductService().updateProductGroup(productId, groupid);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Product group updated successfully' 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'Product not found' 
      });
    }
  } catch (error: any) {
    console.error('Error updating product group:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to update product group' 
    });
  }
});

// ============ ERROR HANDLING ============
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        success: false, 
        error: 'File too large. Maximum size is 10MB' 
      });
    }
    return res.status(400).json({ 
      success: false, 
      error: `File upload error: ${err.message}` 
    });
  }
  
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// ============ START SERVER ============
app.listen(PORT, async () => {
  const dbConnected = await initializeApp();
  
  const baseUrl = `http://localhost:${PORT}`;
  console.log(`🚀 Server running on ${baseUrl}`);
  console.log(`📊 Database: ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
  
  // Check Cloudinary configuration
  const cloudinaryConfigured = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
  console.log(`☁️  Cloudinary: ${cloudinaryConfigured ? '✅ Configured' : '❌ Not Configured'}`);
  
  // Show keep-alive status
  console.log(`💚 Neon keep-alive: ✅ Active (prevents cold starts)`);
  
  console.log('\n📋 Main endpoints:');
  console.log('  GET    /api/health                    - Health check');
  console.log('  GET    /users                        - List all users');
  console.log('  GET    /products                     - List all products');
  console.log('  GET    /orders                       - List all orders');
  console.log('  GET    /orders/:id                   - Get order with product names');
  console.log('  GET    /orders/:id/full              - Get order with full product info');
  console.log('\n🖼️  Product Image Endpoints:');
  console.log('  POST   /products/create-with-images  - Create product with 4 images');
  console.log('  PUT    /products/:id/update-with-images - Update product with 4 images');
  console.log('  GET    /products/:id/images          - Get all product images');
  console.log('  PUT    /products/:id/images/:type    - Update specific image');
  console.log('  DELETE /products/:id/images/:type    - Delete specific image');
  console.log('\n📁 Product Group Endpoints:');
  console.log('  GET    /product-groups               - List all product groups');
  console.log('  GET    /product-groups/active        - List active product groups');
  console.log('  GET    /product-groups/with-count    - Groups with product count');
  console.log('  GET    /product-groups/:id           - Get single group');
  console.log('  POST   /product-groups               - Create product group');
  console.log('  PUT    /product-groups/:id           - Update product group');
  console.log('  DELETE /product-groups/:id           - Delete product group');
  console.log('\n📦 Products by Group:');
  console.log('  GET    /products/group/:groupId      - Get products by group ID');
  console.log('  GET    /products/group/:groupId/active - Get active products by group');
  console.log('  GET    /products/with-groups         - Get products with group info');
  console.log('  PUT    /products/:id/group           - Update product group assignment');
  console.log('\n💡 Neon will stay warm with automatic keep-alive pings');
  console.log('💡 First request might still be slow, but subsequent ones will be fast');
});
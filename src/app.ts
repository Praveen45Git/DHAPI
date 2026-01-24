// app.ts
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { createPool, testConnection } from './db';
import { 
  ProductService, 
  OrderService,
  UserRepository,
  ProductRepository,
  OrderRepository,
  OrderDetailRepository,
  ImageService 
} from './repository';
import { MOQ } from './entities';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration - Use correct paths
const ROOT_DIR = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const PRODUCTS_UPLOAD_DIR = path.join(UPLOADS_DIR, 'products');
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const imageService = new ImageService();

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:8081', 'http://localhost:5173'],
  credentials: true
};

// Initialize app
async function initializeApp() {
  try {
    await createPool();
    await testConnection();
    console.log('✅ Database connected');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

// Ensure upload directories exist
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log(`📁 Created uploads directory: ${UPLOADS_DIR}`);
}

if (!fs.existsSync(PRODUCTS_UPLOAD_DIR)) {
  fs.mkdirSync(PRODUCTS_UPLOAD_DIR, { recursive: true });
  console.log(`📁 Created products upload directory: ${PRODUCTS_UPLOAD_DIR}`);
}

// Multer configuration - use PRODUCTS_UPLOAD_DIR
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PRODUCTS_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const isValid = allowedTypes.test(file.mimetype);
    cb(null, isValid);
  }
});

// ============ MIDDLEWARE ============
app.use(cors(corsOptions));
app.use(express.json());

// CORRECT STATIC FILE SERVING
// Serve the entire uploads directory
app.use('/uploads', express.static(UPLOADS_DIR));

// Services
const userRepo = new UserRepository();
const productRepo = new ProductRepository();
const productService = new ProductService();
const orderRepo = new OrderRepository();
const orderDetailRepo = new OrderDetailRepository();
const orderService = new OrderService();

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// ============ TEST FILE ACCESS ============
app.get('/check-directories', (req, res) => {
  const directories = {
    __dirname,
    ROOT_DIR,
    UPLOADS_DIR: {
      path: UPLOADS_DIR,
      exists: fs.existsSync(UPLOADS_DIR),
      files: fs.existsSync(UPLOADS_DIR) ? fs.readdirSync(UPLOADS_DIR) : []
    },
    PRODUCTS_UPLOAD_DIR: {
      path: PRODUCTS_UPLOAD_DIR,
      exists: fs.existsSync(PRODUCTS_UPLOAD_DIR),
      files: fs.existsSync(PRODUCTS_UPLOAD_DIR) ? fs.readdirSync(PRODUCTS_UPLOAD_DIR) : []
    }
  };
  
  res.json({ success: true, data: directories });
});

app.get('/test-file/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(PRODUCTS_UPLOAD_DIR, filename);
    
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      res.json({
        success: true,
        data: {
          filename,
          filePath,
          exists: true,
          size: stats.size,
          url: `${BASE_URL}/uploads/products/${filename}`
        }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'File not found',
        filePath,
        searchedDir: PRODUCTS_UPLOAD_DIR
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check file'      
    });
  }
});

// ============ TEST IMAGE UPLOAD ============
app.post('/api/test-upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image uploaded' });
    }

    const imageUrl = imageService.getFullUrl(req.file.filename);
    
    res.json({ 
      success: true, 
      message: 'Upload successful',
      data: {
        originalName: req.file.originalname,
        filename: req.file.filename,
        imageUrl: imageUrl,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload image' });
  }
});

// ============ LIST UPLOADED FILES ============
app.get('/api/uploads', (req, res) => {
  try {
    const files = fs.readdirSync(PRODUCTS_UPLOAD_DIR);
    const fileInfo = files.map(file => {
      const filePath = path.join(PRODUCTS_UPLOAD_DIR, file);
      const stats = fs.statSync(filePath);
      return {
        filename: file,
        url: imageService.getFullUrl(file),
        size: stats.size,
        created: stats.birthtime
      };
    });
    
    res.json({ success: true, data: fileInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to list files' });
  }
});

// ============ USERS ============
app.get('/users', async (req, res) => {
  try {
    const users = await userRepo.findAll();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

app.get('/users/:id', async (req, res) => {
  try {
    const user = await userRepo.findById(parseInt(req.params.id));
    if (user) {
      res.json({ success: true, data: user });
    } else {
      res.status(404).json({ success: false, error: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
});

app.post('/users', async (req, res) => {
  try {
    const userId = await userRepo.create(req.body);
    res.status(201).json({ success: true, data: { id: userId } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create user' });
  }
});

// ============ PRODUCTS ============
app.get('/products', async (req, res) => {
  try {
    const products = await productRepo.findAll();
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
});

app.get('/products/active', async (req, res) => {
  try {
    const products = await productRepo.findAll();
    const activeProducts = products.filter(p => p.active === 'A');
    res.json({ success: true, data: activeProducts });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
});

app.get('/products/:id', async (req, res) => {
  try {
    const product = await productService.getProductWithMOQs(parseInt(req.params.id));
    if (product) {
      res.json({ success: true, data: product });
    } else {
      res.status(404).json({ success: false, error: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch product' });
  }
});

app.get('/products/:id/full', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const product = await productService.getProductWithMOQs(productId);
    
    if (product) {
      if (product.image_url && !product.image_url.startsWith('http')) {
        product.image_url = imageService.getFullUrl(product.image_url);
      }
      
      res.json({ 
        success: true, 
        data: product 
      });
    } else {
      res.status(404).json({ success: false, error: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch product' });
  }
});

app.post('/products', upload.single('image'), async (req, res) => {
  try {
    const { name, price, description, active, moqs } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ success: false, error: 'Name and price are required' });
    }

    let image_url = null;
    if (req.file) {
      image_url = imageService.getFullUrl(req.file.filename);
    }

    const productData = { 
      name, 
      price: parseFloat(price), 
      description: description || '', 
      image_url, 
      active: active || 'A',
      Created_Date: new Date().toISOString(),
    };

    const productId = await productRepo.create(productData);
    
    res.status(201).json({ 
      success: true, 
      data: { 
        id: productId, 
        name: productData.name,
        price: productData.price,
        description: productData.description,
        image_url: productData.image_url,
        active: productData.active
      }
    });

  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ success: false, error: 'Failed to create product' });
  }
});

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

app.delete('/products/:id', async (req, res) => {
  try {
    const success = await productRepo.delete(parseInt(req.params.id));
    if (success) {
      res.json({ success: true, message: 'Product deleted' });
    } else {
      res.status(404).json({ success: false, error: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete product' });
  }
});

// ============ PRODUCT IMAGE UPLOAD ============
app.post('/products/:id/image', upload.single('image'), async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image uploaded' });
    }
    
    const imageUrl = imageService.getFullUrl(req.file.filename);
    const success = await productRepo.update(productId, { image_url: imageUrl });
    
    if (success) {
      res.json({ 
        success: true, 
        data: { 
          filename: req.file.filename, 
          imageUrl,
          size: req.file.size 
        }
      });
    } else {
      res.status(404).json({ success: false, error: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to upload image' });
  }
});

// ============ CREATE PRODUCT WITH IMAGE AND MOQs ============
app.post('/products/create-with-moqs', upload.single('image'), async (req, res) => {
  try {
    const { name, price, description, active, moqs } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ success: false, error: 'Name and price are required' });
    }

    let image_url = null;
    if (req.file) {
      image_url = imageService.getFullUrl(req.file.filename);
    }

    const productData = { 
      name, 
      price: parseFloat(price), 
      description: description || '', 
      image_url, 
      active: active || 'A',
      Created_Date: new Date().toISOString(),
    };

    let moqList: Array<Omit<MOQ, 'id' | 'product_id' | 'Created_Date'>> = [];
    if (moqs) {
      try {
        moqList = JSON.parse(moqs);
      } catch (e) {
        return res.status(400).json({ success: false, error: 'Invalid MOQs format' });
      }
    }

    const productId = await productService.createProductWithMOQs(productData, moqList);

    res.status(201).json({ 
      success: true, 
      data: { 
        id: productId, 
        ...productData
      }
    });

  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ success: false, error: 'Failed to create product' });
  }
});

// ============ UPDATE PRODUCT AND MOQs ============
app.put('/products/:id/update-with-moqs', upload.single('image'), async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { name, price, description, active, moqs } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ success: false, error: 'Name and price are required' });
    }

    const updateData: any = { 
      name, 
      price: parseFloat(price), 
      description: description || '',
      active: active || 'A'
    };

    if (req.file) {
      updateData.image_url = imageService.getFullUrl(req.file.filename);
    }

    const productUpdated = await productRepo.update(productId, updateData);
    
    if (!productUpdated) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    if (moqs) {
      let moqList: any[] = [];
      try {
        moqList = JSON.parse(moqs);
        
        if (Array.isArray(moqList) && moqList.length > 0) {
          await productService.updateProductMOQs(productId, moqList);
        }
      } catch (e) {
        console.log('No MOQs provided or invalid format, skipping MOQ update');
      }
    }
    
    const updatedProduct = await productService.getProductWithMOQs(productId);
    
    if (updatedProduct && updatedProduct.image_url && !updatedProduct.image_url.startsWith('http')) {
      updatedProduct.image_url = imageService.getFullUrl(updatedProduct.image_url);
    }
    
    res.json({ 
      success: true, 
      message: 'Product updated successfully',
      data: updatedProduct
    });

  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, error: 'Failed to update product' });
  }
});

// ============ TOGGLE PRODUCT ACTIVE STATUS ============
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

// ============ ORDERS ============
app.get('/orders', async (req, res) => {
  try {
    const orders = await orderRepo.findAll();
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

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

// ============ IMAGE UPLOAD ============
app.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image uploaded' });
    }

    const imageUrl = imageService.getFullUrl(req.file.filename);
    
    res.json({ 
      success: true, 
      data: { 
        filename: req.file.filename, 
        imageUrl,
        size: req.file.size 
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to upload image' });
  }
});

// ============ ERROR HANDLING ============
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ============ START SERVER ============
app.listen(PORT, async () => {
  const dbConnected = await initializeApp();
  
  console.log(`🚀 Server running on ${BASE_URL}`);
  console.log(`📁 Project root: ${ROOT_DIR}`);
  console.log(`📁 Uploads directory: ${UPLOADS_DIR}`);
  console.log(`📁 Products uploads: ${PRODUCTS_UPLOAD_DIR}`);
  console.log(`📊 Database: ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
  
  // List available image files
  if (fs.existsSync(PRODUCTS_UPLOAD_DIR)) {
    const files = fs.readdirSync(PRODUCTS_UPLOAD_DIR);
    if (files.length > 0) {
      console.log('\n📸 Available product images:');
      files.forEach(file => {
        console.log(`   ${file} → ${BASE_URL}/uploads/products/${file}`);
      });
    }
  }
  
  console.log('\n📋 Available endpoints:');
  console.log('  GET    /check-directories             - Check directory structure');
  console.log('  GET    /test-file/:filename           - Test file access');
  console.log('  GET    /api/health                    - Health check');
  console.log('  GET    /api/uploads                   - List uploaded files');
  console.log('  POST   /api/test-upload               - Test image upload');
  console.log('  GET    /products                      - List all products');
  console.log('  GET    /products/active               - List active products');
  console.log('  GET    /products/:id/full             - Get product with MOQs and image');
  console.log('  POST   /products/create-with-moqs     - Create product (with image & MOQs)');
  console.log('  POST   /products                      - Create product (with image)');
  console.log('  PUT    /products/:id/update-with-moqs - Update product & MOQs (with image)');
  console.log('  POST   /products/:id/image            - Upload product image');
  console.log('  PUT    /products/:id/toggle-active    - Toggle product status');
  console.log('  POST   /upload                        - Upload image');
  console.log('  GET    /orders                        - List all orders');
  console.log('  GET    /orders/:id                    - Get order with details');
  console.log('  POST   /orders                        - Create order (with details)');
  console.log('  GET    /users                         - List all users');
  console.log('\n💡 Tip: Use FormData for image upload endpoints');
  console.log('💡 Tip: MOQs should be sent as JSON string in FormData');
});
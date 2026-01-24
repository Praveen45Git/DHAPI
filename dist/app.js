"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// server.ts - UPDATED VERSION with image and MOQs combined endpoint and OrderDetail support
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const db_1 = require("./db");
const repository_1 = require("./repository");
const app = (0, express_1.default)();
// Get the root directory of your project (outside src)
const projectRoot = path_1.default.resolve(__dirname, '..'); // Go up one level from src
const uploadsDir = path_1.default.join(projectRoot, 'uploads', 'products');
console.log('📁 Project root:', projectRoot);
console.log('📁 Uploads directory:', uploadsDir);
// CORS configuration
const corsOptions = {
    origin: ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:8081', 'http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200
};
// Apply CORS middleware
app.use((0, cors_1.default)(corsOptions));
// Handle preflight requests
app.options('*', (0, cors_1.default)(corsOptions));
// Initialize database
async function initializeApp() {
    try {
        await (0, db_1.createPool)();
        await (0, db_1.testConnection)();
        console.log('✅ Connected to database');
    }
    catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
}
// Middleware
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// IMPORTANT: Create uploads directory if it doesn't exist
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
    console.log(`📁 Created uploads directory: ${uploadsDir}`);
}
// Serve static files from the correct location
console.log('📁 Serving static files from:', path_1.default.join(projectRoot, 'uploads'));
app.use('/uploads', express_1.default.static(path_1.default.join(projectRoot, 'uploads')));
// Alternative: Explicit route for serving product images
app.get('/uploads/products/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path_1.default.join(uploadsDir, filename);
    console.log('📁 Looking for image:', filePath);
    // Check if file exists
    if (fs_1.default.existsSync(filePath)) {
        console.log('✅ Image found, sending:', filename);
        res.sendFile(filePath);
    }
    else {
        console.log('❌ Image not found:', filePath);
        res.status(404).json({
            success: false,
            error: 'Image not found',
            path: filePath,
            uploadsDir: uploadsDir
        });
    }
});
// Create repository instances
const productRepository = new repository_1.ProductRepository();
const moqRepository = new repository_1.MOQRepository();
const orderRepository = new repository_1.OrderRepository();
const orderDetailRepository = new repository_1.OrderDetailRepository(); // ADDED: OrderDetail repository
// Enhanced function to register endpoints from repositories with parameter handling
function registerRepositoryEndpoints(repository) {
    const endpoints = repository.constructor.endpoints;
    endpoints.forEach((endpoint) => {
        const handler = repository[endpoint.handlerName].bind(repository);
        app[endpoint.method](endpoint.path, async (req, res) => {
            try {
                console.log(`📝 Handling ${endpoint.method.toUpperCase()} ${endpoint.path}:`, {
                    params: req.params,
                    query: req.query,
                    body: req.body
                });
                let result;
                // Special handling for OrderRepository endpoints
                if (repository instanceof repository_1.OrderRepository) {
                    result = await handleOrderEndpoints(endpoint, req, repository);
                }
                else if (repository instanceof repository_1.OrderDetailRepository) {
                    // Special handling for OrderDetailRepository endpoints
                    result = await handleOrderDetailEndpoints(endpoint, req, repository);
                }
                else {
                    // Default handling for other repositories
                    result = await handleDefaultEndpoints(endpoint, req, repository);
                }
                // Format response
                const statusCode = endpoint.method === 'post' ? 201 : 200;
                // For MOQ endpoints, return proper structure
                if (repository instanceof repository_1.MOQRepository) {
                    res.status(statusCode).json({
                        success: true,
                        data: result
                    });
                }
                else {
                    res.status(statusCode).json({
                        success: true,
                        data: result
                    });
                }
            }
            catch (error) {
                console.error(`❌ Error in ${endpoint.path}:`, error);
                const statusCode = getStatusCodeFromError(error);
                res.status(statusCode).json({
                    success: false,
                    error: error.message || 'Internal server error',
                    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
                });
            }
        });
    });
}
// Helper to determine HTTP status code from error
function getStatusCodeFromError(error) {
    if (error.message.includes('not found') || error.message.includes('does not exist')) {
        return 404;
    }
    else if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        return 409;
    }
    else if (error.message.includes('validation') || error.message.includes('required')) {
        return 400;
    }
    else if (error.message.includes('unauthorized') || error.message.includes('permission')) {
        return 401;
    }
    return 500;
}
// Handle default repository endpoints
async function handleDefaultEndpoints(endpoint, req, repository) {
    const params = Object.values(req.params).map(param => {
        const num = Number(param);
        return isNaN(num) ? param : num;
    });
    // Handle path parameters like /products/:productId/moqs
    if (req.params.productId && endpoint.handlerName === 'findByProductId') {
        const productId = parseInt(req.params.productId);
        return await repository[endpoint.handlerName](productId);
    }
    if (req.params.id) {
        // Methods that need ID parameter
        return await repository[endpoint.handlerName](...params, req.body);
    }
    else if (req.body && Object.keys(req.body).length > 0) {
        // Methods with request body
        return await repository[endpoint.handlerName](req.body);
    }
    else if (params.length > 0) {
        // Methods with URL parameters
        return await repository[endpoint.handlerName](...params);
    }
    else {
        // Methods without parameters
        return await repository[endpoint.handlerName]();
    }
}
// Special handling for OrderRepository endpoints
// In server.ts - handleOrderEndpoints function
async function handleOrderEndpoints(endpoint, req, repository) {
    const handlerName = endpoint.handlerName;
    const params = req.params;
    const query = req.query;
    const body = req.body;
    switch (handlerName) {
        // GET endpoints
        case 'findAll':
            return await repository.findAll();
        case 'getRecentOrders':
            const limit = query.limit ? parseInt(query.limit) : 10;
            return await repository.getRecentOrders(limit);
        case 'findById':
            const id = parseInt(params.id);
            if (isNaN(id))
                throw new Error('Invalid order ID');
            return await repository.findById(id);
        case 'findByCustomerId':
            const customerId = parseInt(params.customerId);
            if (isNaN(customerId))
                throw new Error('Invalid customer ID');
            return await repository.findByCustomerId(customerId);
        case 'findByStatus':
            if (!params.status)
                throw new Error('Status parameter is required');
            return await repository.findByStatus(params.status);
        case 'findByTransactionId':
            if (!params.transactionId)
                throw new Error('Transaction ID is required');
            return await repository.findByTransactionId(params.transactionId);
        case 'getOrderSummary':
            const summaryCustomerId = parseInt(params.customerId);
            if (isNaN(summaryCustomerId))
                throw new Error('Invalid customer ID');
            return await repository.getOrderSummary(summaryCustomerId);
        // POST endpoints
        case 'create':
            if (!body || Object.keys(body).length === 0)
                throw new Error('Order data is required');
            return await repository.create(body);
        case 'createWithDetails': // ADD THIS CASE
            if (!body || Object.keys(body).length === 0)
                throw new Error('Order data is required');
            const { details, ...orderData } = body;
            return await repository.createWithDetails(orderData, details || []);
        case 'createMultiple':
            if (!Array.isArray(body))
                throw new Error('Orders data should be an array');
            return await repository.createMultiple(body);
        // PUT endpoints
        case 'update':
            const updateId = parseInt(params.id);
            if (isNaN(updateId))
                throw new Error('Invalid order ID');
            if (!body || Object.keys(body).length === 0)
                throw new Error('Update data is required');
            return await repository.update(updateId, body);
        case 'updateStatus':
            const statusId = parseInt(params.id);
            if (isNaN(statusId))
                throw new Error('Invalid order ID');
            if (!body.status)
                throw new Error('Status is required');
            return await repository.updateStatus(statusId, body.status);
        case 'updateTransactionId':
            const transId = parseInt(params.id);
            if (isNaN(transId))
                throw new Error('Invalid order ID');
            if (!body.transactionId)
                throw new Error('Transaction ID is required');
            return await repository.updateTransactionId(transId, body.transactionId);
        case 'cancel':
            const cancelId = parseInt(params.id);
            if (isNaN(cancelId))
                throw new Error('Invalid order ID');
            const cancelValue = body.cancel !== undefined ? body.cancel : 1;
            return await repository.cancel(cancelId, cancelValue);
        case 'bulkUpdateStatus':
            if (!Array.isArray(body.orderIds) || body.orderIds.length === 0)
                throw new Error('Order IDs array is required');
            if (!body.status)
                throw new Error('Status is required');
            return await repository.bulkUpdateStatus(body.orderIds, body.status);
        case 'bulkCancel':
            if (!Array.isArray(body.orderIds) || body.orderIds.length === 0)
                throw new Error('Order IDs array is required');
            const bulkCancelValue = body.cancel !== undefined ? body.cancel : 1;
            return await repository.bulkCancel(body.orderIds, bulkCancelValue);
        // DELETE endpoints
        case 'delete':
            const deleteId = parseInt(params.id);
            if (isNaN(deleteId))
                throw new Error('Invalid order ID');
            return await repository.delete(deleteId);
        default:
            throw new Error(`Unknown handler: ${handlerName}`);
    }
}
// Special handling for OrderDetailRepository endpoints
async function handleOrderDetailEndpoints(endpoint, req, repository) {
    const handlerName = endpoint.handlerName;
    const params = req.params;
    const query = req.query;
    const body = req.body;
    switch (handlerName) {
        // GET endpoints
        case 'findByOrderId':
            const orderId = parseInt(params.orderId);
            if (isNaN(orderId))
                throw new Error('Invalid order ID');
            return await repository.findByOrderId(orderId);
        case 'findById':
            const id = parseInt(params.id);
            if (isNaN(id))
                throw new Error('Invalid order detail ID');
            return await repository.findById(id);
        case 'findByItemId':
            const itemId = parseInt(params.itemId);
            if (isNaN(itemId))
                throw new Error('Invalid item ID');
            return await repository.findByItemId(itemId);
        case 'getOrderWithDetails':
            const orderWithDetailsId = parseInt(params.orderId);
            if (isNaN(orderWithDetailsId))
                throw new Error('Invalid order ID');
            return await repository.getOrderWithDetails(orderWithDetailsId);
        // POST endpoints
        case 'create':
            if (!body || Object.keys(body).length === 0)
                throw new Error('Order detail data is required');
            return await repository.create(body);
        case 'createMultiple':
            if (!Array.isArray(body))
                throw new Error('Order details data should be an array');
            return await repository.createMultiple(body);
        // PUT endpoints
        case 'update':
            const updateId = parseInt(params.id);
            if (isNaN(updateId))
                throw new Error('Invalid order detail ID');
            if (!body || Object.keys(body).length === 0)
                throw new Error('Update data is required');
            return await repository.update(updateId, body);
        // DELETE endpoints
        case 'delete':
            const deleteId = parseInt(params.id);
            if (isNaN(deleteId))
                throw new Error('Invalid order detail ID');
            return await repository.delete(deleteId);
        case 'deleteByOrderId':
            const deleteOrderId = parseInt(params.orderId);
            if (isNaN(deleteOrderId))
                throw new Error('Invalid order ID');
            return await repository.deleteByOrderId(deleteOrderId);
        default:
            throw new Error(`Unknown handler: ${handlerName}`);
    }
}
// Register all repository endpoints
registerRepositoryEndpoints(productRepository);
registerRepositoryEndpoints(moqRepository);
registerRepositoryEndpoints(orderRepository);
registerRepositoryEndpoints(orderDetailRepository); // ADDED: Register OrderDetail endpoints
// ========== NEW ENDPOINT: Create product with image and MOQs in one request ==========
app.post('/products-with-image-moqs', repository_1.upload.single('image'), async (req, res) => {
    try {
        const productData = req.body;
        const imageFile = req.file;
        console.log('📦 Creating product with image and MOQs:', {
            productData,
            hasImage: !!imageFile,
            imageName: imageFile?.filename
        });
        // Validate required fields
        if (!productData.name || !productData.name.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Product name is required'
            });
        }
        if (!productData.price) {
            return res.status(400).json({
                success: false,
                error: 'Product price is required'
            });
        }
        // Parse numeric fields
        if (productData.price) {
            productData.price = parseFloat(productData.price);
            if (isNaN(productData.price)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid price format'
                });
            }
        }
        // Parse MOQs if provided
        let moqs = [];
        if (productData.moqs) {
            try {
                moqs = JSON.parse(productData.moqs);
                if (!Array.isArray(moqs)) {
                    return res.status(400).json({
                        success: false,
                        error: 'MOQs must be an array'
                    });
                }
                // Validate each MOQ
                for (const moq of moqs) {
                    if (!moq.moq || !moq.rate) {
                        return res.status(400).json({
                            success: false,
                            error: 'Each MOQ must have moq and rate fields'
                        });
                    }
                    const moqValue = parseInt(moq.moq);
                    const rateValue = parseFloat(moq.rate);
                    if (isNaN(moqValue) || moqValue < 0) {
                        return res.status(400).json({
                            success: false,
                            error: 'MOQ quantity must be a non-negative number'
                        });
                    }
                    if (isNaN(rateValue) || rateValue < 0) {
                        return res.status(400).json({
                            success: false,
                            error: 'MOQ rate must be a non-negative number'
                        });
                    }
                }
            }
            catch (error) {
                console.error('Error parsing MOQs:', error);
                return res.status(400).json({
                    success: false,
                    error: 'Invalid MOQs format. Must be valid JSON array'
                });
            }
        }
        // Handle image upload
        let imageUrl = null;
        if (imageFile) {
            imageUrl = imageFile.filename;
            console.log('📸 Image uploaded:', imageFile.filename);
            // Verify the file was saved
            const filePath = path_1.default.join(uploadsDir, imageFile.filename);
            if (!fs_1.default.existsSync(filePath)) {
                console.error('❌ Image file not saved to disk:', filePath);
                return res.status(500).json({
                    success: false,
                    error: 'Image file was not saved'
                });
            }
        }
        // Set default active status
        productData.active = productData.active || 'A';
        // Prepare product data for creation
        const productWithMOQsData = {
            name: productData.name.trim(),
            price: productData.price,
            description: productData.description?.trim() || '',
            image_url: imageUrl,
            active: productData.active,
            moqs: moqs
        };
        console.log('📊 Product data for creation:', productWithMOQsData);
        // Create product with MOQs
        const result = await productRepository.createWithMOQs(productWithMOQsData);
        console.log('✅ Product created successfully:', result);
        // Return full product data with image URL
        const responseData = {
            ...result,
            image_url: imageUrl ? `http://localhost:3000/uploads/products/${imageUrl}` : null
        };
        res.status(201).json({
            success: true,
            message: 'Product created successfully with image and MOQs',
            data: responseData
        });
    }
    catch (error) {
        console.error('❌ Error creating product with image and MOQs:', error);
        // Clean up uploaded image if creation failed
        if (req.file) {
            try {
                const filePath = path_1.default.join(uploadsDir, req.file.filename);
                if (fs_1.default.existsSync(filePath)) {
                    fs_1.default.unlinkSync(filePath);
                    console.log('🗑️ Cleaned up uploaded image due to error:', req.file.filename);
                }
            }
            catch (cleanupError) {
                console.error('Error cleaning up uploaded image:', cleanupError);
            }
        }
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create product',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});
// ========== END NEW ENDPOINT ==========
// Special endpoint for creating product with MOQs (no image)
app.post('/products-with-moqs', async (req, res) => {
    try {
        const productData = req.body;
        // Validate required fields
        if (!productData.name || !productData.price) {
            return res.status(400).json({
                success: false,
                error: 'Product name and price are required'
            });
        }
        // Validate MOQs if provided
        if (productData.moqs) {
            for (const moq of productData.moqs) {
                if (moq.moq === undefined || moq.rate === undefined) {
                    return res.status(400).json({
                        success: false,
                        error: 'Each MOQ must have moq and rate fields'
                    });
                }
            }
        }
        const result = await productRepository.createWithMOQs(productData);
        res.status(201).json({
            success: true,
            message: 'Product created successfully with MOQs',
            data: result
        });
    }
    catch (error) {
        console.error('Error creating product with MOQs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create product with MOQs',
            details: error.message
        });
    }
});
// Create product with image upload (no MOQs)
app.post('/products-with-image', repository_1.upload.single('image'), async (req, res) => {
    try {
        const productData = req.body;
        // Validate required fields
        if (!productData.name) {
            return res.status(400).json({
                success: false,
                error: 'Product name is required'
            });
        }
        if (!productData.price) {
            return res.status(400).json({
                success: false,
                error: 'Product price is required'
            });
        }
        // Parse numeric fields
        if (productData.price) {
            productData.price = parseFloat(productData.price);
            if (isNaN(productData.price)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid price format'
                });
            }
        }
        // Handle image upload - STORE ONLY FILENAME
        if (req.file) {
            productData.image_url = req.file.filename; // Store only filename
            console.log('📸 Image uploaded:', req.file.filename);
        }
        else {
            productData.image_url = null;
        }
        // Set default active status
        productData.active = productData.active || 'A';
        const productId = await productRepository.create(productData);
        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: {
                id: productId,
                name: productData.name,
                price: productData.price,
                image_url: productData.image_url ? `http://localhost:3000/uploads/products/${productData.image_url}` : null
            }
        });
    }
    catch (error) {
        console.error('Error creating product with image:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create product',
            details: error.message
        });
    }
});
// Update product with image upload
app.put('/products/:id/image', repository_1.upload.single('image'), async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        if (isNaN(productId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid product ID'
            });
        }
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No image file uploaded'
            });
        }
        console.log('📸 Updating product image:', req.file.filename);
        // Get current product to delete old image
        const currentProduct = await productRepository.findById(productId);
        if (!currentProduct) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        // Delete old image if exists
        if (currentProduct.image_url) {
            try {
                const filename = currentProduct.image_url.replace('http://localhost:3000/uploads/products/', '');
                const oldImagePath = path_1.default.join(uploadsDir, filename);
                if (fs_1.default.existsSync(oldImagePath)) {
                    fs_1.default.unlinkSync(oldImagePath);
                    console.log('🗑️ Deleted old image:', filename);
                }
            }
            catch (error) {
                console.error('Error deleting old image:', error);
                // Continue anyway, don't fail the upload
            }
        }
        // Upload new image - STORE ONLY FILENAME
        const success = await productRepository.uploadImage(productId, req.file.filename);
        if (success) {
            res.json({
                success: true,
                message: 'Product image updated successfully',
                data: {
                    productId,
                    image_url: `http://localhost:3000/uploads/products/${req.file.filename}`,
                    filename: req.file.filename
                }
            });
        }
        else {
            res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
    }
    catch (error) {
        console.error('Error updating product image:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update product image',
            details: error.message
        });
    }
});
// Direct image upload endpoint (returns full URL)
app.post('/upload', repository_1.upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }
        const filename = req.file.filename;
        console.log('📸 Image uploaded via /upload:', filename);
        // Verify file was actually saved
        const filePath = path_1.default.join(uploadsDir, filename);
        if (!fs_1.default.existsSync(filePath)) {
            console.error('❌ File not saved to disk:', filePath);
            return res.status(500).json({
                success: false,
                error: 'File was not saved to disk'
            });
        }
        res.json({
            success: true,
            message: 'Image uploaded successfully',
            data: {
                filename,
                imageUrl: `http://localhost:3000/uploads/products/${filename}`,
                size: req.file.size,
                mimetype: req.file.mimetype
            }
        });
    }
    catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload image',
            details: error.message
        });
    }
});
// Image upload endpoint
app.post('/upload-image', repository_1.upload.single('image'), repository_1.uploadImageHandler);
// Get all products with MOQs (optimized)
app.get('/products-with-moqs', async (req, res) => {
    try {
        const products = await productRepository.findAllWithMOQs();
        res.json({
            success: true,
            data: products,
            count: products.length
        });
    }
    catch (error) {
        console.error('Error fetching products with MOQs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch products',
            details: error.message
        });
    }
});
// Get active products only (alias for /activeproducts)
app.get('/active-products', async (req, res) => {
    try {
        const products = await productRepository.activeProducts();
        res.json({
            success: true,
            data: products,
            count: products.length
        });
    }
    catch (error) {
        console.error('Error fetching active products:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch active products',
            details: error.message
        });
    }
});
// Add special order endpoints for better UX
app.get('/orders/status/:status', async (req, res) => {
    try {
        const status = req.params.status;
        const orders = await orderRepository.findByStatus(status);
        res.json({
            success: true,
            data: orders,
            count: orders.length
        });
    }
    catch (error) {
        console.error('Error fetching orders by status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch orders',
            details: error.message
        });
    }
});
// Get orders by date range with query parameters
app.get('/orders/date-range', async (req, res) => {
    try {
        const { start, end } = req.query;
        if (!start || !end) {
            return res.status(400).json({
                success: false,
                error: 'Start and end dates are required as query parameters'
            });
        }
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({
                success: false,
                error: 'Invalid date format. Use ISO format (YYYY-MM-DD)'
            });
        }
        // Set end date to end of day
        endDate.setHours(23, 59, 59, 999);
        const orders = await orderRepository.getOrdersByDateRange(startDate, endDate);
        res.json({
            success: true,
            data: orders,
            count: orders.length,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
        });
    }
    catch (error) {
        console.error('Error fetching orders by date range:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch orders',
            details: error.message
        });
    }
});
// Test endpoint to check if uploads directory exists
app.get('/check-uploads', (req, res) => {
    const uploadsPath = path_1.default.join(projectRoot, 'uploads', 'products');
    const exists = fs_1.default.existsSync(uploadsPath);
    // List files in uploads directory
    let files = [];
    if (exists) {
        files = fs_1.default.readdirSync(uploadsPath);
    }
    res.json({
        success: true,
        data: {
            projectRoot,
            uploadsPath,
            exists,
            absolutePath: path_1.default.resolve(uploadsPath),
            files: files,
            fileCount: files.length,
            exampleUrl: files.length > 0 ? `http://localhost:3000/uploads/products/${files[0]}` : null
        }
    });
});
// Debug endpoint to test image access
app.get('/test-image/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path_1.default.join(uploadsDir, filename);
    const exists = fs_1.default.existsSync(filePath);
    if (exists) {
        // Send the actual image
        res.sendFile(filePath);
    }
    else {
        res.json({
            success: false,
            data: {
                filename,
                filePath,
                exists,
                url: `http://localhost:3000/uploads/products/${filename}`,
                uploadsDir: uploadsDir
            }
        });
    }
});
// Database health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        // Test database connection
        await (0, db_1.testConnection)();
        // Get counts from each table
        const products = await productRepository.findAll();
        const orders = await orderRepository.findAll();
        const orderDetails = await orderDetailRepository.findByOrderId(1).catch(() => []); // Sample check
        res.json({
            success: true,
            message: 'Server and database are running',
            timestamp: new Date().toISOString(),
            cors: 'Enabled',
            uploadsDir: uploadsDir,
            projectRoot: projectRoot,
            database: {
                connected: true,
                productCount: Array.isArray(products) ? products.length : 0,
                orderCount: Array.isArray(orders) ? orders.length : 0,
                orderDetailCheck: Array.isArray(orderDetails) ? 'OK' : 'Error'
            }
        });
    }
    catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({
            success: false,
            message: 'Server is running but database check failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
// Order statistics endpoint
app.get('/api/orders/stats', async (req, res) => {
    try {
        const allOrders = await orderRepository.findAll();
        const orders = Array.isArray(allOrders) ? allOrders : [];
        const stats = {
            total: orders.length,
            byStatus: {
                pending: orders.filter(o => o.status === 'pending').length,
                processing: orders.filter(o => o.status === 'processing').length,
                shipped: orders.filter(o => o.status === 'shipped').length,
                delivered: orders.filter(o => o.status === 'delivered').length,
                cancelled: orders.filter(o => o.status === 'cancelled' || o.cancel === 1).length
            },
            totalAmount: orders.reduce((sum, order) => sum + (order.Amount || 0), 0),
            averageOrderValue: orders.length > 0 ?
                orders.reduce((sum, order) => sum + (order.Amount || 0), 0) / orders.length : 0
        };
        res.json({
            success: true,
            data: stats
        });
    }
    catch (error) {
        console.error('Error getting order stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get order statistics',
            details: error.message
        });
    }
});
// Fix for product activation endpoint (already exists but ensure it works)
app.put('/products/:id/activate', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const { active } = req.body;
        if (isNaN(productId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid product ID'
            });
        }
        if (!active || (active !== 'A' && active !== 'I')) {
            return res.status(400).json({
                success: false,
                error: 'Active status must be "A" (active) or "I" (inactive)'
            });
        }
        const success = await productRepository.activate(productId, { active });
        if (success) {
            res.json({
                success: true,
                message: `Product ${active === 'A' ? 'activated' : 'deactivated'} successfully`,
                data: { id: productId, active }
            });
        }
        else {
            res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
    }
    catch (error) {
        console.error('Error activating/deactivating product:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update product status',
            details: error.message
        });
    }
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
    });
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
});
// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    // Initialize database
    await initializeApp();
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log('📁 Project structure:');
    console.log(`   Project root: ${projectRoot}`);
    console.log(`   Server file: ${__dirname}`);
    console.log(`   Uploads dir: ${uploadsDir}`);
    console.log('\n📋 Key Endpoints:');
    console.log('GET  /api/health              - Health check');
    console.log('POST /products-with-image-moqs - Create product with image & MOQs ✅');
    console.log('GET  /orders                  - Get all orders');
    console.log('GET  /orders/recent           - Get recent orders');
    console.log('GET  /orders/status/:status   - Get orders by status');
    console.log('GET  /customers/:id/orders    - Get customer orders');
    console.log('POST /orders                  - Create order');
    console.log('PUT  /orders/:id/status       - Update order status');
    console.log('\n📑 Order Detail Management:');
    console.log('GET  /order-details/order/:orderId        - Get order details by order ID');
    console.log('GET  /order-details/:id                   - Get order detail by ID');
    console.log('GET  /order-details/item/:itemId          - Get order details by item ID');
    console.log('GET  /order-details/order/:orderId/summary - Get order details summary');
    console.log('GET  /order-details/item/:itemId/sales    - Get item sales summary');
    console.log('GET  /orders/:orderId/with-details        - Get order with details');
    console.log('POST /order-details                       - Create order detail');
    console.log('POST /order-details/bulk                  - Create multiple order details');
    console.log('PUT  /order-details/:id                   - Update order detail');
    console.log('DELETE /order-details/:id                 - Delete order detail');
    console.log('DELETE /order-details/order/:orderId      - Delete order details by order ID');
    console.log('\n🛒 Order Management:');
    console.log('GET  /api/orders/stats        - Order statistics');
    console.log('GET  /orders/date-range       - Get orders by date range');
    console.log('POST /orders/bulk             - Bulk create orders');
    console.log('PUT  /orders/bulk/status      - Bulk update status');
    console.log('\n📦 Product Management:');
    console.log('GET  /products-with-moqs      - Get all products with MOQs');
    console.log('GET  /active-products         - Get active products');
    console.log('POST /products-with-image     - Create product with image');
    console.log('POST /upload                  - Upload image');
    console.log('PUT  /products/:id/activate   - Activate/deactivate product');
    console.log('\n🖼️ Image Upload:');
    console.log('POST /upload-image            - Upload image (generic)');
    console.log('PUT  /products/:id/image      - Update product image');
    console.log('\n🔧 Debug:');
    console.log('GET  /check-uploads           - Check uploads directory');
    console.log('GET  /test-image/:filename    - Test image access');
});

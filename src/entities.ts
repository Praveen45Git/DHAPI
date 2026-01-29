// entities.ts
export interface User {
  id: number;
  name: string;
  email: string;
  age: number;
  created_at: string;
  password_hash:string;
  is_active: number;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  description: string;
  image_url: string | null;  // Made nullable
  active: string;
  created_at?: string;
  specialprice: number | null; // Made nullable
  image_url2: string | null;
  image_url3: string | null;
  image_url4: string | null;
}

export interface orderfile {
  id: number;
  CustomerCode: string;
  Itemcode: number;
  Qty: number;
  Rate: number;
  Amount: number;
  status: string;
  Created_Date: Date;
  TransactionId: string | null;  
  cancel: number;
  Address: string;
  deliverycharge: number;
  Email: string;
}

export interface orderdetail {
  id: number;  // Added id field
  orderId: number;
  Itemcode: number;
  Qty: number;
  Rate: number;
  Amount: number;
  DeliveryCharge: number;
   product_name?: string;
}

// In api.ts - Add new interfaces for order details with product info

export interface Orderdetail {
  id?: number;
  orderId: number;
  Itemcode: number;
  Qty: number;
  Rate: number;
  Amount: number;
  Created_Date?: Date;
  product_name?: string;  // Added for product name
}

export interface OrderDetailWithProduct extends Orderdetail {
  product_name?: string;
  product_price?: number;
  product_description?: string;
  product_image_url?: string;
}

export interface OrderWithDetails {
  order: orderfile;
  details: Orderdetail[];
  total: number;
}

export interface OrderWithProductDetails {
  order: orderfile;
  details: OrderDetailWithProduct[];
  total: number;
}

export interface MOQ{
  id: number;
  product_id: number;
  moq: number;
  rate: number;
  created_at: string;
}

export interface ProductWithMOQs extends Omit<Product, 'id' | 'created_at'> {
  moqs?: Omit<MOQ, 'id' | 'product_id' | 'created_at'>[];
}

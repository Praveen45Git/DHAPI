// entities.ts
export interface User {
  id: number;
  name: string;
  email: string;
  age: number;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  description: string;
  image_url: string | null;  // Made nullable
  active: string;
  created_at?: string;
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

export interface OrderWithDetails {
  order: orderfile;
  details: orderdetail[];
}
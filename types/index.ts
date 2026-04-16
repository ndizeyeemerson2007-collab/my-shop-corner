export interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  original_price?: number;
  image?: string;
  images?: string | string[];
  badge?: string;
  sold?: number;
  stock?: number;
  category?: string;
  is_trend?: boolean;
  colors?: string;
  sizes?: string;
}

export interface CartItem {
  cart_id: number;
  product_id: number;
  name: string;
  price: number;
  quantity: number;
  color?: string;
  size?: string;
  image?: string;
}

export interface User {
  id: string | number;
  email: string;
  full_name?: string;
  phone?: string;
  address?: string;
  role?: string;
}

export interface AuthSession {
  user: User | null;
  token: string | null;
}

export interface Review {
  id: number;
  product_id: number;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

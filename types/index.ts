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
  seller_id?: string;
  seller_name?: string;
  seller_business_name?: string;
  seller_profile_pic?: string;
  views?: number;
  seller?: {
    id?: string;
    full_name?: string | null;
    business_name?: string | null;
  } | null;
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
  account_status?: string;
  seller_approval_status?: string;
  business_name?: string;
  profile_pic?: string;
  email_confirmed_at?: string | null;
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

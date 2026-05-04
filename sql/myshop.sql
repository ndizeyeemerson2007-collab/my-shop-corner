-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.cart (
  id integer NOT NULL DEFAULT nextval('cart_id_seq'::regclass),
  session_id character varying NOT NULL,
  product_id integer NOT NULL,
  quantity integer DEFAULT 1,
  color character varying,
  size character varying,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cart_pkey PRIMARY KEY (id),
  CONSTRAINT cart_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.favorites (
  id integer NOT NULL DEFAULT nextval('favorites_id_seq'::regclass),
  user_id integer NOT NULL,
  product_id integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT favorites_pkey PRIMARY KEY (id),
  CONSTRAINT favorites_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.order_items (
  id integer NOT NULL DEFAULT nextval('order_items_id_seq'::regclass),
  order_id integer NOT NULL,
  product_id integer NOT NULL,
  quantity integer NOT NULL,
  color character varying,
  size character varying,
  price numeric NOT NULL,
  product_name character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id)
);
CREATE TABLE public.orders (
  id integer NOT NULL DEFAULT nextval('orders_id_seq'::regclass),
  session_id character varying,
  total_amount numeric NOT NULL,
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'paid'::character varying, 'processing'::character varying, 'delivered'::character varying, 'canceled'::character varying]::text[])),
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid,
  delivery_distance_km numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  full_name character varying,
  phone character varying,
  location text,
  CONSTRAINT orders_pkey PRIMARY KEY (id)
);
CREATE TABLE public.products (
  id integer NOT NULL DEFAULT nextval('products_id_seq'::regclass),
  name character varying NOT NULL,
  description text,
  price numeric NOT NULL,
  original_price numeric,
  image character varying,
  category character varying,
  colors text,
  sizes text,
  badge character varying,
  sold integer DEFAULT 0,
  stock integer DEFAULT 100,
  views integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  is_trend boolean DEFAULT false,
  images jsonb,
  seller_id uuid,
  CONSTRAINT products_pkey PRIMARY KEY (id)
);
CREATE TABLE public.reviews (
  id integer NOT NULL DEFAULT nextval('reviews_id_seq'::regclass),
  product_id integer NOT NULL,
  user_name character varying NOT NULL,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reviews_pkey PRIMARY KEY (id),
  CONSTRAINT reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.seller_follows (
  id bigint NOT NULL DEFAULT nextval('seller_follows_id_seq'::regclass),
  user_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT seller_follows_pkey PRIMARY KEY (id),
  CONSTRAINT seller_follows_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT seller_follows_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id)
);
CREATE TABLE public.seller_order_statuses (
  id bigint NOT NULL DEFAULT nextval('seller_order_statuses_id_seq'::regclass),
  order_id bigint NOT NULL,
  seller_id uuid NOT NULL,
  status character varying NOT NULL DEFAULT 'pending'::character varying,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT seller_order_statuses_pkey PRIMARY KEY (id),
  CONSTRAINT seller_order_statuses_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL,
  email character varying NOT NULL UNIQUE,
  full_name character varying,
  phone character varying,
  address text,
  profile_pic character varying DEFAULT 'assets/img/default-avatar.png'::character varying,
  role character varying NOT NULL DEFAULT 'user'::character varying,
  account_status character varying NOT NULL DEFAULT 'active'::character varying,
  seller_approval_status character varying NOT NULL DEFAULT 'approved'::character varying,
  business_name character varying,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabase } from '../../../lib/utils';

// Create a service role client for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  }

  const token = authHeader.substring(7);
  const supabase = getSupabase;
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'admin') {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }) };
  }

  return { ok: true as const, user };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search');
    const trend = searchParams.get('trend');

    let query = supabaseAdmin.from('products').select('*');

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }
    
    if (trend === '1') {
      query = query.eq('is_trend', true);
    }
    
    query = query.limit(limit);

    const { data: products, error } = await query;

    if (error) {
      console.error("Supabase Error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    // Map the products to ensure data types align smoothly if needed
    // The frontend expects properties like images to be parsed, but wait, the database schema sets `images` to JSONB, 
    // which automatically parses in Supabase JS!
    return NextResponse.json({ success: true, products: products || [] });

  } catch (error: any) {
    console.error("Products API exception", error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request);
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const payload = {
      name: (body.name || '').trim(),
      description: (body.description || '').trim() || null,
      price: Number(body.price) || 0,
      stock: Number(body.stock) || 0,
      category: (body.category || '').trim() || null,
      colors: (body.colors || '').trim() || null,
      sizes: (body.sizes || '').trim() || null,
      badge: (body.badge || '').trim() || null,
      sold: Number(body.sold) || 0,
      is_trend: Boolean(body.is_trend),
      image: (body.image || '').trim() || null,
      images: Array.isArray(body.images) ? body.images : [],
      original_price: body.original_price ? Number(body.original_price) : null,
    };

    if (!payload.name || payload.price <= 0) {
      return NextResponse.json({ success: false, message: 'Name and valid price are required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, product: data });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request);
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const id = Number(body.id);
    if (!id) {
      return NextResponse.json({ success: false, message: 'Product id is required' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    const keys = ['name', 'description', 'category', 'colors', 'sizes', 'badge', 'image'];
    for (const key of keys) {
      if (key in body) updates[key] = body[key];
    }
    if ('price' in body) updates.price = Number(body.price);
    if ('stock' in body) updates.stock = Number(body.stock);
    if ('sold' in body) updates.sold = Number(body.sold);
    if ('is_trend' in body) updates.is_trend = Boolean(body.is_trend);
    if ('original_price' in body) updates.original_price = body.original_price ? Number(body.original_price) : null;
    if ('images' in body) updates.images = Array.isArray(body.images) ? body.images : [];

    const { data, error } = await supabaseAdmin
      .from('products')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, product: data });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request);
    if (!adminCheck.ok) return adminCheck.response;

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (!id) {
      return NextResponse.json({ success: false, message: 'Product id is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

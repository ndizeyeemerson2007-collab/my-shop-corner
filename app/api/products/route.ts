import { NextRequest, NextResponse } from 'next/server';
import { forbiddenResponse, getAuthenticatedAccount, hasRole, supabaseAdmin } from '../../../lib/server-auth';

type SellerRow = {
  id: string;
  full_name?: string | null;
  business_name?: string | null;
};

type SellerSummary = {
  full_name?: string | null;
  business_name?: string | null;
};

type ProductRow = Record<string, unknown> & {
  seller_id?: string | null;
  seller?: SellerSummary | null;
};

const ARCHIVED_PRODUCT_BADGE = '__archived__';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Internal Server Error';
}

function mapProduct(product: ProductRow) {
  return {
    ...product,
    seller_name: product.seller?.full_name || null,
    seller_business_name: product.seller?.business_name || null,
  };
}

async function attachSellerSummaries(products: ProductRow[]) {
  const sellerIds = Array.from(
    new Set(
      products
        .map((product) => String(product.seller_id || '').trim())
        .filter(Boolean),
    ),
  );

  if (sellerIds.length === 0) {
    return products.map((product) => mapProduct({ ...product, seller: null }));
  }

  const { data: sellers, error } = await supabaseAdmin
    .from('users')
    .select('id, full_name, business_name')
    .in('id', sellerIds);

  if (error) {
    throw new Error(error.message);
  }

  const sellerMap = new Map<string, SellerRow>(
    (sellers || []).map((seller) => [seller.id, seller]),
  );

  return products.map((product) =>
    mapProduct({
      ...product,
      seller: product.seller_id ? sellerMap.get(String(product.seller_id)) || null : null,
    }),
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const search = searchParams.get('search');
    const trend = searchParams.get('trend');
    const category = searchParams.get('category');
    const sellerScope = searchParams.get('seller_scope');
    let scopedSellerId = searchParams.get('seller_id');

    if (sellerScope === 'mine') {
      const auth = await getAuthenticatedAccount(request);
      if (!auth.ok) return auth.response;
      if (!hasRole(auth.profile, ['seller'])) {
        return forbiddenResponse();
      }
      scopedSellerId = auth.profile.id;
    }

    let query = supabaseAdmin
      .from('products')
      .select('*');

    query = query.or(`badge.is.null,badge.neq.${ARCHIVED_PRODUCT_BADGE}`);

    if (search) query = query.ilike('name', `%${search}%`);
    if (category) query = query.eq('category', category);
    if (trend === '1') query = query.eq('is_trend', true);
    if (scopedSellerId) query = query.eq('seller_id', scopedSellerId);

    const { data: products, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Supabase Error:', error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const mappedProducts = await attachSellerSummaries((products || []) as ProductRow[]);
    return NextResponse.json({ success: true, products: mappedProducts });
  } catch (error: unknown) {
    console.error('Products API exception', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(request);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.profile, ['seller'])) {
      return forbiddenResponse();
    }

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
      sold: 0,
      is_trend: false,
      image: (body.image || '').trim() || null,
      images: Array.isArray(body.images) ? body.images : [],
      original_price: body.original_price ? Number(body.original_price) : null,
      seller_id: auth.profile.id,
    };

    if (!payload.name || payload.price <= 0) {
      return NextResponse.json({ success: false, message: 'Name and valid price are required' }, { status: 400 });
    }

    if (payload.badge === ARCHIVED_PRODUCT_BADGE) {
      return NextResponse.json({ success: false, message: 'This badge value is reserved.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const [product] = await attachSellerSummaries([data as ProductRow]);
    return NextResponse.json({ success: true, product });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(request);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.profile, ['seller'])) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const id = Number(body.id);
    if (!id) {
      return NextResponse.json({ success: false, message: 'Product id is required' }, { status: 400 });
    }

    const updates: Record<string, string | number | boolean | null | string[]> = {};
    const keys = ['name', 'description', 'category', 'colors', 'sizes', 'badge', 'image'];

    for (const key of keys) {
      if (key in body) updates[key] = body[key];
    }

    if ('price' in body) updates.price = Number(body.price);
    if ('stock' in body) updates.stock = Number(body.stock);
    if ('original_price' in body) updates.original_price = body.original_price ? Number(body.original_price) : null;
    if ('images' in body) updates.images = Array.isArray(body.images) ? body.images : [];

    if (updates.badge === ARCHIVED_PRODUCT_BADGE) {
      return NextResponse.json({ success: false, message: 'This badge value is reserved.' }, { status: 400 });
    }

    const query = supabaseAdmin
      .from('products')
      .update(updates)
      .eq('id', id)
      .eq('seller_id', auth.profile.id);

    const { data, error } = await query
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const [product] = await attachSellerSummaries([data as ProductRow]);
    return NextResponse.json({ success: true, product });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(request);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.profile, ['seller'])) {
      return forbiddenResponse();
    }

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (!id) {
      return NextResponse.json({ success: false, message: 'Product id is required' }, { status: 400 });
    }

    const query = supabaseAdmin
      .from('products')
      .delete()
      .eq('id', id)
      .eq('seller_id', auth.profile.id);

    const { error } = await query;

    if (error) {
      const isForeignKeyError =
        error.code === '23503' ||
        error.message.toLowerCase().includes('foreign key constraint');

      if (!isForeignKeyError) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      }

      const { error: archiveError } = await supabaseAdmin
        .from('products')
        .update({
          badge: ARCHIVED_PRODUCT_BADGE,
          is_trend: false,
          stock: 0,
        })
        .eq('id', id)
        .eq('seller_id', auth.profile.id);

      if (archiveError) {
        return NextResponse.json({ success: false, message: archiveError.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'Product was removed from your dashboard and storefront, but kept in past orders.',
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}

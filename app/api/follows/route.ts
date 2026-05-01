import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAccount, supabaseAdmin } from '../../../lib/server-auth';

type FollowRow = {
  seller_id: string;
};

type SellerRow = {
  id: string;
  full_name?: string | null;
  business_name?: string | null;
};

type ProductRow = {
  seller_id?: string | null;
  image?: string | null;
  created_at?: string | null;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Server error';
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const requestedSellerIds = String(searchParams.get('seller_ids') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const { data: followRows, error: followsError } = await supabaseAdmin
      .from('seller_follows')
      .select('seller_id')
      .eq('user_id', auth.profile.id);

    if (followsError) {
      return NextResponse.json({ success: false, message: followsError.message }, { status: 500 });
    }

    const followedSellerIds = ((followRows || []) as FollowRow[]).map((row) => row.seller_id);
    const filteredSellerIds = requestedSellerIds.length > 0
      ? followedSellerIds.filter((sellerId) => requestedSellerIds.includes(sellerId))
      : followedSellerIds;

    if (filteredSellerIds.length === 0) {
      return NextResponse.json({ success: true, followed_seller_ids: [], followed_sellers: [] });
    }

    const [{ data: sellers, error: sellersError }, { data: products, error: productsError }] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('id, full_name, business_name')
        .in('id', filteredSellerIds),
      supabaseAdmin
        .from('products')
        .select('seller_id, image, created_at')
        .in('seller_id', filteredSellerIds)
        .or('badge.is.null,badge.neq.__archived__')
        .order('created_at', { ascending: false }),
    ]);

    if (sellersError) {
      return NextResponse.json({ success: false, message: sellersError.message }, { status: 500 });
    }

    if (productsError) {
      return NextResponse.json({ success: false, message: productsError.message }, { status: 500 });
    }

    const latestImageBySeller = ((products || []) as ProductRow[]).reduce<Record<string, string | null>>((acc, product) => {
      const sellerId = String(product.seller_id || '');
      if (!sellerId || acc[sellerId]) return acc;
      acc[sellerId] = product.image || null;
      return acc;
    }, {});

    const followedSellers = ((sellers || []) as SellerRow[]).map((seller) => ({
      id: seller.id,
      full_name: seller.full_name || null,
      business_name: seller.business_name || null,
      image: latestImageBySeller[seller.id] || null,
    }));

    return NextResponse.json({
      success: true,
      followed_seller_ids: filteredSellerIds,
      followed_sellers: followedSellers,
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const sellerId = String(body?.seller_id || '').trim();

    if (!sellerId) {
      return NextResponse.json({ success: false, message: 'Seller id is required.' }, { status: 400 });
    }

    const { data: seller, error: sellerError } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', sellerId)
      .maybeSingle();

    if (sellerError) {
      return NextResponse.json({ success: false, message: sellerError.message }, { status: 500 });
    }

    if (!seller || String(seller.role || '').toLowerCase() !== 'seller') {
      return NextResponse.json({ success: false, message: 'Seller not found.' }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from('seller_follows')
      .upsert([{ user_id: auth.profile.id, seller_id: sellerId }], { onConflict: 'user_id,seller_id' });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const sellerId = String(body?.seller_id || '').trim();

    if (!sellerId) {
      return NextResponse.json({ success: false, message: 'Seller id is required.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('seller_follows')
      .delete()
      .eq('user_id', auth.profile.id)
      .eq('seller_id', sellerId);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}

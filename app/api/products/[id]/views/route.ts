import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/server-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const productId = parseInt(id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });
    }

    // Increment views count
    const { error } = await supabaseAdmin
      .from('products')
      .update({ views: supabaseAdmin.rpc('increment_views', { product_id: productId }) })
      .eq('id', productId);

    if (error) {
      console.error('View increment error:', error);
      // Fall back to manual increment if RPC doesn't exist
      const { data: product, error: fetchError } = await supabaseAdmin
        .from('products')
        .select('views')
        .eq('id', productId)
        .single();

      if (fetchError) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }

      const { error: updateError } = await supabaseAdmin
        .from('products')
        .update({ views: (product?.views || 0) + 1 })
        .eq('id', productId);

      if (updateError) {
        return NextResponse.json({ error: 'Failed to increment views' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('View increment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

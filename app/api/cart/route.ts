import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create a service role client for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Helper to get session id
function getSessionId(req: NextRequest) {
  return req.headers.get('X-Session-Id') || 'anonymous_session';
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = getSessionId(request);

    // Fetch cart items belonging to this session
    // We join the products table to get the product details
    const { data: cartData, error } = await supabaseAdmin
      .from('cart')
      .select('*, products(name, price, image)')
      .eq('session_id', sessionId);

    if (error) {
      console.error("Supabase Cart Error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const items = cartData || [];
    let cartTotal = 0;
    
    // Map them cleanly into the expected interface
    const cartItems = items.map((item: any) => {
      const price = Number(item.products?.price) || 0;
      cartTotal += price * (item.quantity || 1);
      
      return {
        cart_id: item.id,
        product_id: item.product_id,
        name: item.products?.name,
        price: price,
        quantity: item.quantity,
        color: item.color,
        size: item.size,
        image: item.products?.image
      };
    });

    const cartCount = cartItems.reduce((acc, curr) => acc + (curr.quantity || 1), 0);

    return NextResponse.json({
      success: true,
      cart_items: cartItems,
      cart_count: cartCount,
      cart_total: cartTotal.toFixed(2)
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionId = getSessionId(request);
    const body = await request.json();
    const { action, cart_id, product_id, quantity, color, size } = body;

    if (action === 'add') {
      // Check if product already in cart
      const { data: existing } = await supabaseAdmin
        .from('cart')
        .select('*')
        .eq('session_id', sessionId)
        .eq('product_id', product_id)
        .eq('color', color || null)
        .eq('size', size || null)
        .single();

      if (existing) {
        // Update quantity
        const { error } = await supabaseAdmin
          .from('cart')
          .update({ quantity: (existing.quantity || 1) + (quantity || 1) })
          .eq('id', existing.id);
          
        if (error) throw error;
      } else {
        // Insert new cart item
        const { error } = await supabaseAdmin
          .from('cart')
          .insert({
            session_id: sessionId,
            product_id: product_id,
            quantity: quantity || 1,
            color: color || null,
            size: size || null
          });
          
        if (error) throw error;
      }
    } else if (action === 'remove') {
      // Remove from cart
      if (cart_id) {
        const { error } = await supabaseAdmin
          .from('cart')
          .delete()
          .eq('id', cart_id)
          .eq('session_id', sessionId); // verify ownership loosely via session
          
        if (error) throw error;
      }
    }

    // After mutation, fetch the new count to return
    const { data: currentCart } = await supabaseAdmin
      .from('cart')
      .select('quantity')
      .eq('session_id', sessionId);
      
    const newCount = currentCart?.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0) || 0;

    return NextResponse.json({ success: true, cart_count: newCount });

  } catch (error: any) {
    console.error("Cart POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

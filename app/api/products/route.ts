import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search');
    const trend = searchParams.get('trend');

    let query = supabase.from('products').select('*');

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

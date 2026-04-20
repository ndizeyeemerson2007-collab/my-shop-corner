import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create a service role client for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, subject, message } = body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json({
        success: false,
        message: 'All fields are required'
      }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({
        success: false,
        message: 'Please provide a valid email address'
      }, { status: 400 });
    }

    // For now, we'll just log the contact message
    // In a real application, you'd send an email or store in database
    console.log('New contact message:', {
      name,
      email,
      subject,
      message,
      timestamp: new Date().toISOString()
    });

    // You could store in a contact_messages table if you create one:
    /*
    const { error } = await supabaseAdmin
      .from('contact_messages')
      .insert({
        name,
        email,
        subject,
        message,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error saving contact message:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to send message'
      }, { status: 500 });
    }
    */

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));

    return NextResponse.json({
      success: true,
      message: 'Message sent successfully! We\'ll get back to you soon.'
    });

  } catch (error: any) {
    console.error('Contact API error:', error);
    return NextResponse.json({
      success: false,
      message: 'Something went wrong. Please try again.'
    }, { status: 500 });
  }
}
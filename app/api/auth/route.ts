import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '../../../lib/utils';
import { createClient } from '@supabase/supabase-js';

// Create a service role client for admin operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable');
}

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

function isExistingAuthUserError(message?: string | null) {
  if (!message) return false;
  const msg = message.toLowerCase();
  return msg.includes('user already exists') || msg.includes('already been registered');
}

function isEmailDeliveryError(message?: string | null) {
  if (!message) return false;
  const msg = message.toLowerCase();
  return msg.includes('error sending confirmation email') || msg.includes('error sending email');
}

function getEmailRedirectUrl(req: NextRequest) {
  const baseUrl = siteUrl?.trim() || req.nextUrl.origin;
  return new URL('/auth/callback', baseUrl).toString();
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: true, isLoggedIn: false });
    }

    const token = authHeader.substring(7);
    const supabase = getSupabase;
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return NextResponse.json({ success: true, isLoggedIn: false });
    }

    // Get user profile from custom table - CRITICAL: Check if user still exists in database
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    // If user profile doesn't exist in database, they were deleted - not logged in
    if (profileError || !profile) {
      console.warn(`User ${user.id} has no profile in database (deleted?)`);
      return NextResponse.json({ success: true, isLoggedIn: false });
    }

    if (String(profile.account_status || 'active').toLowerCase() === 'deactivated') {
      return NextResponse.json({ success: true, isLoggedIn: false });
    }

    return NextResponse.json({ 
      success: true, 
      isLoggedIn: true, 
      user: { ...user, ...profile } 
    });
  } catch (err) {
    console.error('Auth check error:', err);
    return NextResponse.json({ success: true, isLoggedIn: false });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const mode = body.mode || 'login';

  if (mode === 'logout') {
    return NextResponse.json({ success: true });
  }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  const fullName = (body.full_name || '').trim();
  const phone = (body.phone || '').trim();
  const address = (body.address || '').trim();
  const businessName = (body.business_name || '').trim();
  const accountType = String(body.account_type || 'user').toLowerCase() === 'seller' ? 'seller' : 'user';

  // Validate inputs
  if (!email || !password) {
    return NextResponse.json(
      { success: false, message: 'Email and password are required' },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { success: false, message: 'Password must be at least 6 characters' },
      { status: 400 }
    );
  }

  const supabase = getSupabase;

  const ensureUserProfile = async (
    authUserId: string,
    fallbackEmail: string,
    profileInput: { full_name?: string; phone?: string; address?: string; role?: string; business_name?: string }
  ) => {
    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', authUserId)
      .maybeSingle();

    if (existingProfileError) {
      console.error('Profile lookup error:', existingProfileError);
      return { profile: null, error: existingProfileError };
    }

    if (existingProfile) {
      return { profile: existingProfile, error: null };
    }

    const { data: createdProfile, error: createProfileError } = await supabaseAdmin
      .from('users')
      .insert([{
        id: authUserId,
        email: fallbackEmail,
        full_name: profileInput.full_name || '',
        phone: profileInput.phone || '',
        address: profileInput.address || '',
        role: profileInput.role || 'user',
        account_status: 'active',
        seller_approval_status: profileInput.role === 'seller' ? 'pending' : 'approved',
        business_name: profileInput.business_name || '',
      }])
      .select('*')
      .single();

    if (createProfileError) {
      console.error('Profile create error:', createProfileError);
      return { profile: null, error: createProfileError };
    }

    return { profile: createdProfile, error: null };
  };

  try {
    if (mode === 'signup') {
      // Validate signup fields
      if (!fullName || !phone || !address || (accountType === 'seller' && !businessName)) {
        return NextResponse.json(
          { success: false, message: accountType === 'seller' ? 'Please fill all seller fields' : 'Please fill all fields' },
          { status: 400 }
        );
      }

      if (fullName.length > 100) {
        return NextResponse.json(
          { success: false, message: 'Full name must be 100 characters or less' },
          { status: 400 }
        );
      }

      if (phone.length > 20) {
        return NextResponse.json(
          { success: false, message: 'Phone must be 20 characters or less' },
          { status: 400 }
        );
      }

      if (businessName.length > 120) {
        return NextResponse.json(
          { success: false, message: 'Business name must be 120 characters or less' },
          { status: 400 }
        );
      }

      const emailRedirectTo = getEmailRedirectUrl(req);

      // Sign up with Supabase Auth and trigger email confirmation.
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: {
            full_name: fullName,
            phone,
            address,
            business_name: businessName,
            account_type: accountType,
          },
        },
      });

      if (signUpError || !authData.user) {
        console.error('Signup error:', signUpError);
        if (isExistingAuthUserError(signUpError?.message)) {
          return NextResponse.json(
            { success: false, message: 'Email already registered. Please sign in instead.' },
            { status: 409 }
          );
        }
        if (isEmailDeliveryError(signUpError?.message)) {
          return NextResponse.json(
            {
              success: false,
              message: 'Verification email could not be sent. Check your Supabase SMTP settings and Gmail app password, then try again.',
            },
            { status: 502 }
          );
        }
        return NextResponse.json(
          { success: false, message: signUpError?.message || 'Failed to create account' },
          { status: 500 }
        );
      }

      if (!authData.user.identities?.length) {
        return NextResponse.json(
          { success: false, message: 'Email already registered. Please sign in instead.' },
          { status: 409 }
        );
      }

      // Create user profile in custom table (or reuse if already created)
      const { profile: newUser, error: profileError } = await ensureUserProfile(
        authData.user.id,
        email,
        { full_name: fullName, phone, address, role: accountType, business_name: businessName }
      );

      if (profileError) {
        console.error('Profile creation error:', profileError);
        // Try to delete the auth user if profile creation fails
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json(
          { success: false, message: 'Failed to create user profile' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        user: newUser,
        session: null,
        requiresEmailVerification: true,
        message: 'Check your email to verify your account',
      });
    }

    // LOGIN MODE
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData.user) {
      console.error('Login error:', signInError);
      const loginMessage = signInError?.message?.toLowerCase().includes('email not confirmed')
        ? 'Please verify your email before signing in'
        : 'Invalid email or password';
      return NextResponse.json(
        { success: false, message: loginMessage },
        { status: 401 }
      );
    }

    // Get user profile from custom table.
    const { data: userProfile, error: userProfileError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', signInData.user.id)
      .maybeSingle();

    if (userProfileError || !userProfile) {
      console.warn(`Login blocked: auth user ${signInData.user.id} has no profile row in users table`);
      return NextResponse.json(
        { success: false, message: 'Account profile not found. Please contact support or sign up again.' },
        { status: 403 }
      );
    }

    const accountStatus = String(userProfile.account_status || 'active').toLowerCase();
    const sellerApprovalStatus = String(userProfile.seller_approval_status || (userProfile.role === 'seller' ? 'pending' : 'approved')).toLowerCase();

    if (accountStatus === 'suspended') {
      return NextResponse.json(
        { success: false, message: 'This account is suspended. Please contact the admin team.' },
        { status: 403 }
      );
    }

    if (accountStatus === 'deactivated') {
      return NextResponse.json(
        { success: false, message: 'This account has been deactivated. Please contact the admin team.' },
        { status: 403 }
      );
    }

    if (userProfile.role === 'seller' && sellerApprovalStatus !== 'approved') {
      return NextResponse.json(
        {
          success: false,
          message: sellerApprovalStatus === 'rejected'
            ? 'Your seller request was rejected. Please contact the admin team.'
            : 'Your seller account is waiting for admin approval before you can access the seller dashboard.',
        },
        { status: 403 }
      );
    }

    const redirect =
      userProfile?.role === 'admin'
        ? '/admin'
        : userProfile?.role === 'seller'
        ? '/seller'
        : '/dashboard';

    return NextResponse.json({
      success: true,
      session: signInData.session,
      user: { ...signInData.user, ...userProfile },
      redirect,
    });
  } catch (err) {
    console.error('Auth error:', err);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}

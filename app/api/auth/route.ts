import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '../../../lib/utils';
import { createClient } from '@supabase/supabase-js';

// Create a service role client for admin operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    profileInput: { full_name?: string; phone?: string; address?: string; role?: string }
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
      if (!fullName || !phone || !address) {
        return NextResponse.json(
          { success: false, message: 'Please fill all fields' },
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

      // Sign up with Supabase Auth using admin API
      const { data: authData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email
      });

      if (signUpError || !authData.user) {
        console.error('Signup error:', signUpError);
        if (isExistingAuthUserError(signUpError?.message)) {
          // Account exists in Supabase Auth. Validate credentials directly with Supabase,
          // then recover missing profile row in users table if needed.
          const { data: existingSignInData, error: existingSignInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (existingSignInError || !existingSignInData.user || !existingSignInData.session) {
            return NextResponse.json(
              { success: false, message: 'Email already registered. Use the correct password to continue.' },
              { status: 409 }
            );
          }

          const { profile, error: recoveredProfileError } = await ensureUserProfile(
            existingSignInData.user.id,
            existingSignInData.user.email || email,
            { full_name: fullName, phone, address, role: 'user' }
          );

          if (recoveredProfileError || !profile) {
            return NextResponse.json(
              { success: false, message: 'Account exists but profile recovery failed.' },
              { status: 500 }
            );
          }

          const redirect = profile.role === 'admin' ? '/admin' : '/profile';
          return NextResponse.json({
            success: true,
            session: existingSignInData.session,
            user: { ...existingSignInData.user, ...profile },
            redirect,
          });
        }
        return NextResponse.json(
          { success: false, message: signUpError?.message || 'Failed to create account' },
          { status: 500 }
        );
      }

      // Create user profile in custom table (or reuse if already created)
      const { profile: newUser, error: profileError } = await ensureUserProfile(
        authData.user.id,
        email,
        { full_name: fullName, phone, address, role: 'user' }
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

      // Sign in the user to get a session after successful creation.
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !signInData.session) {
        console.error('Auto sign-in error:', signInError);
        return NextResponse.json({
          success: true,
          user: newUser,
          redirect: '/profile',
          session: null,
        });
      }

      return NextResponse.json({
        success: true,
        session: signInData.session,
        user: newUser,
        redirect: '/profile',
      });
    }

    // LOGIN MODE
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData.user) {
      console.error('Login error:', signInError);
      return NextResponse.json(
        { success: false, message: 'Invalid email or password' },
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

    const redirect = userProfile?.role === 'admin' ? '/admin' : '/profile';

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

import { NextRequest, NextResponse } from 'next/server';
import { forbiddenResponse, getAuthenticatedAccount, hasRole, supabaseAdmin } from '../../../lib/server-auth';
import crypto from 'crypto';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Internal Server Error';
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(request);
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ success: false, message: 'Please select at least one image.' }, { status: 400 });
    }

    const storedPaths: string[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ success: false, message: 'Only image files are allowed.' }, { status: 400 });
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ success: false, message: `Image "${file.name}" is larger than 10MB.` }, { status: 400 });
      }

      const extension = file.name ? file.name.split('.').pop()?.toLowerCase() || 'jpg' : 'jpg';
      const finalFileName = `${crypto.randomUUID()}.${extension}`;
      const fileBuffer = await file.arrayBuffer();
      const uploadPath = `profiles/${auth.profile.id}/${finalFileName}`;

      const { data, error } = await supabaseAdmin.storage
        .from('products')
        .upload(uploadPath, fileBuffer, {
          contentType: file.type,
          upsert: true,
        });

      if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from('products')
        .getPublicUrl(data.path);

      storedPaths.push(publicUrlData.publicUrl);
    }

    return NextResponse.json({ success: true, paths: storedPaths });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}

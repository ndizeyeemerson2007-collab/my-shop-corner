import { mkdir, access, writeFile } from 'fs/promises';
import path from 'path';
import { constants as fsConstants } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabase } from '../../../lib/utils';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const uploadDirectory = path.join(process.cwd(), 'public', 'upload');

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

function sanitizeFileName(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  const baseName = path.basename(fileName, extension);
  const normalizedBaseName = baseName
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image';

  const normalizedExtension = extension.replace(/[^a-z0-9.]/g, '') || '.jpg';
  return `${normalizedBaseName}${normalizedExtension}`;
}

async function resolveAvailableFileName(initialFileName: string) {
  let fileName = initialFileName;
  let counter = 1;

  while (true) {
    try {
      await access(path.join(uploadDirectory, fileName), fsConstants.F_OK);
      const extension = path.extname(initialFileName);
      const baseName = path.basename(initialFileName, extension);
      fileName = `${baseName}-${counter}${extension}`;
      counter += 1;
    } catch {
      return fileName;
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request);
    if (!adminCheck.ok) return adminCheck.response;

    const formData = await request.formData();
    const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ success: false, message: 'Please select at least one image.' }, { status: 400 });
    }

    await mkdir(uploadDirectory, { recursive: true });

    const storedPaths: string[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ success: false, message: 'Only image files are allowed.' }, { status: 400 });
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ success: false, message: `Image "${file.name}" is larger than 10MB.` }, { status: 400 });
      }

      const sanitizedName = sanitizeFileName(file.name || 'image.jpg');
      const finalFileName = await resolveAvailableFileName(sanitizedName);
      const filePath = path.join(uploadDirectory, finalFileName);
      const fileBuffer = Buffer.from(await file.arrayBuffer());

      await writeFile(filePath, fileBuffer);
      storedPaths.push(`upload/${finalFileName}`);
    }

    return NextResponse.json({ success: true, paths: storedPaths });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

import { mkdir, access, writeFile } from 'fs/promises';
import path from 'path';
import { constants as fsConstants } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { forbiddenResponse, getAuthenticatedAccount, hasRole } from '../../../lib/server-auth';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const uploadDirectory = path.join(process.cwd(), 'public', 'upload');

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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Internal Server Error';
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAccount(request);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.profile, ['seller'])) {
      return forbiddenResponse();
    }

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
    return NextResponse.json({ success: false, message: getErrorMessage(error) }, { status: 500 });
  }
}

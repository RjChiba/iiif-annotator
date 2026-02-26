import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { uploadDir } from '@/lib/server/project-store';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const projectId = form.get('projectId');
  const file = form.get('file');

  if (typeof projectId !== 'string' || !(file instanceof File)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const dir = uploadDir(projectId);
  await fs.mkdir(dir, { recursive: true });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(dir, safeName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, bytes);

  return NextResponse.json({ url: `/uploads/${projectId}/${safeName}`, filename: safeName });
}

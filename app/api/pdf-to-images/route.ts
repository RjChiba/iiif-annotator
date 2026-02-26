import { promises as fs } from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { uploadDir } from '@/lib/server/project-store';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const projectId = form.get('projectId');
  const file = form.get('file');

  if (typeof projectId !== 'string' || !(file instanceof File)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { PDFiumLibrary } = await import('@hyzyla/pdfium');
  const sharp = (await import('sharp')).default;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const library = await PDFiumLibrary.init();
  const document = await library.loadDocument(buffer);

  const baseName = file.name.replace(/\.pdf$/i, '');
  const pageCount = document.getPageCount();
  const padLength = Math.max(String(pageCount).length, 3);

  const dir = uploadDir(projectId);
  await fs.mkdir(dir, { recursive: true });

  const files: { url: string; filename: string }[] = [];

  for (let i = 0; i < pageCount; i++) {
    const page = document.getPage(i);
    const bitmap = await page.render({ scale: 2 });

    // pdfium outputs BGRA; swap B and R channels before passing to sharp (which expects RGBA)
    const bgra = Buffer.from(bitmap.data);
    for (let j = 0; j < bgra.length; j += 4) {
      const b = bgra[j];
      bgra[j] = bgra[j + 2];
      bgra[j + 2] = b;
    }

    const pngBuffer = await sharp(bgra, {
      raw: { width: bitmap.width, height: bitmap.height, channels: 4 },
    })
      .png()
      .toBuffer();

    const pageNum = i + 1;
    const pageStr = String(pageNum).padStart(padLength, '0');
    const filename = `${baseName}-page-${pageStr}.png`.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_');
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, pngBuffer);
    files.push({ url: `/uploads/${projectId}/${encodeURIComponent(filename)}`, filename });
  }

  document.destroy();
  library.destroy();

  return NextResponse.json({ files });
}

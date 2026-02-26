import { NextRequest, NextResponse } from 'next/server';
import { writeCanvasAnnotations } from '@/lib/server/project-store';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (typeof body.canvasIndex !== 'number' || !body.annotationPage) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  await writeCanvasAnnotations(id, body.canvasIndex, body.annotationPage);
  return NextResponse.json({ ok: true });
}

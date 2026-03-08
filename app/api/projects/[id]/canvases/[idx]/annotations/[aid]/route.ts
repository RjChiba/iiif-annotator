import { NextRequest, NextResponse } from 'next/server';
import { listAnnotationItems, updateAnnotationItem, deleteAnnotationItem } from '@/lib/server/project-store';

type Params = Promise<{ id: string; idx: string; aid: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id, idx, aid } = await params;
  const canvasIndex = parseInt(idx, 10);
  if (isNaN(canvasIndex)) return NextResponse.json({ error: 'Invalid canvas index.' }, { status: 400 });
  const annotationId = decodeURIComponent(aid);
  const items = await listAnnotationItems(id, canvasIndex);
  const item = items.find((i) => i.id === annotationId);
  if (!item) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { id, idx, aid } = await params;
  const canvasIndex = parseInt(idx, 10);
  if (isNaN(canvasIndex)) return NextResponse.json({ error: 'Invalid canvas index.' }, { status: 400 });
  const annotationId = decodeURIComponent(aid);
  const patch = await req.json();
  const updated = await updateAnnotationItem(id, canvasIndex, annotationId, patch);
  if (!updated) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { id, idx, aid } = await params;
  const canvasIndex = parseInt(idx, 10);
  if (isNaN(canvasIndex)) return NextResponse.json({ error: 'Invalid canvas index.' }, { status: 400 });
  const annotationId = decodeURIComponent(aid);
  const deleted = await deleteAnnotationItem(id, canvasIndex, annotationId);
  if (!deleted) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

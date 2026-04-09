import { NextRequest, NextResponse } from 'next/server';
import { listAnnotationItems, createAnnotationItem } from '@/lib/server/project-store';

type Params = Promise<{ id: string; idx: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id, idx } = await params;
  const canvasIndex = parseInt(idx, 10);
  if (isNaN(canvasIndex)) return NextResponse.json({ error: 'Invalid canvas index.' }, { status: 400 });
  const items = await listAnnotationItems(id, canvasIndex);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id, idx } = await params;
  const canvasIndex = parseInt(idx, 10);
  if (isNaN(canvasIndex)) return NextResponse.json({ error: 'Invalid canvas index.' }, { status: 400 });
  const body = await req.json();
  if (!body.body || !body.target) {
    return NextResponse.json({ error: 'body and target are required.' }, { status: 400 });
  }
  const item = await createAnnotationItem(id, canvasIndex, {
    type: 'Annotation',
    motivation: 'supplementing',
    ...body
  });
  return NextResponse.json(item, { status: 201 });
}

import { NextResponse } from 'next/server';
import { updateOcrSchema, deleteOcrSchema } from '@/lib/server/ocr-schema-store';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const schema = await updateOcrSchema(id, body);
  return NextResponse.json(schema);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteOcrSchema(id);
  return new NextResponse(null, { status: 204 });
}

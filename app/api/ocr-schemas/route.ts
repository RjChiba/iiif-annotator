import { NextResponse } from 'next/server';
import { listOcrSchemas, createOcrSchema } from '@/lib/server/ocr-schema-store';

export async function GET() {
  const schemas = await listOcrSchemas();
  return NextResponse.json(schemas);
}

export async function POST(req: Request) {
  const body = await req.json();
  const schema = await createOcrSchema(body);
  return NextResponse.json(schema, { status: 201 });
}

import { NextRequest, NextResponse } from 'next/server';
import { createProject, listProjects } from '@/lib/server/project-store';

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, sourceType, sourceRef, manifest } = body;
  if (!name || !sourceType || !sourceRef || !manifest) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const created = await createProject({ name, sourceType, sourceRef, manifest });
  return NextResponse.json(created, { status: 201 });
}

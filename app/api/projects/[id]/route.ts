import { NextResponse } from 'next/server';
import { deleteProject, readProject, updateProjectManifest } from '@/lib/server/project-store';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const project = await readProject(id);
    return NextResponse.json(project);
  } catch {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteProject(id);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (!body?.manifest) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  await updateProjectManifest(id, body.manifest, body.name);
  return NextResponse.json({ ok: true });
}

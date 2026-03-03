import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { OcrSchema } from '../ocr-schema';

const iiifDataDir = process.env.IIIF_DATA_DIR;
const schemasRoot = iiifDataDir
  ? path.join(iiifDataDir, 'ocr-schemas')
  : path.join(process.cwd(), 'data', 'ocr-schemas');

const ensureDir = () => fs.mkdir(schemasRoot, { recursive: true });

const schemaPath = (id: string) => path.join(schemasRoot, `${id}.json`);

export const listOcrSchemas = async (): Promise<OcrSchema[]> => {
  await ensureDir();
  let files: string[];
  try {
    files = await fs.readdir(schemasRoot);
  } catch {
    return [];
  }
  const schemas = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => {
        try {
          return JSON.parse(await fs.readFile(path.join(schemasRoot, f), 'utf-8')) as OcrSchema;
        } catch {
          return null;
        }
      })
  );
  return schemas.filter((s): s is OcrSchema => Boolean(s));
};

export const createOcrSchema = async (schema: Omit<OcrSchema, 'id'>): Promise<OcrSchema> => {
  await ensureDir();
  const id = randomUUID();
  const full: OcrSchema = { ...schema, id };
  await fs.writeFile(schemaPath(id), JSON.stringify(full, null, 2));
  return full;
};

export const updateOcrSchema = async (id: string, schema: OcrSchema): Promise<OcrSchema> => {
  await fs.writeFile(schemaPath(id), JSON.stringify({ ...schema, id }, null, 2));
  return { ...schema, id };
};

export const deleteOcrSchema = async (id: string): Promise<void> => {
  await fs.unlink(schemaPath(id));
};

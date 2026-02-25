import { StoredData } from './types';

const PREFIX = 'iiif-annotator:';

export const keyFor = (sourceKey: string) => `${PREFIX}${sourceKey}`;

export const loadStoredData = (sourceKey: string): StoredData | null => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(keyFor(sourceKey));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredData;
  } catch {
    return null;
  }
};

export const saveStoredData = (sourceKey: string, data: StoredData): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(keyFor(sourceKey), JSON.stringify(data));
};

export const clearStoredData = (sourceKey: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(keyFor(sourceKey));
};

export type UserSettings = {
  safeDelete: boolean;
};

const SETTINGS_KEY = 'iiif-annotator:settings';

const DEFAULT_SETTINGS: UserSettings = {
  safeDelete: true
};

export const loadUserSettings = (): UserSettings => {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };

  try {
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      safeDelete: typeof parsed.safeDelete === 'boolean' ? parsed.safeDelete : DEFAULT_SETTINGS.safeDelete
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveUserSettings = (settings: UserSettings): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

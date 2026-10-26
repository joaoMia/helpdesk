export type Theme = 'light' | 'dark';
export const themeKey = 'helpdesk-theme';
export function resolveTheme(saved: unknown, systemDark: boolean): Theme {
  return saved === 'light' || saved === 'dark'
    ? saved
    : systemDark
      ? 'dark'
      : 'light';
}

import { createContext, useContext } from 'react';

export const systemFont = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
export const chartPalettes = {
  light: { surface: '#ffffff', text: '#202b30', muted: '#62727b', grid: '#e7ecee', accent: '#08796b', positive: '#08796b', negative: '#bd424d', tooltip: '#202b30', tooltipText: '#ffffff' },
  dark: { surface: '#1b2225', text: '#e8eef0', muted: '#a1afb5', grid: '#303a3f', accent: '#75cfba', positive: '#75cfba', negative: '#f18e93', tooltip: '#e8eef0', tooltipText: '#202b30' },
};
export const AppearanceContext = createContext({ preference: 'System', setPreference: () => {}, resolvedTheme: 'dark', palette: chartPalettes.dark, reducedMotion: false });
export function useAppearance() { return useContext(AppearanceContext); }

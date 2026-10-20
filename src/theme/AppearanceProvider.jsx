import { useEffect, useLayoutEffect, useState } from 'react';
import { AppearanceContext, chartPalettes } from './appearanceContext.js';

const APPEARANCE_KEY = 'aethertrade_appearance';
function readPreference() {
  try { const value = localStorage.getItem(APPEARANCE_KEY); if (['System', 'Light', 'Dark'].includes(value)) return value; } catch { /* Storage is optional for appearance. */ }
  return 'System';
}
export default function AppearanceProvider({ children }) {
  const [preference, setPreference] = useState(readPreference);
  const [deviceDark, setDeviceDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const resolvedTheme = preference === 'System' ? (deviceDark ? 'dark' : 'light') : preference.toLowerCase();
  useEffect(() => {
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const updateDark = event => setDeviceDark(event.matches);
    const updateMotion = event => setReducedMotion(event.matches);
    dark.addEventListener('change', updateDark);
    motion.addEventListener('change', updateMotion);
    return () => { dark.removeEventListener('change', updateDark); motion.removeEventListener('change', updateMotion); };
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    try { localStorage.setItem(APPEARANCE_KEY, preference); } catch { /* Continue without a saved preference. */ }
  }, [preference, resolvedTheme]);
  return <AppearanceContext value={{ preference, setPreference, resolvedTheme, palette: chartPalettes[resolvedTheme], reducedMotion }}>{children}</AppearanceContext>;
}

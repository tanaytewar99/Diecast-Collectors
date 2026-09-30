/** Diecast Collectors brand tokens (see docs/PRODUCT_SPEC.md §7). */
export const colors = {
  primary: '#E10600', // Racing Red
  primaryPressed: '#B30500',
  bg: '#15171C', // Asphalt
  surface: '#23262E', // Graphite
  surfaceAlt: '#2D313B',
  border: '#393E4A',
  text: '#FFFFFF',
  textMuted: '#C9CED6', // Chrome
  textDim: '#8A909C',
  gold: '#F5B400', // Podium Gold
  up: '#22C55E',
  down: '#EF4444',
  overlay: 'rgba(0,0,0,0.55)',
  // Chart series, validated for the dark surface (dataviz validator: band, chroma, CVD, contrast).
  chartMarket: '#B98700',
  chartMine: '#5B8DEF',
  grid: '#30343D',
};

export const radius = { sm: 8, md: 12, lg: 18, xl: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const font = {
  hero: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.3 },
  h2: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
};

export const BRAND = {
  name: 'Diecast Collectors',
  tagline: 'Scan it. Know it. Track it.',
};

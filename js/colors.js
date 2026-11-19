// The Muna palette (from the Figma file). Nothing else is used.
export const PALETTE = {
  red: '#F88178', orange: '#FFC293', yellow: '#FCDA8B', green: '#91DCA4', blue: '#7FB2FF', purple: '#BFA6F5', pink: '#EAAEF3',
  black: '#484755', darkGray: '#948DA2', gray: '#D9D3E6', lightGray: '#F6F5F8', white: '#FFFFFF', track: '#E9E5EF',
};
export const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
export const COLOR_NAMES = { red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', blue: 'Blue', purple: 'Purple', pink: 'Pink' };
// Colors from the first version map onto the new palette.
const LEGACY = { lime: 'green', sky: 'blue', brown: 'orange', gray: 'purple' };
export const colorKey = (k) => (COLORS.includes(k) ? k : LEGACY[k] || 'purple');
export const hex = (k) => PALETTE[colorKey(k)];

/** Completion colors for Reports: 70–100 green, 50–69 yellow, 30–49 orange, 0–29 red. */
export function rateColor(pct) {
  if (pct == null) return PALETTE.gray;
  return pct >= 70 ? PALETTE.green : pct >= 50 ? PALETTE.yellow : pct >= 30 ? PALETTE.orange : PALETTE.red;
}

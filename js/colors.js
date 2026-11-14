// The only accent colors in the app. Everything else is black or white.
export const COLORS = {
  red:    ['#FF7A70', '#F2403A'],
  orange: ['#FFB04D', '#FF7A1A'],
  yellow: ['#FFDC4D', '#F5B400'],
  lime:   ['#B6E65C', '#7FD12B'],
  green:  ['#3CC78A', '#12905F'],
  sky:    ['#6BDDF7', '#25B2EA'],
  blue:   ['#68A4FF', '#2F6BFF'],
  purple: ['#BA94FF', '#7C4DFF'],
  pink:   ['#FF93CB', '#FF4FA3'],
  brown:  ['#C9A074', '#8C5E3C'],
  gray:   ['#B3B9C4', '#7A8190'],
};
export const COLOR_NAMES = {
  red: 'Red', orange: 'Orange', yellow: 'Yellow', lime: 'Light green', green: 'Dark green', sky: 'Sky blue',
  blue: 'Blue', purple: 'Purple', pink: 'Pink', brown: 'Brown', gray: 'Gray',
};
export const colorKeys = Object.keys(COLORS);
export const gradient = (k) => { const [a, b] = COLORS[k] || COLORS.blue; return `linear-gradient(135deg, ${a}, ${b})`; };
/** Inline CSS variables for an element tinted with a habit color. */
export const colorVars = (k) => { const [a, b] = COLORS[k] || COLORS.blue; return { '--c1': a, '--c2': b }; };

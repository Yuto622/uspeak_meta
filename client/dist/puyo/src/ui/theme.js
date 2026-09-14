/**
 * Palette and drawing constants shared by the renderer and the HUD.
 */

/** The five puyo colours, in palette order. */
export const PUYO_COLORS = Object.freeze([
  { name: 'red', base: '#ff4d5e', light: '#ff9aa4', dark: '#b4162a', ink: '#4a0713' },
  { name: 'green', base: '#4fd66f', light: '#a6f0b6', dark: '#1d8c38', ink: '#0a3d18' },
  { name: 'blue', base: '#4aa8ff', light: '#a5d4ff', dark: '#1663b8', ink: '#08284d' },
  { name: 'yellow', base: '#ffcc3d', light: '#ffe89a', dark: '#c08a00', ink: '#4a3400' },
  { name: 'purple', base: '#b967ff', light: '#dcb3ff', dark: '#7625c2', ink: '#310a52' },
]);

export const GARBAGE_COLOR = Object.freeze({
  name: 'garbage',
  base: '#9fb0c4',
  light: '#d8e2ec',
  dark: '#5d6d7e',
  ink: '#2b3642',
});

/** Letters in U-SPEAK mode are grouped by these labels in the legend. */
export const GROUP_LABELS = Object.freeze([
  'A E I O U',
  'T N S R',
  'L D C M H',
  'G B P F W Y',
  'J K V X Z',
]);

/** @param {number} index @returns {object} palette entry, garbage-safe. */
export function colorAt(index) {
  if (index < 0) return GARBAGE_COLOR;
  return PUYO_COLORS[index % PUYO_COLORS.length];
}

/* Street geometry in logical units (the canvas is scaled to fit). */
export const LW = 860, LH = 470;
/** Top of the house row, and the y the characters stand on. */
export const HOUSE_Y = LH - 268;
export const PEOPLE_Y = HOUSE_Y + 118;
/** Where the road starts. */
export const ROAD_Y = LH - 58;

export interface House { x: number; w: number; wall: string; roof: string; player?: boolean }
export const HOUSES: House[] = [
  { x: 40, w: 120, wall: '#c98f5f', roof: '#a34a28' }, { x: 185, w: 130, wall: '#d9b380', roof: '#8f3b2a' },
  { x: 345, w: 150, wall: '#e0c084', roof: '#b3542e', player: true }, { x: 520, w: 125, wall: '#caa06a', roof: '#93402a' },
  { x: 665, w: 130, wall: '#d4a76a', roof: '#a34a28' },
];
export const PLAYER_HOUSE = HOUSES[2];

export const TILE = 32;
export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 704;

const frame = [
  { x: 0, y: 0, w: 40, h: 1 },
  { x: 0, y: 21, w: 40, h: 1 },
  { x: 0, y: 1, w: 1, h: 20 },
  { x: 39, y: 1, w: 1, h: 20 },
];

function level(config) {
  return {
    par: 55,
    solids: [],
    gold: [],
    mines: [],
    turrets: [],
    drones: [],
    spikes: [],
    ...config,
    solids: [...frame, ...(config.solids ?? [])],
  };
}

export const LEVELS = [
  level({
    id: "first-flight",
    name: "First Flight",
    par: 48,
    spawn: { x: 2.4, y: 19.1 },
    switch: { x: 25.5, y: 19.3 },
    exit: { x: 36.4, y: 15.5 },
    solids: [
      { x: 1, y: 20, w: 38, h: 1 },
      { x: 4, y: 17, w: 6, h: 1 },
      { x: 12, y: 15, w: 7, h: 1 },
      { x: 22, y: 13, w: 7, h: 1 },
      { x: 31, y: 16, w: 8, h: 1 },
    ],
    gold: [
      { x: 5.5, y: 16.2 }, { x: 7, y: 16.2 }, { x: 8.5, y: 16.2 },
      { x: 13.5, y: 14.2 }, { x: 15.5, y: 14.2 }, { x: 17.5, y: 14.2 },
      { x: 23.5, y: 12.2 }, { x: 25.5, y: 12.2 }, { x: 27.5, y: 12.2 },
      { x: 32.5, y: 15.2 }, { x: 34.5, y: 15.2 },
    ],
  }),
  level({
    id: "split-decision",
    name: "Split Decision",
    par: 58,
    spawn: { x: 3, y: 19.1 },
    switch: { x: 34.5, y: 18.3 },
    exit: { x: 33.8, y: 4.5 },
    solids: [
      { x: 1, y: 20, w: 38, h: 1 },
      { x: 1, y: 16, w: 7, h: 1 },
      { x: 11, y: 17, w: 7, h: 1 },
      { x: 22, y: 15, w: 8, h: 1 },
      { x: 31, y: 19, w: 8, h: 1 },
      { x: 7, y: 12, w: 8, h: 1 },
      { x: 18, y: 10, w: 8, h: 1 },
      { x: 29, y: 7, w: 10, h: 1 },
      { x: 30, y: 5, w: 7, h: 1 },
    ],
    gold: [
      { x: 12.5, y: 16.2 }, { x: 14.5, y: 16.2 }, { x: 16.5, y: 16.2 },
      { x: 8.5, y: 11.2 }, { x: 10.5, y: 11.2 }, { x: 12.5, y: 11.2 },
      { x: 19.5, y: 9.2 }, { x: 21.5, y: 9.2 }, { x: 23.5, y: 9.2 },
      { x: 31.5, y: 4.2 }, { x: 33.5, y: 4.2 }, { x: 35.5, y: 4.2 },
    ],
    mines: [{ x: 26.5, y: 14.45 }, { x: 32.5, y: 18.45 }],
    spikes: [{ x: 18, y: 19.55, w: 10, h: 0.45 }],
  }),
  level({
    id: "wall-language",
    name: "Wall Language",
    par: 66,
    spawn: { x: 3, y: 19.1 },
    switch: { x: 20, y: 3.2 },
    exit: { x: 35.2, y: 15.5 },
    solids: [
      { x: 1, y: 20, w: 38, h: 1 },
      { x: 8, y: 8, w: 2, h: 12 },
      { x: 15, y: 3, w: 2, h: 13 },
      { x: 22, y: 7, w: 2, h: 13 },
      { x: 29, y: 3, w: 2, h: 13 },
      { x: 16, y: 3, w: 8, h: 1 },
      { x: 30, y: 16, w: 9, h: 1 },
    ],
    gold: [
      { x: 6.5, y: 17.5 }, { x: 6.5, y: 14.5 }, { x: 6.5, y: 11.5 },
      { x: 12.5, y: 13.5 }, { x: 12.5, y: 10.5 }, { x: 12.5, y: 7.5 },
      { x: 19.5, y: 6.5 }, { x: 26.5, y: 9.5 }, { x: 26.5, y: 12.5 },
      { x: 33.5, y: 13.5 }, { x: 35.5, y: 13.5 },
    ],
    mines: [{ x: 11.7, y: 19.45 }, { x: 25.2, y: 19.45 }],
    turrets: [{ x: 37.4, y: 19.1, angle: Math.PI }],
  }),
  level({
    id: "red-eye",
    name: "Red Eye",
    par: 72,
    spawn: { x: 3, y: 19.1 },
    switch: { x: 35, y: 5.2 },
    exit: { x: 3.2, y: 4.5 },
    solids: [
      { x: 1, y: 20, w: 38, h: 1 },
      { x: 1, y: 16, w: 9, h: 1 },
      { x: 13, y: 17, w: 8, h: 1 },
      { x: 24, y: 15, w: 7, h: 1 },
      { x: 33, y: 7, w: 6, h: 1 },
      { x: 24, y: 10, w: 7, h: 1 },
      { x: 14, y: 8, w: 7, h: 1 },
      { x: 1, y: 5, w: 9, h: 1 },
    ],
    gold: [
      { x: 14.5, y: 16.2 }, { x: 16.5, y: 16.2 }, { x: 18.5, y: 16.2 },
      { x: 25.5, y: 14.2 }, { x: 27.5, y: 14.2 }, { x: 29.5, y: 14.2 },
      { x: 25.5, y: 9.2 }, { x: 27.5, y: 9.2 }, { x: 29.5, y: 9.2 },
      { x: 15.5, y: 7.2 }, { x: 17.5, y: 7.2 }, { x: 19.5, y: 7.2 },
      { x: 3.5, y: 4.2 }, { x: 5.5, y: 4.2 }, { x: 7.5, y: 4.2 },
    ],
    mines: [{ x: 10.5, y: 19.45 }, { x: 22.5, y: 19.45 }, { x: 32, y: 19.45 }],
    turrets: [
      { x: 38.1, y: 13.8, angle: Math.PI },
      { x: 1.9, y: 9.8, angle: 0 },
    ],
    drones: [{ x1: 11, x2: 22, y: 12.2, speed: 2.3 }],
  }),
  level({
    id: "zero-margin",
    name: "Zero Margin",
    par: 82,
    spawn: { x: 2.8, y: 19.1 },
    switch: { x: 20, y: 2.3 },
    exit: { x: 36, y: 12.5 },
    solids: [
      { x: 1, y: 20, w: 38, h: 1 },
      { x: 5, y: 16, w: 2, h: 4 },
      { x: 11, y: 11, w: 2, h: 9 },
      { x: 17, y: 6, w: 2, h: 14 },
      { x: 23, y: 10, w: 2, h: 10 },
      { x: 29, y: 5, w: 2, h: 15 },
      { x: 35, y: 13, w: 4, h: 1 },
      { x: 18, y: 3, w: 8, h: 1 },
    ],
    gold: [
      { x: 8.5, y: 16.5 }, { x: 8.5, y: 13.5 },
      { x: 14.5, y: 11.5 }, { x: 14.5, y: 8.5 },
      { x: 20.5, y: 6.5 }, { x: 20.5, y: 4.5 },
      { x: 26.5, y: 10.5 }, { x: 26.5, y: 7.5 },
      { x: 32.5, y: 8.5 }, { x: 32.5, y: 11.5 },
      { x: 36.5, y: 12.2 }, { x: 37.5, y: 12.2 },
    ],
    mines: [
      { x: 7.8, y: 19.45 }, { x: 13.8, y: 19.45 },
      { x: 19.8, y: 19.45 }, { x: 25.8, y: 19.45 },
      { x: 31.8, y: 19.45 },
    ],
    turrets: [
      { x: 38.1, y: 18.7, angle: Math.PI },
      { x: 1.9, y: 14.2, angle: 0 },
    ],
    drones: [
      { x1: 7.5, x2: 16.5, y: 9.1, speed: 2.6 },
      { x1: 25.5, x2: 34.5, y: 4.2, speed: 2.9 },
    ],
    spikes: [{ x: 31, y: 19.55, w: 4, h: 0.45 }],
  }),
];

export function tileRect(rect) {
  return {
    x: rect.x * TILE,
    y: rect.y * TILE,
    w: rect.w * TILE,
    h: rect.h * TILE,
  };
}

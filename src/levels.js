// Level format (all units in world space, y up):
//   terrain:     top-surface polylines; each becomes a solid down to the world floor
//   blocks:      [x, y, w, h]           solid boxes (x,y = bottom-left)
//   cracked:     [x, y, w, h]           boxes only the stone ball can smash
//   platforms:   [x, yTop, w]           one-way platforms (jump up through them)
//   movers:      [x, yTop, w, dx, dy, period]
//   water:       [x1, x2, top, bottom]
//   spikes:      [x, y, w]
//   enemies:     [x, y, range]
//   springs:     [x, y]
//   totems:      [x, y, 'stone' | 'bouncy']
//   checkpoints: [x, y]
//   gems/hearts: [x, y]

function line(x1, y1, x2, y2, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
  }
  return pts;
}

function arc(x1, x2, y, height, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    pts.push([x1 + (x2 - x1) * t, y + Math.sin(t * Math.PI) * height]);
  }
  return pts;
}

export const LEVELS = [
  {
    name: 'Sunny Meadow',
    theme: 'meadow',
    hint: 'Roll with ← →, jump with Space',
    spawn: [0, 1],
    terrain: [
      [[-14, 0], [18, 0], [24, 2], [34, 2]],
      [[38.5, 2], [50, 2], [55, 0], [72, 0]],
      [[88, 0], [106, 0], [106, 1.5], [110, 1.5], [110, 3], [122, 3], [128, 0], [168, 0]],
    ],
    blocks: [[11, 0, 1.6, 1.2]],
    platforms: [[57, 5.5, 7], [92, 2.4, 3], [97, 4.2, 3]],
    movers: [[73.5, 0, 3, 9, 0, 5]],
    spikes: [[59.5, 0, 3]],
    enemies: [[44, 2, 3], [67, 0, 2.5], [116, 3, 3], [138, 0, 4]],
    springs: [[56.4, 0]],
    checkpoints: [[30, 2], [90, 0]],
    hearts: [[63.2, 6.4]],
    gems: [
      ...line(3, 1, 8, 1, 4),
      ...arc(9.5, 14.5, 1.3, 2.2, 4),
      ...line(19.5, 1.4, 23, 2.6, 3),
      ...arc(33, 39.5, 3, 2.5, 5),
      ...line(40, 3, 42, 3, 2),
      ...line(57.6, 6.4, 62, 6.4, 5),
      ...line(76, 1.2, 84, 1.2, 4),
      ...line(92.6, 3.3, 94.4, 3.3, 2),
      ...line(97.6, 5.1, 99.4, 5.1, 2),
      [108, 2.5], [112, 4], [120, 4],
      ...line(123, 3.6, 127, 1.6, 3),
      ...line(131, 1, 135, 1, 3),
      ...line(142, 1, 148, 1, 4),
    ],
    goal: [152, 0],
  },
  {
    name: 'Lagoon Lights',
    theme: 'lagoon',
    hint: 'Rock orbs make you heavy — sink and smash!',
    spawn: [0, 1],
    terrain: [
      [[-14, 0], [14, 0], [15, -6], [33, -6], [34, 0], [62, 0], [63, -5], [80, -5], [81, 0], [88, 0]],
      [[92, 6], [112, 6], [116, 3], [168, 3]],
    ],
    water: [
      [14, 34, -0.6, -6],
      [62, 81, -0.6, -5],
    ],
    cracked: [[50, 0, 1.4, 4]],
    platforms: [[70, 0.6, 3]],
    movers: [[88.4, 0, 3.2, 0, 6.6, 4.4]],
    spikes: [[120, 3, 3]],
    enemies: [[104, 6, 3], [134, 3, 2], [140, 3, 2]],
    totems: [
      [9, 0, 'stone'],
      [31, -6, 'bouncy'],
      [44, 0, 'stone'],
      [57, 0, 'bouncy'],
      [126, 3, 'stone'],
      [146, 3, 'bouncy'],
    ],
    checkpoints: [[39, 0], [96, 6]],
    hearts: [[71.5, 1.6]],
    gems: [
      ...line(3, 1, 7, 1, 3),
      ...line(17.5, -5.4, 29, -5.4, 6),
      ...line(36, 1, 40, 1, 3),
      ...line(53, 1, 55, 1, 2),
      ...arc(63.5, 69.5, 0.4, 1.8, 4),
      ...arc(73.5, 79.5, 0.4, 1.8, 4),
      ...line(89.9, 2.5, 89.9, 5.5, 3),
      ...line(98, 7, 110, 7, 5),
      ...line(113, 6.4, 115.5, 4.4, 3),
      ...arc(119.3, 123.7, 4.2, 2, 3),
      ...line(130, 3.9, 144, 3.9, 6),
      ...line(149, 3.9, 151, 3.9, 2),
    ],
    goal: [154, 3],
  },
  {
    name: 'Candy Clouds',
    theme: 'sunset',
    hint: 'Springs launch you sky-high',
    spawn: [0, 1],
    terrain: [
      [[-14, 0], [12, 0]],
      [[50, 2], [66, 2]],
      [[85, 3], [104, 3], [108, 0], [124, 0]],
      [[137, 0], [146, 0], [146, 2], [176, 2]],
    ],
    blocks: [[29, 3, 6, 1.5]],
    cracked: [[97, 3, 1.4, 4]],
    platforms: [
      [14, 1.5, 3], [19, 3, 3], [24, 4.5, 3],
      [66, 8, 7], [76.5, 7, 3], [81.5, 6, 3],
    ],
    movers: [
      [37, 4.5, 3, 8, 0, 4.5],
      [125.5, 0, 3, 6, 0, 4.4],
    ],
    spikes: [[59.8, 2, 2.2], [140, 0, 3]],
    enemies: [[55.5, 2, 2], [112, 0, 3], [118, 0, 2], [156, 2, 3]],
    springs: [[64.6, 2]],
    totems: [[92, 3, 'stone'], [122, 0, 'bouncy']],
    checkpoints: [[52, 2], [88, 3], [139, 0]],
    hearts: [[71.5, 9]],
    gems: [
      ...line(3, 1, 9, 1, 4),
      [15.5, 2.4], [20.5, 3.9], [25.5, 5.4],
      ...line(30, 5.4, 34, 5.4, 3),
      ...line(39, 5.4, 46, 5.4, 4),
      ...line(52, 3, 54, 3, 2),
      ...arc(60, 64, 3.2, 1.6, 3),
      ...line(64.6, 4, 64.6, 8, 3),
      ...line(67, 8.9, 70, 8.9, 3), [72.5, 8.9],
      [78, 7.9], [83, 6.9],
      ...line(99.5, 3.9, 103, 3.9, 3),
      ...line(110, 1, 120, 1, 5),
      ...line(127, 1, 134, 1, 4),
      ...arc(139.5, 143.5, 1.4, 1.8, 3),
      ...line(148, 3, 160, 3, 5),
    ],
    goal: [162, 2],
  },
];

export const THEMES = {
  meadow: {
    skyTop: '#59b8ff',
    skyBottom: '#d8f1ff',
    fog: '#cdeaff',
    dirtTop: '#d9925e',
    dirtBottom: '#7a4a35',
    grass: '#7ad957',
    grassDark: '#4fb33f',
    pebble: '#f0b27a',
    block: '#ffb35c',
    platform: '#fff4e0',
    hills: ['#9be27a', '#7fd3a8', '#b6ec8f'],
    foliage: ['#5fcf5a', '#8ee35c', '#3fb86b'],
    flowers: ['#ff6b8a', '#ffd43b', '#ffffff', '#b28dff'],
    sun: '#fff3b0',
    water: '#3cc4ff',
    gem: '#3ad6ff',
    accent: '#ff5a6e',
    card: ['#7ed957', '#3fb0ff', '#3c8a3a'],
    decor: 'meadow',
    hemiGround: '#6c8f4a',
  },
  lagoon: {
    skyTop: '#2fc6e0',
    skyBottom: '#fff1d0',
    fog: '#e8f7f0',
    dirtTop: '#f5cf8e',
    dirtBottom: '#b97f52',
    grass: '#41d3a0',
    grassDark: '#24a77d',
    pebble: '#fff0c9',
    block: '#ff9e7a',
    platform: '#fff4e0',
    hills: ['#5fd6c4', '#7be0b8', '#a6ecd0'],
    foliage: ['#2fbf8a', '#55d68f', '#1e9e78'],
    flowers: ['#ff7aa2', '#ffcf5c', '#ffffff', '#ff9566'],
    sun: '#fffbe0',
    water: '#1fb6ff',
    gem: '#ffd23f',
    accent: '#ff7a59',
    card: ['#2fd0c0', '#1f8fff', '#1a6f80'],
    decor: 'lagoon',
    hemiGround: '#d9b07a',
  },
  sunset: {
    skyTop: '#8f7cff',
    skyBottom: '#ffc7a8',
    fog: '#ffd6c4',
    dirtTop: '#b48cf0',
    dirtBottom: '#5a3c9c',
    grass: '#ff8fbf',
    grassDark: '#e0609c',
    pebble: '#d8c2ff',
    block: '#ffb86b',
    platform: '#ffffff',
    hills: ['#c09bff', '#ff9fc6', '#ffb7a1'],
    foliage: ['#ff9fd0', '#9fe8ff', '#ffe38a'],
    flowers: ['#ffffff', '#ffe066', '#7ef0ff', '#ff6fa8'],
    sun: '#fff0c0',
    water: '#7fa8ff',
    gem: '#ff5ea8',
    accent: '#ffb000',
    card: ['#b48cf0', '#ff7ab6', '#5a3c9c'],
    decor: 'sunset',
    hemiGround: '#9a6fc4',
  },
};

(() => {
  'use strict';

  const WALL_TILES = new Set(['1', '2', '3', '4']);
  const ENEMY_TYPES = new Set(['guard', 'rifle', 'heavy', 'commander']);
  const nativeMap = Array.prototype.map;

  const levelSpecs = [
    {
      start: [2.5, 2.5],
      signature: '8.5,3.5,rifle',
      map: [
        '11111111111111111111','10000000000000000001','10P00000111100000001','10001100100100022001','10001000100100020001','10001000000100020001','10001111111100020001','10000000000000020001','10000033000000020001','11110033001111121111','10000000001000000001','10002222001000333001','10002002000000303001','10002002011110303001','10000002010000300001','10111112010000333301','10000000010000000001','100000000000000000E1','10000000000000000001','11111111111111111111'
      ]
    },
    {
      start: [2.5, 17.5],
      signature: '5.5,3.5,guard',
      map: [
        '11111111111111111111','10000000000000000001','10003333333002222001','10003000003002002001','10003000003002002001','10003300333002222001','10000000300000000001','11111000300111110001','10001000300100010001','10001000000100010001','10001111111100010001','10000000000000010001','10222200033333010001','10200200030003010001','10200200030003010001','10222200033333010001','10000000000000000001','10000000111111111111','1E000000000000000001','11111111111111111111'
      ]
    },
    {
      start: [2.5, 2.5],
      signature: '8.5,3.5,rifle:10',
      map: [
        '11111111111111111111','10000000000000000001','10001111111111111001','10001000000000001001','10001022222000001001','10001020002033331001','10001020002030001001','10000020000030000001','11111022222033331111','10001000000000001001','10001011111111001001','10001010000001001','10000010044001000001','10333010044001111001','10303010000000001001','10303011111111101001','10333000000000001001','100000000000000000E1','10000000000000000001','11111111111111111111'
      ]
    }
  ];

  levelSpecs[2].map[11] = '10001010000001001001';

  function isEnemyDefinitionList(value) {
    return Array.isArray(value) && value.length >= 4 && value.every((entry) =>
      Array.isArray(entry) && entry.length === 3 &&
      Number.isFinite(entry[0]) && Number.isFinite(entry[1]) && ENEMY_TYPES.has(entry[2])
    );
  }

  function identifyLevel(list) {
    const first = list[0];
    const firstSignature = `${first[0]},${first[1]},${first[2]}`;
    if (list.length === 10) return levelSpecs[2];
    return levelSpecs.find((spec) => spec.signature === firstSignature) || null;
  }

  function tileAt(map, x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (iy < 0 || ix < 0 || iy >= map.length || ix >= map[0].length) return '1';
    return map[iy][ix];
  }

  function hasClearance(map, x, y, radius = 0.31) {
    const samples = [
      [0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius],
      [radius * .72, radius * .72], [-radius * .72, radius * .72],
      [radius * .72, -radius * .72], [-radius * .72, -radius * .72]
    ];
    return samples.every(([dx, dy]) => !WALL_TILES.has(tileAt(map, x + dx, y + dy)));
  }

  function wallNeighbourCount(map, cellX, cellY) {
    let count = 0;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (!ox && !oy) continue;
        if (WALL_TILES.has(tileAt(map, cellX + ox + .5, cellY + oy + .5))) count += 1;
      }
    }
    return count;
  }

  function findSafeSpawn(map, wantedX, wantedY, playerStart, occupied) {
    if (
      hasClearance(map, wantedX, wantedY) &&
      Math.hypot(wantedX - playerStart[0], wantedY - playerStart[1]) > 1.75 &&
      occupied.every(([x, y]) => Math.hypot(wantedX - x, wantedY - y) > 1.05)
    ) return [wantedX, wantedY];

    const originX = Math.floor(wantedX);
    const originY = Math.floor(wantedY);
    const candidates = [];
    const maxRadius = Math.max(map.length, map[0].length);

    for (let radius = 0; radius <= maxRadius; radius += 1) {
      for (let oy = -radius; oy <= radius; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          if (radius && Math.abs(ox) !== radius && Math.abs(oy) !== radius) continue;
          const cellX = originX + ox;
          const cellY = originY + oy;
          const x = cellX + .5;
          const y = cellY + .5;
          if (!hasClearance(map, x, y)) continue;
          if (Math.hypot(x - playerStart[0], y - playerStart[1]) <= 1.75) continue;
          if (occupied.some(([px, py]) => Math.hypot(x - px, y - py) <= 1.05)) continue;

          const displacement = Math.hypot(x - wantedX, y - wantedY);
          const enclosurePenalty = wallNeighbourCount(map, cellX, cellY) * .08;
          candidates.push({ x, y, score: displacement + enclosurePenalty });
        }
      }
      if (candidates.length) break;
    }

    candidates.sort((a, b) => a.score - b.score);
    return candidates.length ? [candidates[0].x, candidates[0].y] : [wantedX, wantedY];
  }

  Array.prototype.map = function patchedMap(callback, thisArg) {
    if (isEnemyDefinitionList(this)) {
      const spec = identifyLevel(this);
      if (spec) {
        const occupied = [];
        const corrected = [];
        for (const [x, y, type] of this) {
          const [safeX, safeY] = findSafeSpawn(spec.map, x, y, spec.start, occupied);
          occupied.push([safeX, safeY]);
          corrected.push([safeX, safeY, type]);
        }
        return nativeMap.call(corrected, callback, thisArg);
      }
    }
    return nativeMap.call(this, callback, thisArg);
  };
})();

import {
  DAYLIGHT_RADIUS,
  ICE_WALL_RADIUS,
  SUN_TRACK_RADIUS,
  TAU,
  clamp,
  environmentAt,
  firmamentRotation,
  sunPosition,
} from "./physics.mjs";

const LAND_FORMS = [
  {
    fill: "rgba(34, 78, 67, 0.74)",
    rim: "rgba(126, 169, 130, 0.34)",
    points: [[-0.63,-0.15],[-0.52,-0.33],[-0.32,-0.43],[-0.09,-0.40],[0.10,-0.31],[0.17,-0.13],[0.06,0.02],[-0.12,0.11],[-0.30,0.07],[-0.47,0.00]],
  },
  {
    fill: "rgba(42, 86, 73, 0.64)",
    rim: "rgba(120, 164, 130, 0.28)",
    points: [[0.18,-0.07],[0.38,-0.02],[0.56,0.10],[0.55,0.30],[0.39,0.37],[0.25,0.27],[0.12,0.11]],
  },
  {
    fill: "rgba(39, 83, 73, 0.58)",
    rim: "rgba(115, 159, 132, 0.25)",
    points: [[-0.55,0.24],[-0.37,0.17],[-0.20,0.25],[-0.12,0.42],[-0.28,0.58],[-0.49,0.54],[-0.63,0.40]],
  },
  {
    fill: "rgba(38, 80, 73, 0.52)",
    rim: "rgba(115, 159, 132, 0.22)",
    points: [[0.03,0.43],[0.23,0.38],[0.40,0.47],[0.39,0.63],[0.19,0.73],[-0.02,0.64]],
  },
];

const CONSTELLATIONS = [
  [2, 17, 34, 61],
  [9, 28, 57, 83, 112],
  [14, 45, 76, 103],
  [23, 52, 91, 138],
];

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function buildStars(count = 220) {
  const random = mulberry32(0x4d455249);
  return Array.from({ length: count }, (_, index) => ({
    angle: random() * TAU,
    radius: 0.07 + Math.sqrt(random()) * 0.87,
    size: index % 19 === 0 ? 2.2 : 0.55 + random() * 1.05,
    alpha: 0.35 + random() * 0.65,
    phase: random() * TAU,
  }));
}

function buildSnow(count = 110) {
  const random = mulberry32(0x1ce5e11);
  return Array.from({ length: count }, () => ({
    angle: random() * TAU,
    radius: 0.78 + random() * 0.28,
    drift: 0.018 + random() * 0.045,
    spin: (random() - 0.5) * 0.18,
    length: 2 + random() * 8,
    alpha: 0.08 + random() * 0.35,
    phase: random() * TAU,
  }));
}

function polygonPath(ctx, points, worldToScreen) {
  points.forEach(([x, y], index) => {
    const point = worldToScreen(x, y);
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

function roundedPolygon(ctx, points, worldToScreen) {
  const screen = points.map(([x, y]) => worldToScreen(x, y));
  if (screen.length < 3) return;
  const first = screen[0];
  const last = screen[screen.length - 1];
  ctx.moveTo((first.x + last.x) / 2, (first.y + last.y) / 2);
  for (let index = 0; index < screen.length; index += 1) {
    const current = screen[index];
    const next = screen[(index + 1) % screen.length];
    ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
  }
  ctx.closePath();
}

export function createArtSystem() {
  const stars = buildStars();
  const snow = buildSnow();
  const trail = [];
  let trailClock = 0;

  function update(dt, model) {
    trailClock -= dt;
    if (model.moving && trailClock <= 0) {
      trailClock = model.overdrive ? 0.025 : 0.055;
      trail.push({
        x: model.player.x,
        y: model.player.y,
        age: 0,
        life: model.overdrive ? 1.2 : 0.85,
        overdrive: model.overdrive,
      });
    }

    for (const particle of trail) particle.age += dt;
    while (trail.length && trail[0].age > trail[0].life) trail.shift();
  }

  function render(ctx, model) {
    const { viewport, elapsed } = model;
    const worldToScreen = (x, y) => ({
      x: viewport.cx + x * viewport.scale,
      y: viewport.cy + y * viewport.scale,
    });

    drawSpace(ctx, model, worldToScreen);

    const edge = environmentAt(model.player.x, model.player.y, elapsed, model.starLock).edgePressure;
    const shake = edge > 0.72 ? (edge - 0.72) * 4.2 : 0;
    const shakeX = Math.sin(elapsed * 31) * shake;
    const shakeY = Math.cos(elapsed * 27) * shake * 0.6;

    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawDisc(ctx, model, worldToScreen);
    drawSunTrack(ctx, model, worldToScreen);
    drawIceWall(ctx, model, worldToScreen);
    drawTrail(ctx, model, worldToScreen);
    drawStations(ctx, model, worldToScreen);
    drawObservatory(ctx, model, worldToScreen);
    drawNavigationFix(ctx, model, worldToScreen);
    drawSledge(ctx, model, worldToScreen);
    drawLabels(ctx, model, worldToScreen);
    ctx.restore();

    drawScreenFx(ctx, model);
  }

  function drawSpace(ctx, model) {
    const { width, height, cx, cy, scale } = model.viewport;
    const gradient = ctx.createRadialGradient(cx, cy, scale * 0.12, cx, cy, Math.max(width, height) * 0.78);
    gradient.addColorStop(0, "#102e38");
    gradient.addColorStop(0.48, "#071923");
    gradient.addColorStop(1, "#02070d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let band = 0; band < 3; band += 1) {
      ctx.beginPath();
      const base = height * (0.12 + band * 0.08);
      ctx.moveTo(-40, base);
      for (let x = -40; x <= width + 40; x += 26) {
        const y = base
          + Math.sin(x * 0.008 + model.elapsed * (0.12 + band * 0.03) + band) * (18 + band * 6)
          + Math.sin(x * 0.021 - model.elapsed * 0.08) * 7;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width + 40, 0);
      ctx.lineTo(-40, 0);
      ctx.closePath();
      const aurora = ctx.createLinearGradient(0, 0, 0, base + 80);
      aurora.addColorStop(0, "rgba(87, 242, 206, 0)");
      aurora.addColorStop(0.55, `rgba(${band === 1 ? "117, 118, 255" : "73, 226, 198"}, ${0.055 + band * 0.015})`);
      aurora.addColorStop(1, "rgba(61, 178, 177, 0)");
      ctx.fillStyle = aurora;
      ctx.fill();
    }
    ctx.restore();

    const vignette = ctx.createRadialGradient(cx, cy, Math.min(width, height) * 0.24, cx, cy, Math.max(width, height) * 0.68);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,2,7,0.72)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  function drawDisc(ctx, model, worldToScreen) {
    const { cx, cy, scale } = model.viewport;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, scale * ICE_WALL_RADIUS, 0, TAU);
    ctx.clip();

    const ocean = ctx.createRadialGradient(cx - scale * 0.18, cy - scale * 0.2, scale * 0.05, cx, cy, scale);
    ocean.addColorStop(0, "#164651");
    ocean.addColorStop(0.48, "#0c3039");
    ocean.addColorStop(0.82, "#09252f");
    ocean.addColorStop(1, "#06151e");
    ctx.fillStyle = ocean;
    ctx.fillRect(cx - scale, cy - scale, scale * 2, scale * 2);

    drawStars(ctx, model, worldToScreen);
    drawOceanTexture(ctx, model, worldToScreen);
    drawLand(ctx, model, worldToScreen);
    drawPolarRelief(ctx, model, worldToScreen);
    drawSurveyLanes(ctx, model, worldToScreen);
    drawSunlight(ctx, model, worldToScreen);
    drawGrid(ctx, model, worldToScreen);
    drawRimMist(ctx, model);
    ctx.restore();
  }

  function drawStars(ctx, model, worldToScreen) {
    const rotation = firmamentRotation(model.elapsed);
    const starPositions = stars.map((star) => {
      const angle = star.angle + rotation;
      return {
        ...star,
        x: Math.cos(angle) * star.radius,
        y: Math.sin(angle) * star.radius,
      };
    });

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineWidth = 0.7;
    for (const chain of CONSTELLATIONS) {
      let started = false;
      ctx.beginPath();
      for (const index of chain) {
        const star = starPositions[index];
        const env = environmentAt(star.x, star.y, model.elapsed, 0);
        if (env.daylight > 0.34) continue;
        const point = worldToScreen(star.x, star.y);
        if (!started) {
          ctx.moveTo(point.x, point.y);
          started = true;
        } else ctx.lineTo(point.x, point.y);
      }
      ctx.strokeStyle = "rgba(122, 207, 224, 0.09)";
      ctx.stroke();
    }

    for (const star of starPositions) {
      const env = environmentAt(star.x, star.y, model.elapsed, 0);
      const darkness = clamp((0.46 - env.daylight) * 3.1, 0, 1);
      const twinkle = 0.66 + Math.sin(model.elapsed * 1.8 + star.phase) * 0.34;
      const alpha = darkness * star.alpha * twinkle;
      if (alpha < 0.02) continue;
      const point = worldToScreen(star.x, star.y);
      ctx.fillStyle = `rgba(211, 240, 247, ${alpha})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, star.size, 0, TAU);
      ctx.fill();
      if (star.size > 1.8) {
        ctx.strokeStyle = `rgba(170, 228, 239, ${alpha * 0.42})`;
        ctx.beginPath();
        ctx.moveTo(point.x - 5, point.y);
        ctx.lineTo(point.x + 5, point.y);
        ctx.moveTo(point.x, point.y - 5);
        ctx.lineTo(point.x, point.y + 5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawOceanTexture(ctx, model, worldToScreen) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    for (let ring = 0; ring < 16; ring += 1) {
      const radius = 0.12 + ring * 0.053;
      const point = worldToScreen(0, 0);
      ctx.strokeStyle = ring % 2 ? "rgba(95, 184, 192, 0.09)" : "rgba(170, 220, 217, 0.045)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * model.viewport.scale + Math.sin(model.elapsed * 0.09 + ring) * 1.4, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLand(ctx, model, worldToScreen) {
    for (const form of LAND_FORMS) {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.38)";
      ctx.shadowBlur = 15;
      ctx.shadowOffsetY = 7;
      ctx.beginPath();
      roundedPolygon(ctx, form.points, worldToScreen);
      ctx.fillStyle = form.fill;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = form.rim;
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = "rgba(177, 210, 168, 0.07)";
      ctx.lineWidth = 0.65;
      for (let inset = 0; inset < 4; inset += 1) {
        const scaled = form.points.map(([x, y]) => [x * (1 - inset * 0.025), y * (1 - inset * 0.025)]);
        ctx.beginPath();
        polygonPath(ctx, scaled, worldToScreen);
        ctx.stroke();
      }
      ctx.restore();
    }

    const settlements = [[-0.17,-0.22],[0.30,0.14],[-0.40,0.36],[0.14,0.56],[0.04,-0.16]];
    for (const [x, y] of settlements) {
      const env = environmentAt(x, y, model.elapsed, 0);
      const point = worldToScreen(x, y);
      const glow = 0.18 + (1 - env.daylight) * 0.62;
      ctx.fillStyle = `rgba(255, 190, 91, ${glow})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.8, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 169, 73, ${glow * 0.25})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, TAU);
      ctx.stroke();
    }
  }

  function drawPolarRelief(ctx, model, worldToScreen) {
    const center = worldToScreen(0, 0);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 9; i += 1) {
      const radius = (0.035 + i * 0.015) * model.viewport.scale;
      ctx.strokeStyle = `rgba(188, 232, 230, ${0.18 - i * 0.014})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(227, 248, 243, 0.85)";
    ctx.beginPath();
    ctx.arc(center.x, center.y, 3.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawSurveyLanes(ctx, model, worldToScreen) {
    for (let k = 0; k < 6; k += 1) {
      const angle = (k * Math.PI - 0.45) / 3;
      const midX = Math.cos(angle) * 0.56;
      const midY = Math.sin(angle) * 0.56;
      const env = environmentAt(midX, midY, model.elapsed, 0);
      const start = worldToScreen(Math.cos(angle) * 0.31, Math.sin(angle) * 0.31);
      const end = worldToScreen(Math.cos(angle) * 0.84, Math.sin(angle) * 0.84);
      ctx.save();
      ctx.lineCap = "round";
      ctx.setLineDash(env.lane.frozen ? [10, 8] : [3, 13]);
      ctx.lineDashOffset = -model.elapsed * (env.lane.frozen ? 12 : 4);
      ctx.lineWidth = env.lane.frozen ? 5.5 : 7;
      ctx.strokeStyle = env.lane.frozen ? "rgba(116, 226, 246, 0.34)" : "rgba(51, 89, 93, 0.3)";
      ctx.shadowColor = env.lane.frozen ? "rgba(111, 223, 244, 0.52)" : "transparent";
      ctx.shadowBlur = env.lane.frozen ? 10 : 0;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSunlight(ctx, model, worldToScreen) {
    const sun = sunPosition(model.elapsed);
    const point = worldToScreen(sun.x, sun.y);
    const radius = DAYLIGHT_RADIUS * model.viewport.scale;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const halo = ctx.createRadialGradient(point.x, point.y, radius * 0.03, point.x, point.y, radius);
    halo.addColorStop(0, "rgba(255, 226, 138, 0.44)");
    halo.addColorStop(0.23, "rgba(255, 183, 79, 0.24)");
    halo.addColorStop(0.58, "rgba(223, 123, 55, 0.09)");
    halo.addColorStop(1, "rgba(194, 88, 43, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);

    const terminator = ctx.createRadialGradient(point.x, point.y, radius * 0.45, point.x, point.y, radius * 1.05);
    terminator.addColorStop(0, "rgba(255,255,255,0)");
    terminator.addColorStop(0.72, "rgba(255, 139, 64, 0.04)");
    terminator.addColorStop(0.86, "rgba(91, 92, 178, 0.08)");
    terminator.addColorStop(1, "rgba(25, 45, 76, 0)");
    ctx.fillStyle = terminator;
    ctx.fillRect(point.x - radius * 1.1, point.y - radius * 1.1, radius * 2.2, radius * 2.2);
    ctx.restore();
  }

  function drawGrid(ctx, model) {
    const { cx, cy, scale } = model.viewport;
    ctx.save();
    ctx.strokeStyle = "rgba(148, 206, 207, 0.095)";
    ctx.lineWidth = 0.7;
    for (const radius of [0.22, 0.44, 0.66, 0.88]) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * scale, 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * TAU;
      ctx.globalAlpha = i % 2 ? 0.55 : 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * scale * 0.94, cy + Math.sin(angle) * scale * 0.94);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRimMist(ctx, model) {
    const { cx, cy, scale } = model.viewport;
    const mist = ctx.createRadialGradient(cx, cy, scale * 0.71, cx, cy, scale * 0.98);
    mist.addColorStop(0, "rgba(137, 220, 230, 0)");
    mist.addColorStop(0.72, "rgba(112, 205, 221, 0.025)");
    mist.addColorStop(1, "rgba(176, 239, 245, 0.12)");
    ctx.fillStyle = mist;
    ctx.fillRect(cx - scale, cy - scale, scale * 2, scale * 2);
  }

  function drawSunTrack(ctx, model, worldToScreen) {
    const { cx, cy, scale } = model.viewport;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 204, 105, 0.15)";
    ctx.setLineDash([2, 9]);
    ctx.lineDashOffset = -model.elapsed * 2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, SUN_TRACK_RADIUS * scale, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    const sun = sunPosition(model.elapsed);
    const point = worldToScreen(sun.x, sun.y);
    ctx.globalCompositeOperation = "screen";
    for (let ray = 0; ray < 18; ray += 1) {
      const angle = (ray / 18) * TAU + model.elapsed * 0.025;
      const inner = 12 + (ray % 3) * 2;
      const outer = 26 + (ray % 5) * 3;
      ctx.strokeStyle = `rgba(255, 205, 105, ${0.10 + (ray % 4) * 0.025})`;
      ctx.beginPath();
      ctx.moveTo(point.x + Math.cos(angle) * inner, point.y + Math.sin(angle) * inner);
      ctx.lineTo(point.x + Math.cos(angle) * outer, point.y + Math.sin(angle) * outer);
      ctx.stroke();
    }
    const corona = ctx.createRadialGradient(point.x, point.y, 1, point.x, point.y, 36);
    corona.addColorStop(0, "rgba(255,255,219,1)");
    corona.addColorStop(0.13, "rgba(255,218,108,0.96)");
    corona.addColorStop(0.42, "rgba(255,150,59,0.35)");
    corona.addColorStop(1, "rgba(255,128,48,0)");
    ctx.fillStyle = corona;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 36, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawIceWall(ctx, model, worldToScreen) {
    const { cx, cy, scale } = model.viewport;
    ctx.save();
    ctx.shadowColor = "rgba(115, 226, 244, 0.35)";
    ctx.shadowBlur = 24;
    ctx.strokeStyle = "rgba(111, 220, 238, 0.23)";
    ctx.lineWidth = Math.max(26, scale * 0.07);
    ctx.beginPath();
    ctx.arc(cx, cy, ICE_WALL_RADIUS * scale, 0, TAU);
    ctx.stroke();
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "rgba(202, 247, 249, 0.74)";
    ctx.lineWidth = Math.max(8, scale * 0.022);
    ctx.beginPath();
    ctx.arc(cx, cy, ICE_WALL_RADIUS * scale, 0, TAU);
    ctx.stroke();

    ctx.shadowColor = "transparent";
    for (let i = 0; i < 128; i += 1) {
      const angle = (i / 128) * TAU;
      const crest = ICE_WALL_RADIUS - 0.002;
      const depth = 0.032 + ((i * 29) % 17) * 0.0019;
      const side = 0.003 + ((i * 11) % 7) * 0.0006;
      const p1 = worldToScreen(Math.cos(angle - side) * crest, Math.sin(angle - side) * crest);
      const p2 = worldToScreen(Math.cos(angle) * (crest - depth), Math.sin(angle) * (crest - depth));
      const p3 = worldToScreen(Math.cos(angle + side) * crest, Math.sin(angle + side) * crest);
      ctx.fillStyle = i % 3 === 0 ? "rgba(221, 250, 251, 0.28)" : "rgba(132, 214, 230, 0.19)";
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalCompositeOperation = "screen";
    for (const mote of snow) {
      const phase = mote.phase + model.elapsed * mote.spin;
      const radius = mote.radius + Math.sin(model.elapsed * mote.drift + mote.phase) * 0.025;
      const point = worldToScreen(Math.cos(mote.angle + phase * 0.08) * radius, Math.sin(mote.angle + phase * 0.08) * radius);
      const tangent = mote.angle + Math.PI / 2;
      ctx.strokeStyle = `rgba(204, 244, 249, ${mote.alpha})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(point.x + Math.cos(tangent) * mote.length, point.y + Math.sin(tangent) * mote.length);
      ctx.stroke();
    }
    ctx.restore();
  }

  function stationGlow(ctx, x, y, color, scale = 1) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 34 * scale);
    glow.addColorStop(0, color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 34 * scale, 0, TAU);
    ctx.fill();
  }

  function drawStations(ctx, model, worldToScreen) {
    for (const station of model.stations) {
      const point = worldToScreen(station.x, station.y);
      const active = station.online;
      const pulse = 1 + Math.sin(model.elapsed * 3.2 + station.x * 10) * 0.045;
      ctx.save();
      ctx.translate(point.x, point.y);
      if (active) stationGlow(ctx, 0, 0, "rgba(101, 235, 161, 0.18)", pulse);
      else stationGlow(ctx, 0, 0, "rgba(125, 211, 224, 0.07)", pulse);
      ctx.strokeStyle = active ? "rgba(139, 246, 181, 0.96)" : "rgba(203, 235, 232, 0.78)";
      ctx.fillStyle = active ? "rgba(50, 117, 77, 0.48)" : "rgba(6, 20, 27, 0.9)";
      ctx.lineWidth = active ? 1.8 : 1.2;

      if (station.id === "solar") {
        ctx.rotate(model.elapsed * (active ? 0.28 : 0.08));
        for (let petal = 0; petal < 4; petal += 1) {
          ctx.save();
          ctx.rotate(petal * Math.PI / 2);
          ctx.fillRect(-3, -19, 6, 13);
          ctx.strokeRect(-3, -19, 6, 13);
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, TAU);
        ctx.fill();
        ctx.stroke();
      } else if (station.id === "stars") {
        ctx.beginPath();
        ctx.moveTo(-12, 9);
        ctx.lineTo(0, -14);
        ctx.lineTo(12, 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.rotate(-firmamentRotation(model.elapsed));
        ctx.beginPath();
        ctx.arc(0, -2, 7, -Math.PI * 0.9, Math.PI * 0.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(11, -7);
        ctx.stroke();
      } else {
        ctx.fillRect(-9, -7, 18, 14);
        ctx.strokeRect(-9, -7, 18, 14);
        ctx.rotate(model.elapsed * (active ? 1.8 : 0.55));
        for (let blade = 0; blade < 3; blade += 1) {
          ctx.rotate(TAU / 3);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(4, -18);
          ctx.lineTo(-1, -12);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.restore();

      if (active) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.strokeStyle = "rgba(110, 242, 166, 0.28)";
        ctx.setLineDash([2, 5]);
        ctx.lineDashOffset = -model.elapsed * 8;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 18 + Math.sin(model.elapsed * 3) * 2, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawObservatory(ctx, model, worldToScreen) {
    const point = worldToScreen(model.observatory.x, model.observatory.y);
    const unlocked = model.stations.every((station) => station.online);
    ctx.save();
    ctx.translate(point.x, point.y);
    if (unlocked) stationGlow(ctx, 0, 0, "rgba(255, 205, 119, 0.16)", 1.2);
    ctx.strokeStyle = unlocked ? "rgba(255, 224, 151, 0.94)" : "rgba(121, 151, 154, 0.52)";
    ctx.fillStyle = unlocked ? "rgba(90, 69, 34, 0.66)" : "rgba(5, 17, 23, 0.82)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 2, 15, Math.PI, TAU);
    ctx.lineTo(15, 8);
    ctx.lineTo(-15, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(8, -27);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(9, -28, 3.5, 0, TAU);
    ctx.stroke();
    ctx.restore();

    if (unlocked) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const beamAngle = -1.85 + Math.sin(model.elapsed * 0.24) * 0.62;
      const length = model.viewport.scale * 0.32;
      const gradient = ctx.createLinearGradient(point.x, point.y, point.x + Math.cos(beamAngle) * length, point.y + Math.sin(beamAngle) * length);
      gradient.addColorStop(0, "rgba(255, 221, 143, 0.34)");
      gradient.addColorStop(1, "rgba(255, 221, 143, 0)");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y - 22);
      ctx.lineTo(point.x + Math.cos(beamAngle) * length, point.y + Math.sin(beamAngle) * length);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawTrail(ctx, model, worldToScreen) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const particle of trail) {
      const progress = particle.age / particle.life;
      const point = worldToScreen(particle.x, particle.y);
      const radius = (particle.overdrive ? 4.5 : 3) * (1 + progress * 1.6);
      ctx.fillStyle = particle.overdrive
        ? `rgba(255, 201, 111, ${(1 - progress) * 0.22})`
        : `rgba(155, 225, 232, ${(1 - progress) * 0.18})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawNavigationFix(ctx, model, worldToScreen) {
    if (model.starLock <= 0) return;
    const player = worldToScreen(model.player.x, model.player.y);
    const targets = model.stations.filter((station) => !station.online);
    if (!targets.length) targets.push(model.observatory);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.setLineDash([2, 7]);
    ctx.lineDashOffset = -model.elapsed * 12;
    ctx.strokeStyle = "rgba(123, 231, 242, 0.42)";
    ctx.lineWidth = 1.2;
    for (const target of targets) {
      const point = worldToScreen(target.x, target.y);
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSledge(ctx, model, worldToScreen) {
    const point = worldToScreen(model.player.x, model.player.y);
    const env = environmentAt(model.player.x, model.player.y, model.elapsed, model.starLock);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(model.player.heading + Math.PI / 2);

    if (env.daylight < 0.38) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const headlight = ctx.createLinearGradient(0, -6, 0, -58);
      headlight.addColorStop(0, "rgba(185, 238, 244, 0.3)");
      headlight.addColorStop(1, "rgba(185, 238, 244, 0)");
      ctx.fillStyle = headlight;
      ctx.beginPath();
      ctx.moveTo(-5, -7);
      ctx.lineTo(-17, -61);
      ctx.lineTo(17, -61);
      ctx.lineTo(5, -7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.shadowColor = model.overdrive ? "rgba(255, 190, 86, 0.55)" : "rgba(126, 224, 235, 0.32)";
    ctx.shadowBlur = model.overdrive ? 16 : 8;
    ctx.fillStyle = "#d8ece6";
    ctx.strokeStyle = "#031017";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(8, -1);
    ctx.lineTo(6, 10);
    ctx.lineTo(-6, 10);
    ctx.lineTo(-8, -1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = env.daylight > 0.38 ? "#d4a84e" : "#365f68";
    ctx.fillRect(-5, -2, 10, 5);
    ctx.strokeStyle = "rgba(2, 15, 21, 0.8)";
    ctx.strokeRect(-5, -2, 10, 5);
    ctx.strokeStyle = "rgba(199, 232, 231, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, 7);
    ctx.lineTo(-12, 13);
    ctx.moveTo(8, 7);
    ctx.lineTo(12, 13);
    ctx.stroke();
    ctx.restore();

    const gnomonLength = 18 + (1 - env.daylight) * 9;
    ctx.strokeStyle = `rgba(2, 9, 12, ${0.25 + env.daylight * 0.5})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + env.gnomon.x * gnomonLength, point.y + env.gnomon.y * gnomonLength);
    ctx.stroke();

    if (model.interactProgress > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = "rgba(225, 247, 240, 0.92)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 18, -Math.PI / 2, -Math.PI / 2 + model.interactProgress * TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawLabels(ctx, model, worldToScreen) {
    ctx.save();
    ctx.font = "700 9px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "0.08em";
    const pole = worldToScreen(0, 0);
    ctx.fillStyle = "rgba(218, 240, 236, 0.58)";
    ctx.fillText("CENTRAL POLE", pole.x + 13, pole.y - 8);

    for (const station of model.stations) {
      const point = worldToScreen(station.x, station.y);
      ctx.fillStyle = station.online ? "rgba(138, 239, 174, 0.86)" : "rgba(207, 233, 230, 0.62)";
      ctx.fillText(station.name.replace(/^[IVX]+ · /, ""), point.x + 15, point.y + 2);
    }

    const observatory = worldToScreen(model.observatory.x, model.observatory.y);
    ctx.fillStyle = model.stations.every((station) => station.online) ? "rgba(255, 222, 148, 0.9)" : "rgba(131, 157, 157, 0.55)";
    ctx.fillText("RIM OBSERVATORY", observatory.x + 17, observatory.y + 2);

    const wall = worldToScreen(0.61, 0.74);
    ctx.fillStyle = "rgba(163, 228, 238, 0.62)";
    ctx.fillText("ICE WALL // 90° SOUTH", wall.x, wall.y);
    ctx.restore();
  }

  function drawScreenFx(ctx, model) {
    const { width, height, cx, cy } = model.viewport;
    ctx.save();
    const vignette = ctx.createRadialGradient(cx, cy, Math.min(width, height) * 0.31, cx, cy, Math.max(width, height) * 0.72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(0.78, "rgba(0,6,12,0.08)");
    vignette.addColorStop(1, "rgba(0,3,8,0.44)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 0.055;
    ctx.fillStyle = "#d9ffff";
    for (let y = 1; y < height; y += 4) ctx.fillRect(0, y, width, 1);
    ctx.restore();
  }

  return { update, render };
}

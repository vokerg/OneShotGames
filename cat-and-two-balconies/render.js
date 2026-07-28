"use strict";

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#7d9bc8");
  sky.addColorStop(.46, "#c4b8ab");
  sky.addColorStop(1, "#5d6477");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = .6;
  for (let i = 0; i < 8; i++) {
    const x = ((i * 211 + elapsed * (i % 2 ? 2 : 4)) % (W + 240)) - 120;
    const y = 90 + (i % 3) * 42;
    ctx.fillStyle = "rgba(245,245,245,.24)";
    ctx.beginPath();
    ctx.ellipse(x, y, 64, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 40, y - 8, 47, 17, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const skylineY = 206;
  for (let i = 0; i < 21; i++) {
    const x = i * 67 - 15;
    const h = 36 + ((i * 41) % 95);
    ctx.fillStyle = i % 3 === 0 ? "#4b5365" : "#596174";
    ctx.fillRect(x, skylineY - h, 55 + (i % 2) * 20, h + 170);
    ctx.fillStyle = "rgba(255,223,166,.25)";
    for (let yy = skylineY - h + 13; yy < skylineY - 12; yy += 17) {
      for (let xx = x + 9; xx < x + 49; xx += 15) ctx.fillRect(xx, yy, 5, 7);
    }
  }
}

function drawBalcony(balcony, side) {
  const grad = ctx.createLinearGradient(balcony.left, 0, balcony.right, 0);
  if (side === 0) {
    grad.addColorStop(0, "#536275");
    grad.addColorStop(1, "#8794a2");
  } else {
    grad.addColorStop(0, "#8794a2");
    grad.addColorStop(1, "#536275");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(balcony.left, balcony.top, balcony.right - balcony.left, balcony.bottom - balcony.top);

  ctx.strokeStyle = "rgba(255,255,255,.11)";
  ctx.lineWidth = 2;
  for (let y = balcony.top + 18; y < balcony.bottom; y += 32) {
    ctx.beginPath();
    ctx.moveTo(balcony.left, y);
    ctx.lineTo(balcony.right, y);
    ctx.stroke();
  }

  const outerX = side === 0 ? balcony.left + 13 : balcony.right - 13;
  ctx.strokeStyle = "#293444";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(outerX, balcony.top + 7);
  ctx.lineTo(outerX, balcony.bottom - 7);
  ctx.stroke();
  ctx.lineWidth = 4;
  for (let y = balcony.top + 22; y < balcony.bottom; y += 30) {
    ctx.beginPath();
    ctx.moveTo(outerX, y);
    ctx.lineTo(outerX + (side === 0 ? 42 : -42), y);
    ctx.stroke();
  }

  const potX = side === 0 ? balcony.left + 52 : balcony.right - 52;
  ctx.fillStyle = "#a96743";
  roundedRect(potX - 20, balcony.top + 50, 40, 35, 7);
  ctx.fill();
  leaves.filter(l => l.side === side).forEach((leaf, i) => {
    const sway = Math.sin(elapsed * 1.8 + leaf.phase) * 5;
    ctx.strokeStyle = "#365f4d";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(potX, balcony.top + 54);
    ctx.quadraticCurveTo(potX + sway, balcony.top + 22, potX + sway * 1.3 + (i - 2) * 7, balcony.top + 8 + i * 3);
    ctx.stroke();
    ctx.fillStyle = "#4f8064";
    ctx.beginPath();
    ctx.ellipse(potX + sway * 1.3 + (i - 2) * 7, balcony.top + 11 + i * 3, 10, 5, .5 + sway * .02, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawRoom() {
  ctx.fillStyle = "#dbc8aa";
  ctx.fillRect(room.left, room.top, room.right - room.left, room.bottom - room.top);

  ctx.save();
  ctx.beginPath();
  ctx.rect(room.left, room.top, room.right - room.left, room.bottom - room.top);
  ctx.clip();
  for (let y = room.top; y < room.bottom; y += 24) {
    const offset = ((y - room.top) / 24) % 2 ? 34 : 0;
    for (let x = room.left - 70 + offset; x < room.right; x += 68) {
      ctx.fillStyle = ((x + y) / 20) % 2 > 1 ? "rgba(106,73,47,.09)" : "rgba(255,255,255,.09)";
      ctx.fillRect(x, y, 64, 21);
      ctx.strokeStyle = "rgba(80,53,34,.08)";
      ctx.strokeRect(x, y, 64, 21);
    }
  }

  const sun = ctx.createLinearGradient(room.left, room.top, room.right, room.bottom);
  sun.addColorStop(0, "rgba(255,245,201,.20)");
  sun.addColorStop(.45, "rgba(255,229,150,.05)");
  sun.addColorStop(1, "rgba(108,73,76,.10)");
  ctx.fillStyle = sun;
  ctx.fillRect(room.left, room.top, room.right - room.left, room.bottom - room.top);
  ctx.restore();

  ctx.fillStyle = "rgba(64,61,87,.15)";
  roundedRect(470, 373, 356, 242, 38);
  ctx.fill();
  const rug = ctx.createLinearGradient(470, 373, 826, 615);
  rug.addColorStop(0, "#705e76");
  rug.addColorStop(1, "#40546b");
  ctx.fillStyle = rug;
  roundedRect(480, 363, 336, 242, 35);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,233,203,.38)";
  ctx.lineWidth = 3;
  roundedRect(497, 380, 302, 208, 26);
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = `rgba(255,235,209,${.05 + i * .008})`;
    ctx.beginPath();
    ctx.arc(648, 485, 30 + i * 14, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(49,42,47,.22)";
  roundedRect(430, 172, 438, 130, 25);
  ctx.fill();
  ctx.fillStyle = "#7a696d";
  roundedRect(440, 161, 418, 126, 23);
  ctx.fill();
  ctx.fillStyle = "#8d7a7e";
  roundedRect(460, 177, 180, 80, 18);
  ctx.fill();
  roundedRect(658, 177, 180, 80, 18);
  ctx.fill();
  ctx.fillStyle = "#d6a776";
  roundedRect(602, 184, 90, 58, 16);
  ctx.fill();

  ctx.fillStyle = "rgba(42,31,26,.22)";
  ctx.beginPath(); ctx.ellipse(649, 465, 120, 52, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8b6d50";
  ctx.beginPath(); ctx.ellipse(649, 453, 112, 47, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#b58a60";
  ctx.beginPath(); ctx.ellipse(649, 446, 104, 39, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#e7ddd0";
  ctx.beginPath(); ctx.arc(685, 439, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#6e4d37";
  ctx.beginPath(); ctx.arc(685, 439, 8, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = "#78624e";
  roundedRect(878, 563, 118, 94, 12); ctx.fill();
  ctx.fillStyle = "#a88c6c";
  roundedRect(886, 572, 102, 34, 7); ctx.fill();
  ctx.fillStyle = "#d0b897";
  ctx.beginPath(); ctx.arc(937, 589, 4, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = "#53463b";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(room.left, room.top); ctx.lineTo(room.right, room.top);
  ctx.moveTo(room.left, room.bottom); ctx.lineTo(room.right, room.bottom);
  ctx.moveTo(room.left, room.top); ctx.lineTo(room.left, doors[0].y - doorHalf);
  ctx.moveTo(room.left, doors[0].y + doorHalf); ctx.lineTo(room.left, room.bottom);
  ctx.moveTo(room.right, room.top); ctx.lineTo(room.right, doors[1].y - doorHalf);
  ctx.moveTo(room.right, doors[1].y + doorHalf); ctx.lineTo(room.right, room.bottom);
  ctx.stroke();

  ctx.strokeStyle = "#a77b52";
  ctx.lineWidth = 8;
  doors.forEach(door => {
    ctx.beginPath();
    ctx.moveTo(door.x, door.y - doorHalf);
    ctx.lineTo(door.x, door.y + doorHalf);
    ctx.stroke();
  });
}

function drawAirflow() {
  const openCount = doors.filter(d => d.open).length;
  if (!openCount) return;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  doors.forEach((door, index) => {
    if (!door.open) return;
    for (let i = 0; i < 5; i++) {
      const phase = (elapsed * (50 + i * 5) + i * 88) % 330;
      const dir = index === 0 ? 1 : -1;
      const x = door.x + dir * phase;
      const y = door.y - 48 + i * 24 + Math.sin(elapsed * 2 + i) * 8;
      const alpha = Math.sin(clamp(phase / 330, 0, 1) * Math.PI) * .32;
      ctx.strokeStyle = `rgba(177,241,248,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + dir * 22, y - 8, x + dir * 45, y + 2);
      ctx.stroke();
    }
  });
  ctx.restore();
}

function drawDoor(door, index) {
  const dir = index === 0 ? 1 : -1;
  const swing = ease(door.anim);
  const panelW = 16 + swing * 76;
  const x = door.x + dir * swing * 36;
  ctx.save();
  ctx.translate(x, door.y);
  ctx.scale(dir, 1);
  ctx.fillStyle = "rgba(20,28,38,.24)";
  roundedRect(-8 + swing * 4, -doorHalf + 8, panelW, doorHalf * 2 - 16, 8);
  ctx.fill();
  ctx.fillStyle = "#ddd2c2";
  roundedRect(-12, -doorHalf + 4, panelW, doorHalf * 2 - 16, 7);
  ctx.fill();
  ctx.strokeStyle = "rgba(73,67,61,.28)";
  ctx.lineWidth = 3;
  roundedRect(-7, -doorHalf + 13, Math.max(8, panelW - 10), doorHalf * 2 - 35, 5);
  ctx.stroke();
  ctx.fillStyle = "#ad8658";
  ctx.beginPath();
  ctx.arc(Math.max(0, panelW - 14), 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCat() {
  ctx.save();
  ctx.translate(cat.x, cat.y);
  ctx.rotate(cat.facing);

  ctx.fillStyle = "rgba(28,24,30,.24)";
  ctx.beginPath(); ctx.ellipse(-2, 12, 25, 10, 0, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = "#5b4439";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-17, 2);
  ctx.quadraticCurveTo(-31, -8 + Math.sin(cat.tail) * 6, -36, 9 + Math.cos(cat.tail * .8) * 7);
  ctx.stroke();

  ctx.fillStyle = "#775748";
  ctx.beginPath(); ctx.ellipse(0, 0, 24, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8c6854";
  ctx.beginPath(); ctx.arc(16, -3, 14, 0, Math.PI * 2); ctx.fill();

  ctx.beginPath();
  ctx.moveTo(10, -13); ctx.lineTo(13, -27); ctx.lineTo(20, -14); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(21, -14); ctx.lineTo(28, -25); ctx.lineTo(29, -10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#d59b89";
  ctx.beginPath(); ctx.moveTo(13, -15); ctx.lineTo(14, -22); ctx.lineTo(18, -15); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(23, -15); ctx.lineTo(27, -21); ctx.lineTo(27, -13); ctx.closePath(); ctx.fill();

  ctx.fillStyle = "#f0d86e";
  ctx.beginPath(); ctx.ellipse(20, -5, 2.7, 3.7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(27, -4, 2.7, 3.7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2a2927";
  ctx.fillRect(19.5, -7, 1, 5); ctx.fillRect(26.5, -6, 1, 5);
  ctx.fillStyle = "#e4a0a0";
  ctx.beginPath(); ctx.arc(30, 1, 2.2, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = "rgba(248,240,226,.72)";
  ctx.lineWidth = 1.2;
  for (const offset of [-3, 2, 7]) {
    ctx.beginPath(); ctx.moveTo(27, offset); ctx.lineTo(42, offset - 4); ctx.stroke();
  }
  ctx.restore();

  if (cat.state === "balcony") {
    const pct = clamp(rescueTimer / currentStage().rescue, 0, 1);
    ctx.save();
    ctx.translate(cat.x, cat.y - 38);
    ctx.fillStyle = "rgba(14,20,32,.84)";
    roundedRect(-38, -11, 76, 18, 9); ctx.fill();
    ctx.fillStyle = pct > .45 ? "#ffd06a" : "#ff6b6b";
    roundedRect(-35, -8, 70 * pct, 12, 6); ctx.fill();
    ctx.restore();
  }
}

function drawPlayer() {
  const speed = Math.hypot(player.vx, player.vy);
  const bob = Math.sin(elapsed * 11) * Math.min(2.5, speed / 80);
  ctx.save();
  ctx.translate(player.x, player.y + bob);
  ctx.rotate(player.facing);
  ctx.fillStyle = "rgba(26,27,38,.24)";
  ctx.beginPath(); ctx.ellipse(-2, 17, 26, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#253c60";
  ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3f6695";
  ctx.beginPath(); ctx.arc(5, -4, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f0c9a9";
  ctx.beginPath(); ctx.arc(11, -4, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1d2b3d";
  ctx.beginPath(); ctx.arc(13, -5, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#efb14e";
  ctx.beginPath(); ctx.arc(-6, 1, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawDust() {
  ctx.save();
  dust.forEach(p => {
    const y = room.top + ((p.y - room.top + elapsed * p.drift) % (room.bottom - room.top));
    const x = p.x + Math.sin(elapsed * .6 + p.phase) * 16;
    if (x < room.left || x > room.right) return;
    ctx.fillStyle = `rgba(255,245,213,${.10 + p.r * .04})`;
    ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

function drawCuriosity() {
  if (cat.state !== "room" || curiosity < 6) return;
  const pulse = 1 + Math.sin(elapsed * 4) * .08;
  ctx.save();
  ctx.translate(cat.x, cat.y - 45);
  ctx.scale(pulse, pulse);
  ctx.globalAlpha = .35 + curiosity / 160;
  ctx.fillStyle = curiosity > 76 ? "#ff8b69" : "#fff0ad";
  ctx.font = "800 19px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(curiosity > 76 ? "!" : "?", 0, 0);
  ctx.restore();
}

function drawVignette() {
  const danger = clamp((temperature - 30) / 5, 0, 1);
  const grad = ctx.createRadialGradient(W / 2, H / 2, 180, W / 2, H / 2, 720);
  grad.addColorStop(.45, "rgba(5,8,14,0)");
  grad.addColorStop(1, `rgba(${danger > .1 ? 92 : 7},${danger > .1 ? 24 : 10},${danger > .1 ? 22 : 18},${.28 + danger * .3})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (flash > 0) {
    ctx.fillStyle = `rgba(255,92,84,${flash * .16})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
  drawBackground();
  drawBalcony(doors[0].balcony, 0);
  drawBalcony(doors[1].balcony, 1);
  drawRoom();
  drawAirflow();
  drawDoor(doors[0], 0);
  drawDoor(doors[1], 1);
  drawDust();
  drawCuriosity();

  const entities = [
    { y: player.y, draw: drawPlayer },
    { y: cat.y, draw: drawCat },
  ].sort((a, b) => a.y - b.y);
  entities.forEach(e => e.draw());
  drawVignette();
  ctx.restore();
}

(() => {
  'use strict';

  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  const nativeGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
  const roles = new WeakMap();
  const enhanced = new WeakSet();
  const textureRoles = ['concrete', 'steel', 'green', 'gate', 'floor', 'ceiling'];
  const enemyRoles = ['guard', 'rifle', 'heavy', 'commander', 'guardDead', 'rifleDead', 'heavyDead', 'commanderDead', 'exit'];
  const pickupRoles = ['health', 'shells', 'bullets'];
  const weaponRoles = ['tokarev', 'trenchGun', 'ppsh'];
  let textureIndex = 0;
  let enemyIndex = 0;
  let pickupIndex = 0;
  let weaponIndex = 0;

  function registerRole(canvas) {
    if (roles.has(canvas)) return;
    if (canvas.width === 64 && canvas.height === 64) roles.set(canvas, textureRoles[textureIndex++] || 'texture');
    else if (canvas.width === 96 && canvas.height === 144) roles.set(canvas, enemyRoles[enemyIndex++] || 'enemy');
    else if (canvas.width === 72 && canvas.height === 80) roles.set(canvas, pickupRoles[pickupIndex++] || 'pickup');
    else if (canvas.width === 360 && canvas.height === 240) roles.set(canvas, weaponRoles[weaponIndex++] || 'weapon');
  }

  HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, options) {
    const context = nativeGetContext.call(this, type, options);
    if (type === '2d') registerRole(this);
    return context;
  };

  function drawStar(g, cx, cy, outer, inner, fill) {
    g.save();
    g.fillStyle = fill;
    g.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const radius = i % 2 ? inner : outer;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.fill();
    g.restore();
  }

  function drawLeninPoster(g) {
    g.save();
    g.fillStyle = 'rgba(5,4,3,.48)';
    g.fillRect(7, 7, 27, 43);
    const paper = g.createLinearGradient(8, 8, 32, 49);
    paper.addColorStop(0, '#bc3b31');
    paper.addColorStop(1, '#681713');
    g.fillStyle = paper;
    g.fillRect(8, 8, 24, 40);
    g.strokeStyle = '#d3ba79';
    g.lineWidth = 1;
    g.strokeRect(9.5, 9.5, 21, 37);
    g.fillStyle = '#e2cc96';
    g.beginPath();
    g.ellipse(20, 20, 5.2, 6.6, -.18, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(13, 36); g.quadraticCurveTo(20, 26, 28, 36); g.lineTo(29, 43); g.lineTo(11, 43); g.closePath(); g.fill();
    g.fillStyle = '#7b1c18';
    g.beginPath(); g.moveTo(17, 16); g.lineTo(22, 13); g.lineTo(25, 18); g.lineTo(22, 17); g.lineTo(25, 23); g.lineTo(21, 25); g.lineTo(17, 22); g.closePath(); g.fill();
    g.font = 'bold 4px sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#ead9a6';
    g.fillText('ЛЕНИН', 20, 46);
    g.globalAlpha = .34;
    g.fillStyle = '#2b120e';
    g.fillRect(8, 30, 24, 2);
    g.fillRect(13, 8, 2, 40);
    g.restore();
  }

  function drawBronzeRelief(g) {
    g.save();
    g.fillStyle = 'rgba(4,6,5,.55)';
    g.fillRect(35, 8, 23, 38);
    const bronze = g.createRadialGradient(45, 19, 2, 47, 27, 19);
    bronze.addColorStop(0, '#d2a657');
    bronze.addColorStop(.48, '#795326');
    bronze.addColorStop(1, '#2e2415');
    g.fillStyle = bronze;
    g.fillRect(36, 9, 21, 36);
    g.strokeStyle = '#d7b46a';
    g.strokeRect(37.5, 10.5, 18, 33);
    g.fillStyle = '#c29349';
    g.beginPath(); g.ellipse(46, 21, 4.8, 6.2, -.22, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(39, 37); g.quadraticCurveTo(46, 26, 54, 37); g.lineTo(54, 41); g.lineTo(38, 41); g.closePath(); g.fill();
    g.fillStyle = '#4f361c';
    g.beginPath(); g.moveTo(43, 17); g.lineTo(48, 14); g.lineTo(51, 20); g.lineTo(48, 19); g.lineTo(50, 24); g.lineTo(46, 26); g.lineTo(42, 23); g.closePath(); g.fill();
    g.restore();
  }

  function enhanceTexture(canvas, role) {
    const g = nativeGetContext.call(canvas, '2d');
    g.save();
    if (role === 'concrete') {
      g.fillStyle = 'rgba(18,15,12,.22)';
      for (let y = 3; y < 64; y += 16) g.fillRect(0, y, 64, 1);
      drawLeninPoster(g);
      g.fillStyle = 'rgba(111,28,22,.18)';
      g.fillRect(42, 0, 3, 64);
    } else if (role === 'steel') {
      g.fillStyle = 'rgba(235,207,132,.15)';
      g.fillRect(5, 45, 54, 9);
      for (let x = 5; x < 59; x += 12) {
        g.fillStyle = x % 24 === 5 ? 'rgba(18,14,12,.72)' : 'rgba(205,169,76,.55)';
        g.beginPath(); g.moveTo(x, 54); g.lineTo(x + 8, 45); g.lineTo(x + 13, 45); g.lineTo(x + 5, 54); g.closePath(); g.fill();
      }
      drawStar(g, 32, 24, 13, 5.4, 'rgba(211,174,73,.78)');
      g.fillStyle = 'rgba(26,12,10,.7)';
      g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.fillText('СССР', 32, 39);
    } else if (role === 'green') {
      drawBronzeRelief(g);
      g.fillStyle = 'rgba(211,178,86,.52)';
      g.fillRect(5, 51, 23, 2);
      g.font = 'bold 5px sans-serif'; g.textAlign = 'left'; g.fillText('МИР  ТРУД', 5, 59);
    } else if (role === 'gate') {
      drawStar(g, 32, 31, 18, 7.4, 'rgba(239,196,75,.52)');
      g.strokeStyle = 'rgba(255,221,130,.32)'; g.lineWidth = 2; g.strokeRect(4, 4, 56, 56);
    } else if (role === 'floor') {
      g.globalCompositeOperation = 'screen';
      const sheen = g.createLinearGradient(0, 0, 64, 64);
      sheen.addColorStop(0, 'rgba(144,114,79,0)');
      sheen.addColorStop(.5, 'rgba(174,133,83,.12)');
      sheen.addColorStop(1, 'rgba(144,114,79,0)');
      g.fillStyle = sheen; g.fillRect(0, 0, 64, 64);
    } else if (role === 'ceiling') {
      g.fillStyle = 'rgba(217,192,130,.16)';
      g.fillRect(20, 2, 24, 5);
      g.fillStyle = 'rgba(255,232,167,.12)';
      g.fillRect(25, 7, 14, 2);
    }
    g.restore();
  }

  function enhanceEnemy(canvas, role) {
    const g = nativeGetContext.call(canvas, '2d');
    if (role.endsWith('Dead') || role === 'exit') return;
    const commander = role === 'commander';
    const heavy = role === 'heavy';
    g.save();
    g.globalCompositeOperation = 'screen';
    const rim = g.createLinearGradient(20, 32, 78, 115);
    rim.addColorStop(0, 'rgba(221,211,170,.22)');
    rim.addColorStop(.45, 'rgba(255,255,255,0)');
    rim.addColorStop(1, 'rgba(166,39,34,.12)');
    g.fillStyle = rim;
    g.fillRect(26, 34, heavy ? 50 : 43, 82);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = commander ? '#d0ae55' : '#a52a2d';
    drawStar(g, 49, 19, 4.6, 1.9, g.fillStyle);
    g.fillStyle = '#23231f';
    g.fillRect(31, 67, 4, 38);
    g.fillRect(64, 67, 4, 38);
    g.fillStyle = commander ? '#c8a553' : '#77765c';
    g.fillRect(27, 83, 49, 4);
    g.fillStyle = '#c0a05b';
    g.fillRect(48, 82, 5, 6);
    g.strokeStyle = 'rgba(225,216,178,.2)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(31, 48); g.lineTo(47, 83); g.moveTo(67, 48); g.lineTo(53, 83); g.stroke();
    g.restore();
  }

  function enhancePickup(canvas, role) {
    const g = nativeGetContext.call(canvas, '2d');
    g.save();
    g.globalCompositeOperation = 'screen';
    const glow = g.createRadialGradient(36, 43, 3, 36, 43, 34);
    glow.addColorStop(0, role === 'health' ? 'rgba(220,74,67,.2)' : 'rgba(218,176,81,.18)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(0, 8, 72, 66);
    g.restore();
  }

  function enhanceWeapon(canvas, role) {
    const g = nativeGetContext.call(canvas, '2d');
    g.save();
    g.globalCompositeOperation = 'screen';
    const highlight = g.createLinearGradient(95, 40, 260, 190);
    highlight.addColorStop(0, 'rgba(235,229,203,.24)');
    highlight.addColorStop(.24, 'rgba(255,255,255,0)');
    highlight.addColorStop(.72, 'rgba(179,120,75,.1)');
    highlight.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = highlight;
    g.fillRect(92, 24, 190, 190);
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(217,207,171,.25)';
    g.lineWidth = 1.5;
    const scratches = role === 'ppsh' ? 14 : 9;
    for (let i = 0; i < scratches; i += 1) {
      const x = 122 + (i * 31) % 142;
      const y = 62 + (i * 17) % 91;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 9 + (i % 4) * 3, y - 2); g.stroke();
    }
    drawStar(g, role === 'ppsh' ? 233 : 191, role === 'trenchGun' ? 127 : 111, 5.4, 2.2, '#a52a2d');
    g.restore();
  }

  function enhanceCanvas(canvas) {
    if (!(canvas instanceof HTMLCanvasElement) || enhanced.has(canvas)) return;
    registerRole(canvas);
    const role = roles.get(canvas);
    if (!role) return;
    enhanced.add(canvas);
    if (textureRoles.includes(role)) enhanceTexture(canvas, role);
    else if (enemyRoles.includes(role)) enhanceEnemy(canvas, role);
    else if (pickupRoles.includes(role)) enhancePickup(canvas, role);
    else if (weaponRoles.includes(role)) enhanceWeapon(canvas, role);
  }

  CanvasRenderingContext2D.prototype.getImageData = function patchedGetImageData(...args) {
    enhanceCanvas(this.canvas);
    return nativeGetImageData.apply(this, args);
  };

  let presentationFrame = 0;
  function gradePresentedFrame(context) {
    presentationFrame += 1;
    const width = context.canvas.width;
    const height = context.canvas.height;
    context.save();
    context.globalCompositeOperation = 'screen';
    const redPractical = context.createRadialGradient(width * .08, height * .44, 0, width * .08, height * .44, width * .42);
    redPractical.addColorStop(0, 'rgba(112,24,21,.12)');
    redPractical.addColorStop(1, 'rgba(112,24,21,0)');
    context.fillStyle = redPractical; context.fillRect(0, 0, width, height);
    const warmCenter = context.createRadialGradient(width * .52, height * .52, 0, width * .52, height * .52, width * .48);
    warmCenter.addColorStop(0, 'rgba(185,149,92,.035)');
    warmCenter.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = warmCenter; context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'multiply';
    const cinematic = context.createLinearGradient(0, 0, 0, height);
    cinematic.addColorStop(0, 'rgba(15,18,21,.15)');
    cinematic.addColorStop(.48, 'rgba(255,255,255,1)');
    cinematic.addColorStop(1, 'rgba(35,25,20,.08)');
    context.fillStyle = cinematic; context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = 'rgba(0,0,0,.022)';
    for (let y = presentationFrame % 4; y < height; y += 4) context.fillRect(0, y, width, 1);
    context.restore();
  }

  CanvasRenderingContext2D.prototype.drawImage = function patchedDrawImage(source, ...args) {
    enhanceCanvas(source);
    const result = nativeDrawImage.call(this, source, ...args);
    const isFinalPresentation = this.canvas && this.canvas.id === 'game' &&
      source instanceof HTMLCanvasElement && source !== this.canvas &&
      source.width >= 600 && source.height >= 340;
    if (isFinalPresentation) gradePresentedFrame(this);
    return result;
  };
})();

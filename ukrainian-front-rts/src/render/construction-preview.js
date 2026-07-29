function previewColor(preview) {
  if (!preview?.valid) return 'rgba(210, 70, 60, 0.78)';
  if (preview.blocksPath) return 'rgba(224, 168, 58, 0.82)';
  return 'rgba(80, 190, 105, 0.78)';
}

function drawPreview(game, renderer, preview) {
  if (!preview?.origin || !preview?.footprint) return;
  const context = renderer.x;
  const zoom = game.camera.z;
  const tileSize = game.navigationState?.grid?.tileSize ?? 32;
  const topLeft = renderer.sp(
    preview.origin.x * tileSize,
    preview.origin.y * tileSize,
  );
  const width = preview.footprint.width * tileSize * zoom;
  const height = preview.footprint.height * tileSize * zoom;
  const color = previewColor(preview);

  context.save();
  context.fillStyle = color.replace(/0\.\d+\)$/, '0.22)');
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.setLineDash(preview.valid ? [] : [7, 5]);
  context.fillRect(topLeft.x, topLeft.y, width, height);
  context.strokeRect(topLeft.x + 0.5, topLeft.y + 0.5, width - 1, height - 1);

  context.lineWidth = 1;
  context.setLineDash([]);
  for (let x = 1; x < preview.footprint.width; x += 1) {
    const screenX = topLeft.x + x * tileSize * zoom;
    context.beginPath();
    context.moveTo(screenX, topLeft.y);
    context.lineTo(screenX, topLeft.y + height);
    context.stroke();
  }
  for (let y = 1; y < preview.footprint.height; y += 1) {
    const screenY = topLeft.y + y * tileSize * zoom;
    context.beginPath();
    context.moveTo(topLeft.x, screenY);
    context.lineTo(topLeft.x + width, screenY);
    context.stroke();
  }

  const text = preview.valid
    ? (preview.warning || `Valid ${preview.footprint.width}×${preview.footprint.height} footprint · R rotates`)
    : preview.message;
  context.font = 'bold 12px monospace';
  const textWidth = context.measureText(text).width;
  const labelX = topLeft.x + width / 2;
  const labelY = topLeft.y - 12;
  context.fillStyle = 'rgba(12, 17, 14, 0.88)';
  context.fillRect(labelX - textWidth / 2 - 7, labelY - 14, textWidth + 14, 20);
  context.fillStyle = '#f5e7ad';
  context.textAlign = 'center';
  context.fillText(text, labelX, labelY);
  context.restore();
}

export function installConstructionPreview({ game, renderer } = {}) {
  if (!game || typeof game.previewBuildingPlacement !== 'function') {
    throw new TypeError('Construction preview requires game.previewBuildingPlacement().');
  }
  if (!renderer || typeof renderer.render !== 'function' || !renderer.x || typeof renderer.sp !== 'function') {
    throw new TypeError('Construction preview requires a compatible renderer.');
  }

  const originalRender = renderer.render.bind(renderer);
  renderer.render = () => {
    if (game.pendingBuild) {
      game.previewBuildingPlacement(game.mouse.wx, game.mouse.wy);
    } else {
      game.pendingBuildPreview = null;
    }
    originalRender();
    drawPreview(game, renderer, game.pendingBuildPreview);
  };

  return () => {
    renderer.render = originalRender;
    game.pendingBuildPreview = null;
  };
}

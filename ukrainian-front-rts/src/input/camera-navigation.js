const DEFAULTS = Object.freeze({
  edgeScroll: true,
  middleDrag: true,
  bookmarks: true,
  focusSelected: true,
  edgeSize: 24,
  edgeSpeed: 620,
});

function centerCameraOn(game, x, y, viewport) {
  game.camera.x = viewport.width / 2 - x * game.camera.z;
  game.camera.y = viewport.height / 2 - y * game.camera.z;
}

export function selectedCenter(game) {
  const entities = game.selectedEntities().filter((entity) => entity.hp > 0);
  if (!entities.length) return null;
  return {
    x: entities.reduce((sum, entity) => sum + entity.x, 0) / entities.length,
    y: entities.reduce((sum, entity) => sum + entity.y, 0) / entities.length,
  };
}

export function createCameraNavigation(game, viewport, overrides = {}) {
  const settings = { ...DEFAULTS, ...overrides };
  const bookmarks = new Map();
  const pointer = { x: -1, y: -1, middleDown: false, lastX: 0, lastY: 0 };

  const api = {
    settings,
    pointer,
    update(deltaSeconds) {
      if (!settings.edgeScroll || pointer.middleDown || pointer.x < 0 || pointer.y < 0) return false;
      const width = viewport.width();
      const height = viewport.height();
      let dx = 0;
      let dy = 0;
      if (pointer.x <= settings.edgeSize) dx += 1;
      else if (pointer.x >= width - settings.edgeSize) dx -= 1;
      if (pointer.y <= settings.edgeSize) dy += 1;
      else if (pointer.y >= height - settings.edgeSize) dy -= 1;
      if (!dx && !dy) return false;
      const scale = settings.edgeSpeed * Math.max(0, deltaSeconds);
      game.camera.x += dx * scale;
      game.camera.y += dy * scale;
      return true;
    },
    pointerMove(event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (!settings.middleDrag || !pointer.middleDown) return false;
      game.camera.x += event.clientX - pointer.lastX;
      game.camera.y += event.clientY - pointer.lastY;
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      return true;
    },
    pointerDown(event) {
      if (!settings.middleDrag || event.button !== 1) return false;
      pointer.middleDown = true;
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      return true;
    },
    pointerUp(event) {
      if (event.button !== 1) return false;
      const changed = pointer.middleDown;
      pointer.middleDown = false;
      return changed;
    },
    pointerLeave() {
      pointer.x = -1;
      pointer.y = -1;
      pointer.middleDown = false;
    },
    focusSelected() {
      if (!settings.focusSelected) return false;
      const center = selectedCenter(game);
      if (!center) return false;
      centerCameraOn(game, center.x, center.y, { width: viewport.width(), height: viewport.height() });
      return true;
    },
    handleBookmark(event) {
      if (!settings.bookmarks) return null;
      const match = /^F([1-4])$/.exec(event.key);
      if (!match) return null;
      const slot = Number(match[1]);
      if (event.shiftKey) {
        bookmarks.set(slot, { ...game.camera });
        return { changed: true, message: `Camera bookmark ${slot} saved.` };
      }
      const saved = bookmarks.get(slot);
      if (!saved) return { changed: false, message: `Camera bookmark ${slot} is empty.` };
      Object.assign(game.camera, saved);
      return { changed: true, message: `Camera bookmark ${slot} recalled.` };
    },
  };

  return api;
}

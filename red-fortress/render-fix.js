(() => {
  'use strict';

  const displayCanvas = document.getElementById('game');
  if (!displayCanvas) return;

  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
  const displayContext = nativeGetContext.call(displayCanvas, '2d', { alpha: false });
  const sceneCanvas = document.createElement('canvas');
  sceneCanvas.width = displayCanvas.width;
  sceneCanvas.height = displayCanvas.height;
  const sceneContext = nativeGetContext.call(sceneCanvas, '2d', { alpha: false });

  displayContext.imageSmoothingEnabled = false;
  sceneContext.imageSmoothingEnabled = false;

  let frameShakeX = 0;
  let frameShakeY = 0;
  let waitingForFloorUpload = true;
  let framePending = false;

  const nativeTranslate = sceneContext.translate.bind(sceneContext);
  const nativePutImageData = sceneContext.putImageData.bind(sceneContext);

  sceneContext.translate = (x, y) => {
    if (waitingForFloorUpload && Number.isFinite(x) && Number.isFinite(y)) {
      frameShakeX += x;
      frameShakeY += y;
      return;
    }
    nativeTranslate(x, y);
  };

  sceneContext.putImageData = (...args) => {
    waitingForFloorUpload = false;
    nativePutImageData(...args);
  };

  const syncSceneSize = () => {
    const width = widthDescriptor.get.call(displayCanvas);
    const height = heightDescriptor.get.call(displayCanvas);
    if (sceneCanvas.width !== width) sceneCanvas.width = width;
    if (sceneCanvas.height !== height) sceneCanvas.height = height;
    sceneContext.imageSmoothingEnabled = false;
    displayContext.imageSmoothingEnabled = false;
  };

  Object.defineProperty(displayCanvas, 'width', {
    configurable: true,
    get: () => widthDescriptor.get.call(displayCanvas),
    set: (value) => {
      widthDescriptor.set.call(displayCanvas, value);
      syncSceneSize();
    }
  });

  Object.defineProperty(displayCanvas, 'height', {
    configurable: true,
    get: () => heightDescriptor.get.call(displayCanvas),
    set: (value) => {
      heightDescriptor.set.call(displayCanvas, value);
      syncSceneSize();
    }
  });

  const nativeDisplayGetContext = displayCanvas.getContext.bind(displayCanvas);
  displayCanvas.getContext = (type, options) => {
    if (type === '2d') return sceneContext;
    return nativeDisplayGetContext(type, options);
  };

  const present = () => {
    syncSceneSize();
    displayContext.setTransform(1, 0, 0, 1, 0, 0);
    displayContext.globalAlpha = 1;
    displayContext.globalCompositeOperation = 'source-over';
    displayContext.fillStyle = '#050506';
    displayContext.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    displayContext.drawImage(sceneCanvas, Math.round(frameShakeX), Math.round(frameShakeY));
    frameShakeX = 0;
    frameShakeY = 0;
    waitingForFloorUpload = true;
    framePending = false;
  };

  const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => nativeRequestAnimationFrame((timestamp) => {
    framePending = true;
    waitingForFloorUpload = true;
    frameShakeX = 0;
    frameShakeY = 0;
    callback(timestamp);
    present();
  });

  window.addEventListener('load', () => {
    if (!framePending) nativeRequestAnimationFrame(present);
  }, { once: true });
})();

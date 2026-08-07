const root = document.documentElement;
const viewport = document.querySelector('.viewport-wrap');
const briefing = document.querySelector('.briefing-card');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function setLookFromEvent(element, event, xName, yName) {
  const rect = element.getBoundingClientRect();
  const x = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  const y = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
  root.style.setProperty(xName, percent(x));
  root.style.setProperty(yName, percent(y));
  return { x, y };
}

if (viewport) {
  viewport.addEventListener('pointermove', (event) => {
    if (reducedMotion.matches) return;
    setLookFromEvent(viewport, event, '--look-x', '--look-y');
  }, { passive: true });

  viewport.addEventListener('pointerleave', () => {
    root.style.setProperty('--look-x', '50%');
    root.style.setProperty('--look-y', '42%');
  }, { passive: true });
}

if (briefing) {
  briefing.addEventListener('pointermove', (event) => {
    if (reducedMotion.matches || window.innerWidth <= 760) return;
    const { x, y } = setLookFromEvent(briefing, event, '--brief-x', '--brief-y');
    const tiltY = clamp((x - 0.5) * 2.3, -1.15, 1.15);
    const tiltX = clamp((0.5 - y) * 1.5, -0.75, 0.75);
    root.style.setProperty('--brief-tilt-x', `${tiltX.toFixed(2)}deg`);
    root.style.setProperty('--brief-tilt-y', `${tiltY.toFixed(2)}deg`);
  }, { passive: true });

  briefing.addEventListener('pointerleave', () => {
    root.style.setProperty('--brief-x', '50%');
    root.style.setProperty('--brief-y', '42%');
    root.style.setProperty('--brief-tilt-x', '0deg');
    root.style.setProperty('--brief-tilt-y', '0deg');
  }, { passive: true });
}

requestAnimationFrame(() => root.classList.add('visual-ready'));

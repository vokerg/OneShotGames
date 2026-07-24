"use strict";

function loop(now) {
  const dt = Math.min(.035, (now - last) / 1000 || 0);
  last = now;
  update(dt);
  draw();
  pressed.clear();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", event => {
  const blocked = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"];
  if (blocked.includes(event.code)) event.preventDefault();
  if (!keys.has(event.code)) pressed.add(event.code);
  keys.add(event.code);

  if (event.code === "KeyP" || event.code === "Escape") togglePause();
  if (event.code === "KeyR" && (mode === "won" || mode === "lost")) resetGame();
  if (event.code === "KeyM") {
    muted = !muted;
    ui.sound.textContent = muted ? "🔇" : "🔊";
  }
});
window.addEventListener("keyup", event => keys.delete(event.code));
window.addEventListener("blur", () => {
  keys.clear();
  if (mode === "playing") togglePause();
});

ui.start.addEventListener("click", () => {
  initAudio();
  if (mode === "paused") togglePause();
  else resetGame();
});
ui.sound.addEventListener("click", () => {
  muted = !muted;
  ui.sound.textContent = muted ? "🔇" : "🔊";
  if (!muted) tone(440, .08, "sine", .03, 80);
});

updateUI();
requestAnimationFrame(loop);

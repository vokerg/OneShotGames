import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const mount = document.querySelector("#game");
const intro = document.querySelector("#intro");
const startButton = document.querySelector("#start-button");
const errorPanel = document.querySelector("#webgl-error");

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
} catch (error) {
  console.error(error);
  errorPanel.classList.remove("hidden");
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
mount.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91c9ed);
scene.fog = new THREE.Fog(0x9bcbea, 72, 190);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 260);
camera.position.set(0, 1.72, 44);
camera.lookAt(0, 2.2, -40);
scene.add(camera);

const controls = new PointerLockControls(camera, document.body);
const clock = new THREE.Clock();
const colliders = [];
const pedestrians = [];
const keys = new Set();
let elapsed = 0;

const anisotropy = renderer.capabilities.getMaxAnisotropy();

const materials = {
  concrete: new THREE.MeshStandardMaterial({ color: 0xc8c6bd, roughness: 0.92 }),
  curb: new THREE.MeshStandardMaterial({ color: 0xe7e4dc, roughness: 0.9 }),
  asphalt: new THREE.MeshStandardMaterial({ color: 0x4f5559, roughness: 0.96 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x2f383c, roughness: 0.66, metalness: 0.34 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x78a9bb, roughness: 0.22, metalness: 0.08 }),
  treeTrunk: new THREE.MeshStandardMaterial({ color: 0x6d4b32, roughness: 1 }),
  whitewash: new THREE.MeshStandardMaterial({ color: 0xe8e5da, roughness: 1 }),
  leaves: new THREE.MeshStandardMaterial({ color: 0x4e7f3f, roughness: 0.9 }),
  leavesLight: new THREE.MeshStandardMaterial({ color: 0x699a50, roughness: 0.9 }),
  blueRoof: new THREE.MeshStandardMaterial({ color: 0x176eb0, roughness: 0.48, metalness: 0.12 }),
  cathedralWhite: new THREE.MeshStandardMaterial({ color: 0xd7f0ee, roughness: 0.8 }),
  cathedralBlue: new THREE.MeshStandardMaterial({ color: 0x2f98c9, roughness: 0.72 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd4a42a, roughness: 0.45, metalness: 0.5 }),
};

const hemi = new THREE.HemisphereLight(0xd9f1ff, 0x61704c, 2.25);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d8, 3.5);
sun.position.set(34, 58, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -95;
sun.shadow.camera.right = 95;
sun.shadow.camera.top = 95;
sun.shadow.camera.bottom = -95;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 160;
scene.add(sun);

function canvasTexture(width, height, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

function makePaverTexture() {
  const texture = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#b9ada0";
    ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 16; row += 1) {
      const y = row * 16;
      const offset = row % 2 === 0 ? 0 : 16;
      for (let x = -offset; x < 256; x += 32) {
        const shade = 168 + ((row * 11 + x) % 22);
        ctx.fillStyle = `rgb(${shade}, ${shade - 9}, ${shade - 16})`;
        ctx.fillRect(x + 1, y + 1, 30, 14);
      }
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 16);
  return texture;
}

function makeRoadTexture() {
  const texture = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#555c60";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4500; i += 1) {
      const value = 66 + Math.floor(Math.random() * 36);
      ctx.fillStyle = `rgb(${value}, ${value + 2}, ${value + 3})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 18);
  return texture;
}

function makeFacadeTexture(baseColor, windowColor = "#89aeb9", rows = 5, columns = 6) {
  return canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = "rgba(55, 45, 38, 0.12)";
    for (let i = 0; i < 70; i += 1) {
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 12, 1);
    }
    const marginX = 42;
    const marginY = 52;
    const cellW = (512 - marginX * 2) / columns;
    const cellH = (512 - marginY * 2) / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const x = marginX + col * cellW + cellW * 0.18;
        const y = marginY + row * cellH + cellH * 0.18;
        ctx.fillStyle = "rgba(30, 34, 34, 0.22)";
        ctx.fillRect(x - 5, y - 5, cellW * 0.64 + 10, cellH * 0.55 + 10);
        ctx.fillStyle = windowColor;
        ctx.fillRect(x, y, cellW * 0.64, cellH * 0.55);
        ctx.fillStyle = "rgba(235, 247, 244, 0.36)";
        ctx.fillRect(x + 3, y + 3, cellW * 0.23, cellH * 0.08);
        ctx.fillStyle = "rgba(45, 55, 58, 0.65)";
        ctx.fillRect(x + cellW * 0.31, y, 3, cellH * 0.55);
      }
    }
  });
}

function mesh(geometry, material, position, { cast = true, receive = true } = {}) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  object.castShadow = cast;
  object.receiveShadow = receive;
  scene.add(object);
  return object;
}

function addCollider(x, z, width, depth, padding = 0.45) {
  colliders.push({
    minX: x - width / 2 - padding,
    maxX: x + width / 2 + padding,
    minZ: z - depth / 2 - padding,
    maxZ: z + depth / 2 + padding,
  });
}

function box(width, height, depth, material, x, y, z, options) {
  return mesh(new THREE.BoxGeometry(width, height, depth), material, [x, y, z], options);
}

function createLabel(text, width = 7, height = 1.2, background = "#245f82", foreground = "#f7f1dd") {
  const texture = canvasTexture(768, 128, (ctx) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 768, 128);
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, 752, 112);
    ctx.fillStyle = foreground;
    ctx.font = "700 58px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 384, 68);
  });
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

function createBuilding({
  x,
  z,
  width,
  height,
  depth,
  color,
  windowColor = "#82a9b2",
  rows = 5,
  columns = 6,
  sign,
  signColor = "#2b6680",
  roof = "flat",
  front = "west",
}) {
  const texture = makeFacadeTexture(color, windowColor, rows, columns);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const facade = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.88 });
  const body = box(width, height, depth, facade, x, height / 2, z);
  addCollider(x, z, width, depth);

  if (roof === "flat") {
    box(width + 0.6, 0.45, depth + 0.6, materials.concrete, x, height + 0.2, z);
  } else {
    const roofGeometry = new THREE.ConeGeometry(Math.max(width, depth) * 0.67, 2.8, 4);
    const roofMesh = mesh(roofGeometry, materials.blueRoof, [x, height + 1.4, z]);
    roofMesh.rotation.y = Math.PI / 4;
  }

  if (sign) {
    const label = createLabel(sign, Math.min(width * 0.72, 12), 1.1, signColor);
    if (front === "west") {
      label.position.set(x - width / 2 - 0.03, 2.2, z);
      label.rotation.y = -Math.PI / 2;
    } else if (front === "east") {
      label.position.set(x + width / 2 + 0.03, 2.2, z);
      label.rotation.y = Math.PI / 2;
    } else if (front === "south") {
      label.position.set(x, 2.2, z + depth / 2 + 0.03);
    } else {
      label.position.set(x, 2.2, z - depth / 2 - 0.03);
      label.rotation.y = Math.PI;
    }
    label.castShadow = false;
    scene.add(label);
  }
  return body;
}

function createTree(x, z, scale = 1) {
  const group = new THREE.Group();
  const trunkLower = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * scale, 0.35 * scale, 1.35 * scale, 7), materials.whitewash);
  trunkLower.position.y = 0.68 * scale;
  trunkLower.castShadow = true;
  group.add(trunkLower);

  const trunkUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * scale, 0.28 * scale, 3.1 * scale, 7), materials.treeTrunk);
  trunkUpper.position.y = 2.85 * scale;
  trunkUpper.castShadow = true;
  group.add(trunkUpper);

  const crowns = [
    [-0.9, 4.6, 0.1, 1.8, materials.leaves],
    [0.85, 4.9, 0.25, 1.65, materials.leavesLight],
    [0, 5.55, -0.25, 1.95, materials.leaves],
    [0.2, 4.4, -0.9, 1.45, materials.leavesLight],
  ];
  for (const [cx, cy, cz, radius, material] of crowns) {
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(radius * scale, 0), material);
    crown.position.set(cx * scale, cy * scale, cz * scale);
    crown.castShadow = true;
    crown.receiveShadow = true;
    group.add(crown);
  }
  group.position.set(x, 0, z);
  scene.add(group);
  addCollider(x, z, 0.8 * scale, 0.8 * scale, 0.2);
}

function createLamp(x, z) {
  box(0.16, 5.1, 0.16, materials.darkMetal, x, 2.55, z);
  const cap = box(0.75, 0.18, 0.75, materials.darkMetal, x, 5.12, z);
  cap.rotation.y = Math.PI / 4;
  const lightMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.5, 0.42),
    new THREE.MeshStandardMaterial({ color: 0xffe4a4, emissive: 0xffd477, emissiveIntensity: 0.35 }),
  );
  lightMesh.position.set(x, 4.78, z);
  scene.add(lightMesh);
}

function createBench(x, z, rotation = 0) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x75472d, roughness: 0.9 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.62), wood);
  seat.position.y = 0.58;
  seat.castShadow = true;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.72, 0.16), wood);
  back.position.set(0, 0.93, -0.28);
  back.rotation.x = -0.12;
  back.castShadow = true;
  group.add(back);
  for (const lx of [-0.8, 0.8]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.65, 0.5), materials.darkMetal);
    leg.position.set(lx, 0.3, 0);
    group.add(leg);
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  scene.add(group);
}

function createWire(points) {
  const curvePoints = points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
  const material = new THREE.LineBasicMaterial({ color: 0x30393c, transparent: true, opacity: 0.72 });
  scene.add(new THREE.Line(geometry, material));
}

function createCathedral(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);

  function localBox(w, h, d, material, px, py, pz) {
    const item = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    item.position.set(px, py, pz);
    item.castShadow = true;
    item.receiveShadow = true;
    group.add(item);
    return item;
  }

  localBox(12, 6, 15, materials.cathedralWhite, 0, 3, 0);
  localBox(8.5, 4.8, 10, materials.cathedralBlue, 0, 7.2, 0);
  localBox(6.8, 3.2, 7.2, materials.cathedralWhite, 0, 11.1, 0);

  const drum = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.6, 2.8, 16), materials.cathedralWhite);
  drum.position.y = 14;
  drum.castShadow = true;
  group.add(drum);

  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.45, 0.16), materials.glass);
    window.position.set(Math.sin(angle) * 3.35, 14, Math.cos(angle) * 3.35);
    window.rotation.y = angle;
    group.add(window);
  }

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(3.9, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    materials.blueRoof,
  );
  dome.position.y = 15.45;
  dome.scale.y = 1.35;
  dome.castShadow = true;
  group.add(dome);

  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 8), materials.gold);
  finial.position.y = 20.55;
  group.add(finial);
  localBox(0.15, 2.1, 0.15, materials.gold, 0, 21.65, 0);
  localBox(1.15, 0.16, 0.15, materials.gold, 0, 22.1, 0);

  for (const side of [-1, 1]) {
    const wing = localBox(3.7, 4.1, 7.5, materials.cathedralWhite, side * 7.45, 3.1, 0.5);
    wing.rotation.z = 0;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.3, 2.3, 4), materials.blueRoof);
    roof.position.set(side * 7.45, 6.25, 0.5);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);
  }

  localBox(5.8, 4.4, 3.4, materials.cathedralWhite, 0, 3.3, 9.2);
  const entranceRoof = new THREE.Mesh(new THREE.ConeGeometry(3.5, 2.2, 4), materials.blueRoof);
  entranceRoof.position.set(0, 6.35, 9.2);
  entranceRoof.rotation.y = Math.PI / 4;
  group.add(entranceRoof);
  const door = localBox(2.3, 3.2, 0.25, new THREE.MeshStandardMaterial({ color: 0x7b4d2f }), 0, 2.2, 10.95);
  door.position.z = 10.96;

  addCollider(x, z, 27, 23, 0.7);
}

function createBellTower(x, z) {
  const stone = new THREE.MeshStandardMaterial({ color: 0xbdb6a8, roughness: 0.92 });
  box(6.6, 7.5, 6.6, stone, x, 3.75, z);
  box(5.25, 7, 5.25, stone, x, 11, z);
  box(4.2, 5.5, 4.2, stone, x, 17.1, z);

  for (const direction of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const clockFace = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 24),
      new THREE.MeshBasicMaterial({ color: 0xf4eee0 }),
    );
    clockFace.position.set(x + Math.sin(direction) * 2.12, 17.8, z + Math.cos(direction) * 2.12);
    clockFace.rotation.y = direction;
    if (direction === 0) clockFace.rotation.y = 0;
    if (direction === Math.PI) clockFace.rotation.y = Math.PI;
    scene.add(clockFace);
  }

  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 3.3, 3.3, 12), materials.concrete);
  roof.position.set(x, 21.3, z);
  roof.castShadow = true;
  scene.add(roof);
  box(0.13, 2.2, 0.13, materials.darkMetal, x, 23.75, z);
  box(1.1, 0.14, 0.13, materials.darkMetal, x, 24.2, z);
  addCollider(x, z, 7, 7, 0.5);
}

function createFountain(x, z) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.5, 0.55, 24), materials.concrete);
  base.position.set(x, 0.28, z);
  base.receiveShadow = true;
  scene.add(base);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(4.55, 4.55, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: 0x58a9c4, roughness: 0.16, metalness: 0.05 }),
  );
  water.position.set(x, 0.6, z);
  scene.add(water);
  const center = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 2.3, 12), materials.concrete);
  center.position.set(x, 1.55, z);
  center.castShadow = true;
  scene.add(center);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), materials.concrete);
  top.position.set(x, 2.9, z);
  top.castShadow = true;
  scene.add(top);
  addCollider(x, z, 10, 10, 0.25);
}

function createStatue(x, z) {
  box(2.5, 0.65, 2.5, materials.concrete, x, 0.33, z);
  box(1.55, 2.8, 1.55, new THREE.MeshStandardMaterial({ color: 0x77786f, roughness: 0.9 }), x, 2.05, z);
  const bronze = new THREE.MeshStandardMaterial({ color: 0x4c6659, roughness: 0.65, metalness: 0.35 });
  box(0.8, 2.25, 0.68, bronze, x, 4.5, z);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 8), bronze);
  head.position.set(x, 5.95, z);
  head.castShadow = true;
  scene.add(head);
  const arm = box(1.85, 0.28, 0.28, bronze, x + 0.75, 5.05, z);
  arm.rotation.z = 0.18;
  addCollider(x, z, 2.8, 2.8, 0.2);
}

function createPedestrian(path, colors, speed = 1.1, phase = 0) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: colors.skin, roughness: 0.9 });
  const shirt = new THREE.MeshStandardMaterial({ color: colors.shirt, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: colors.pants, roughness: 0.9 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), skin);
  head.position.y = 1.72;
  group.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.38), shirt);
  torso.position.y = 1.08;
  group.add(torso);
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.28), pants);
  const rightLeg = leftLeg.clone();
  leftLeg.position.set(-0.16, 0.38, 0);
  rightLeg.position.set(0.16, 0.38, 0);
  group.add(leftLeg, rightLeg);
  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  scene.add(group);
  pedestrians.push({ group, path, speed, phase, leftLeg, rightLeg });
}

const paverMaterial = new THREE.MeshStandardMaterial({ map: makePaverTexture(), roughness: 0.96 });
const plaza = mesh(new THREE.PlaneGeometry(72, 126), paverMaterial, [0, 0, -8], { cast: false, receive: true });
plaza.rotation.x = -Math.PI / 2;

const roadMaterial = new THREE.MeshStandardMaterial({ map: makeRoadTexture(), roughness: 0.98 });
for (const x of [-48, 48]) {
  const road = mesh(new THREE.PlaneGeometry(17, 145), roadMaterial, [x, -0.02, -8], { cast: false, receive: true });
  road.rotation.x = -Math.PI / 2;
  box(1, 0.25, 145, materials.curb, x + Math.sign(x) * -9, 0.12, -8, { cast: false });
}
const crossRoad = mesh(new THREE.PlaneGeometry(113, 15), roadMaterial, [0, -0.01, 42], { cast: false, receive: true });
crossRoad.rotation.x = -Math.PI / 2;

createBuilding({ x: -42, z: 14, width: 21, height: 18, depth: 29, color: "#bcb4aa", rows: 7, columns: 5, sign: "MAGAZIN", front: "east" });
createBuilding({ x: -42, z: -18, width: 18, height: 12, depth: 25, color: "#d5c7ad", rows: 4, columns: 4, sign: "FARMACIE", signColor: "#2f7658", front: "east" });
createBuilding({ x: -42, z: -49, width: 20, height: 20, depth: 28, color: "#b8b7ad", rows: 8, columns: 5, sign: "CAFEA", signColor: "#843b31", front: "east" });

createBuilding({ x: 42, z: 18, width: 23, height: 27, depth: 31, color: "#aaa8a2", rows: 10, columns: 6, sign: "BĂLȚI", signColor: "#2c5e89", front: "west" });
createBuilding({ x: 42, z: -17, width: 18, height: 13, depth: 24, color: "#d9c8bd", rows: 5, columns: 4, sign: "LIBRĂRIE", signColor: "#8b5d34", front: "west" });
createBuilding({ x: 43, z: -48, width: 22, height: 18, depth: 28, color: "#c5baa6", rows: 7, columns: 5, sign: "POȘTA", signColor: "#234d7a", front: "west" });

createBuilding({ x: 0, z: -82, width: 37, height: 13, depth: 15, color: "#d8c9a6", rows: 4, columns: 9, sign: "TEATRUL VASILE ALECSANDRI", signColor: "#74483b", front: "south" });
for (let x = -12; x <= 12; x += 4) {
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 6, 10), materials.concrete);
  column.position.set(x, 3.3, -73.9);
  column.castShadow = true;
  scene.add(column);
}

createCathedral(-20, -52);
createBellTower(23, -57);
createFountain(8, 2);
createStatue(-9, -7);

const squareLabel = createLabel("PIAȚA VASILE ALECSANDRI", 16, 1.4, "#255d79");
squareLabel.position.set(0, 3.5, 38.8);
scene.add(squareLabel);
box(0.22, 4, 0.22, materials.darkMetal, -7.5, 2, 38.8);
box(0.22, 4, 0.22, materials.darkMetal, 7.5, 2, 38.8);

for (const z of [34, 23, 12, 1, -10, -21, -33, -45]) {
  createTree(-29, z, 0.9 + ((z + 45) % 3) * 0.06);
  createTree(29, z + 3, 0.94);
}
for (const [x, z, scale] of [[-14, 25, 1.05], [17, 29, 0.95], [-18, -22, 1.1], [18, -27, 1], [-7, -39, 0.9]]) {
  createTree(x, z, scale);
}

for (const z of [31, 15, -1, -17, -33]) {
  createLamp(-24, z);
  createLamp(24, z - 3);
}

for (const [x, z, rotation] of [[-20, 18, 0], [20, 19, Math.PI], [-20, -16, 0], [19, -14, Math.PI], [-4, 14, Math.PI / 2]]) {
  createBench(x, z, rotation);
}

for (const z of [37, 19, 1, -17, -35, -53]) {
  createWire([[-48, 7.2, z], [-22, 7.7, z + 0.25], [0, 7.4, z], [22, 7.7, z - 0.25], [48, 7.2, z]]);
}
createWire([[-49, 8.5, 42], [0, 9.1, 42.5], [49, 8.5, 42]]);

const pedestrianPalette = [
  { skin: 0xd6a47e, shirt: 0x325d88, pants: 0x35383d },
  { skin: 0xc58f68, shirt: 0x8c4d40, pants: 0x263447 },
  { skin: 0xe0b28d, shirt: 0x547b4b, pants: 0x424044 },
  { skin: 0xb97d5c, shirt: 0xd4a94f, pants: 0x384b5a },
];
createPedestrian([[-17, 28], [-17, -28]], pedestrianPalette[0], 1.05, 0.1);
createPedestrian([[16, -30], [16, 27]], pedestrianPalette[1], 0.9, 0.42);
createPedestrian([[-4, 32], [19, -21]], pedestrianPalette[2], 0.82, 0.68);
createPedestrian([[22, 11], [-18, 5]], pedestrianPalette[3], 0.74, 0.28);
createPedestrian([[-24, -35], [20, -38]], pedestrianPalette[1], 0.66, 0.8);
createPedestrian([[11, 36], [-9, -12]], pedestrianPalette[0], 0.72, 0.55);

function isBlocked(x, z) {
  if (x < -67 || x > 67 || z < -90 || z > 58) return true;
  const radius = 0.38;
  return colliders.some((collider) =>
    x + radius > collider.minX &&
    x - radius < collider.maxX &&
    z + radius > collider.minZ &&
    z - radius < collider.maxZ
  );
}

function updatePlayer(delta) {
  if (!controls.isLocked) return;
  const inputX = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
  const inputZ = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
  if (inputX === 0 && inputZ === 0) return;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const direction = new THREE.Vector3();
  direction.addScaledVector(forward, inputZ);
  direction.addScaledVector(right, inputX);
  direction.normalize();

  const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 7.4 : 4.35;
  const nextX = camera.position.x + direction.x * speed * delta;
  const nextZ = camera.position.z + direction.z * speed * delta;
  if (!isBlocked(nextX, camera.position.z)) camera.position.x = nextX;
  if (!isBlocked(camera.position.x, nextZ)) camera.position.z = nextZ;
  camera.position.y = 1.72 + Math.sin(elapsed * 10.5) * 0.022;
}

function updatePedestrians(delta) {
  for (const pedestrian of pedestrians) {
    pedestrian.phase = (pedestrian.phase + delta * pedestrian.speed * 0.06) % 1;
    const pingPong = pedestrian.phase < 0.5 ? pedestrian.phase * 2 : (1 - pedestrian.phase) * 2;
    const [start, end] = pedestrian.path;
    const x = THREE.MathUtils.lerp(start[0], end[0], pingPong);
    const z = THREE.MathUtils.lerp(start[1], end[1], pingPong);
    pedestrian.group.position.set(x, Math.abs(Math.sin(elapsed * 5 * pedestrian.speed)) * 0.025, z);
    const direction = pedestrian.phase < 0.5 ? 1 : -1;
    pedestrian.group.rotation.y = Math.atan2((end[0] - start[0]) * direction, (end[1] - start[1]) * direction);
    const stride = Math.sin(elapsed * 7 * pedestrian.speed) * 0.38;
    pedestrian.leftLeg.rotation.x = stride;
    pedestrian.rightLeg.rotation.x = -stride;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  elapsed += delta;
  updatePlayer(delta);
  updatePedestrians(delta);
  renderer.render(scene, camera);
}

startButton.addEventListener("click", () => controls.lock());
renderer.domElement.addEventListener("click", () => {
  if (!controls.isLocked && intro.classList.contains("hidden")) controls.lock();
});
controls.addEventListener("lock", () => intro.classList.add("hidden"));
controls.addEventListener("unlock", () => intro.classList.remove("hidden"));

window.addEventListener("keydown", (event) => keys.add(event.code));
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

animate();

import * as THREE from 'three';
import { getWeapon } from './simulation.js';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const mixes = THREE.MathUtils.lerp;

function noise(x, z, salt = 0) {
  const value = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function color(value, fallback = '#969268') {
  return new THREE.Color(value || fallback);
}

function tone(value, amount) {
  return color(value).multiplyScalar(amount);
}

function createGeometries() {
  return {
    box: new THREE.BoxGeometry(),
    rock: new THREE.IcosahedronGeometry(0.62, 0),
    boulder: new THREE.DodecahedronGeometry(0.62, 0),
    jewel: new THREE.OctahedronGeometry(0.72, 0),
    column: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
    trunk: new THREE.CylinderGeometry(0.29, 0.51, 1, 6),
    tapered: new THREE.CylinderGeometry(0.29, 0.51, 1, 4),
    cone: new THREE.ConeGeometry(0.67, 1, 7),
    roof: new THREE.CylinderGeometry(0.05, 0.67, 1, 4),
    shadows: new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
  };
}

function createTerrain(world) {
  const edge = world.size / 2;
  const segments = world.mode === 'arena' ? 64 : 106;
  const step = world.size / segments;
  const samples = [];
  const cachedColors = new Map();
  const path = new THREE.Color();
  const mixed = new THREE.Color();
  const scratch = new THREE.Color();

  function groundAt(x, z) {
    const region = world.regionAt(x, z);
    if (!cachedColors.has(region.id)) {
      cachedColors.set(region.id, [color(region.ground), color(region.groundLight)]);
    }
    return cachedColors.get(region.id);
  }

  function sample(x, z) {
    const main = groundAt(x, z);
    path.set(world.regionAt(x, z).path || '#ac9365');
    const grain = noise(x, z, 9);
    const waves = 0.3 + Math.sin(x * 0.35 + z * 0.15) * 0.15 + grain * 0.24;
    mixed.copy(main[0]).lerp(main[1], waves);
    if (world.mode !== 'arena') {
      const neighbors = [
        groundAt(x - 3.9, z), groundAt(x + 3.9, z),
        groundAt(x, z - 3.9), groundAt(x, z + 3.9),
      ];
      for (const pair of neighbors) {
        if (pair !== main) mixed.lerp(scratch.copy(pair[0]).lerp(pair[1], waves), 0.19);
      }
    }
    mixed.lerp(path, (world.pathAt?.(x, z) || 0) * 0.46);
    return [x, world.height(x, z), z, mixed.r, mixed.g, mixed.b];
  }

  for (let row = 0; row <= segments; row += 1) {
    for (let col = 0; col <= segments; col += 1) {
      const outside = col === 0 || col === segments || row === 0 || row === segments;
      const x = col * step - edge + (outside ? 0 : (noise(col, row, 3) - 0.5) * step * 0.75);
      const z = row * step - edge + (outside ? 0 : (noise(col, row, 4) - 0.5) * step * 0.75);
      samples.push(sample(x, z));
    }
  }

  const positions = new Float32Array(segments * segments * 18);
  const colors = new Float32Array(positions.length);
  let offset = 0;

  function triangle(a, b, c, variation) {
    const shade = 0.92 + variation * 0.15;
    for (const i of [a, b, c]) {
      const item = samples[i];
      positions[offset] = item[0];
      colors[offset++] = item[3] * shade;
      positions[offset] = item[1];
      colors[offset++] = item[4] * shade;
      positions[offset] = item[2];
      colors[offset++] = item[5] * shade;
    }
  }

  for (let row = 0; row < segments; row += 1) {
    for (let col = 0; col < segments; col += 1) {
      const a = row * (segments + 1) + col;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      if ((row + col) % 2) {
        triangle(a, c, d, noise(col, row, 8));
        triangle(a, d, b, noise(col, row, 9));
      } else {
        triangle(a, c, b, noise(col, row, 8));
        triangle(b, c, d, noise(col, row, 9));
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

function createHorizon() {
  const geometry = new THREE.SphereGeometry(188, 24, 14);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: color('#426974') },
      haze: { value: color('#b4c2a4') },
      sunTint: { value: color('#f7db9d') },
    },
    vertexShader: `
      varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 skyDirection;
      uniform vec3 zenith;
      uniform vec3 haze;
      uniform vec3 sunTint;
      void main() {
        vec3 dir = normalize(skyDirection);
        vec3 sun = normalize(vec3(-0.68, 0.31, 0.42));
        float upper = pow(max(dir.y, 0.0), 0.68);
        float shine = max(dot(sun, dir), 0.0);
        vec3 tone = mix(haze, zenith, upper);
        tone = mix(tone, sunTint, pow(shine, 9.0) * 0.57);
        tone = mix(tone, vec3(1.0, 0.87, 0.58), smoothstep(0.9965, 0.998, shine) * 0.94);
        gl_FragColor = vec4(tone, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.renderOrder = -100;
  return sky;
}

function softShadowTexture() {
  const size = 32;
  const pixels = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const index = (row * size + col) * 4;
      const radius = Math.hypot((row + 0.5) / size - 0.5, (col + 0.5) / size - 0.5) * 2;
      pixels[index + 3] = Math.floor(255 * Math.max(0, 1 - radius * radius) ** 2);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function scenery(world, geometries, shadowMaterial) {
  const group = new THREE.Group();
  const instances = new Map();
  const transform = new THREE.Object3D();
  const shadows = [];

  function part(kind, paint, x, y, z, width, height, depth, yaw = 0, rx = 0, rz = 0) {
    const entries = instances.get(kind) || [];
    entries.push({ paint, x, y, z, width, height, depth, yaw, rx, rz });
    instances.set(kind, entries);
  }

  function propBuilder(prop) {
    const { x, z, rotation = 0 } = prop;
    const y = world.height(x, z) - 0.07;
    const sin = Math.sin(rotation);
    const cos = Math.cos(rotation);
    const place = (kind, paint, dx, dy, dz, width, height, depth, turn = 0, rx = 0, rz = 0) => {
      part(kind, paint, x + dx * cos + dz * sin, y + dy, z - dx * sin + dz * cos, width, height, depth, rotation + turn, rx, rz);
    };
    return { place, y };
  }

  for (const prop of world.props) {
    const { x, z, scale: s = 1, kind } = prop;
    const region = typeof prop.region === 'object' ? prop.region : world.regionAt(x, z);
    const biome = region.id;
    const rand = noise(x, z, 4);
    const stone = tone(region.stone, 0.86 + rand * 0.21);
    const leaves = tone(region.foliage, 0.76 + rand * 0.33);
    const accent = color(region.accent);
    const cloth = color(region.cloth, '#b77e4d');
    const trunk = color(biome === 'sunscar' ? '#765440' : '#554b3c');
    const { place, y } = propBuilder(prop);
    if (kind === 'tree') {
      if (biome.includes('sunscar') || region.buildingStyle === 'desert') {
        place('trunk', trunk, 0, 1.43 * s, 0, 0.27 * s, 2.86 * s, 0.27 * s, 0.3, 0.05, -0.08);
        for (let branch = 0; branch < 6; branch += 1) {
          const angle = branch * TAU / 6;
          place('cone', leaves, Math.sin(angle) * 0.45 * s, (2.84 + (branch % 2) * 0.12) * s, Math.cos(angle) * 0.45 * s, 0.32 * s, 1.35 * s, 0.22 * s, angle, Math.PI * 0.43);
        }
      } else if (biome.includes('glass')) {
        place('trunk', tone(stone, 0.55), 0, 1.1 * s, 0, 0.27 * s, 2.5 * s, 0.27 * s, 0, 0.1, -0.18);
        place('boulder', leaves, 0.09 * s, 2.3 * s, 0, 1.35 * s, 2.2 * s, 1.23 * s, 0, 0.1, 0.25);
        place('boulder', tone(leaves, 1.34), 0.25 * s, 2.96 * s, 0.06 * s, 0.71 * s, 1.28 * s, 0.63 * s, 0.5, 0.18, 0.12);
      } else if (biome.includes('frost') || rand > 0.52) {
        place('trunk', trunk, 0, 0.94 * s, 0, 0.34 * s, 1.9 * s, 0.34 * s);
        for (let layer = 0; layer < 3; layer += 1) {
          const width = (1.53 - layer * 0.33) * s;
          const height = (1.39 - layer * 0.04) * s;
          const green = tone(leaves, 0.90 + layer * 0.12);
          const dy = (1.55 + layer * 0.62) * s;
          place('cone', green, 0, dy, 0, width, height, width, layer * 0.45);
          if (biome.includes('frost')) {
            place('cone', color('#c9dfd6'), 0, dy + 0.13 * s, 0, width * 0.86, height * 0.87, width * 0.86, layer * 0.45);
          }
        }
      } else {
        place('trunk', trunk, 0, 1.05 * s, 0, 0.46 * s, 2.2 * s, 0.46 * s, 0, -0.08, 0.09);
        place('boulder', leaves, 0, 2.34 * s, 0, 1.9 * s, 1.59 * s, 1.74 * s);
        place('boulder', tone(leaves, 1.24), 0.32 * s, 2.96 * s, 0, 1.44 * s, 1.45 * s, 1.35 * s, 0.45);
        if (rand < 0.28) place('rock', tone(leaves, 0.84), -0.64 * s, 2.15 * s, -0.16 * s, 1.28 * s, 1.03 * s, 0.99 * s, 0.66);
      }
      shadows.push({ x, y, z, s: 1.25 * s });
    } else if (kind === 'rock') {
      place('boulder', stone, 0, 0.24 * s, 0, 1.38 * s, 0.94 * s, 1.04 * s, rand * 4, 0.2, 0.18);
      if (s > 0.76) {
        place('rock', tone(stone, 0.77), 0.5 * s, 0.12 * s, -0.21 * s, 0.62 * s, 0.53 * s, 0.62 * s, rand);
      }
    } else if (kind === 'tuft') {
      for (let blade = 0; blade < 3; blade += 1) {
        place('tapered', tone(leaves, 0.83 + blade * 0.19), (blade - 1) * 0.14 * s, 0.18 * s, (blade % 2) * 0.11 * s, 0.13 * s, (0.32 + 0.08 * blade) * s, 0.13 * s, blade, 0, (blade - 1) * 0.29);
      }
    } else if (kind === 'crystal') {
      place('rock', tone(stone, 0.68), 0, 0.18 * s, 0, 0.91 * s, 0.71 * s, 0.86 * s, rand);
      place('jewel', tone(accent, 1.11), 0, 0.74 * s, 0, 0.48 * s, 1.28 * s, 0.48 * s, 0.21, 0.18, 0.15);
      place('jewel', tone(accent, 0.72), -0.29 * s, 0.46 * s, 0.17 * s, 0.3 * s, 0.86 * s, 0.3 * s, 0.3, -0.14, 0.32);
    } else if (kind === 'wall') {
      const width = prop.width || 3 * s;
      const height = prop.height || 2.3 * s;
      const depth = prop.depth || 0.62 * s;
      place('box', tone(stone, 0.73), 0, height * 0.31, 0, width + 0.05, height * 0.82, depth);
      place('box', tone(stone, 0.95), 0, height * 0.7, 0, width + 0.05, height * 0.12, depth + 0.1);
      if (world.mode === 'arena') {
        place('box', tone(stone, 1.12), 0, height * 0.77, 0, width + 0.1, height * 0.12, depth + 0.14);
        place('box', tone(stone, 0.62), 0, height * 0.18, 0, width + 0.02, height * 0.19, depth + 0.14);
        for (const dx of [-0.42, 0.42]) {
          place('box', tone(stone, 0.91), width * dx, height * 0.47, 0, 0.22, height * 0.53, depth + 0.19);
        }
      } else if (biome.includes('glass')) {
        place('box', tone(stone, 0.55), 0, height * 0.82, 0, width + 0.06, height * 0.17, depth + 0.17);
        place('box', tone(accent, 0.94), 0, height * 0.82, 0, width, 0.058, depth + 0.18);
      } else {
        const teeth = Math.max(1, Math.round(width / 0.88));
        for (let tooth = 0; tooth < teeth; tooth += 1) {
          const dx = width * (0.5 / teeth + tooth / teeth - 0.5);
          place('box', stone, dx, height * 0.88, 0, Math.min(0.43, width / teeth * 0.72), height * 0.25, depth * 0.91);
        }
      }
    } else if (kind === 'tower' || kind === 'pillar') {
      const h = prop.height || (kind === 'tower' ? 3.8 : 3.1) * s;
      const width = prop.width || (kind === 'tower' ? 1.35 : 0.64) * s;
      const depth = prop.depth || width;
      place('box', tone(stone, 0.69), 0, 0.19 * h, 0, width * 1.13, h * 0.38, depth * 1.13);
      place('box', stone, 0, h * 0.59, 0, width, h * 0.69, depth);
      place('box', tone(stone, 1.21), 0, h * 0.9, 0, width * 1.17, h * 0.13, depth * 1.17);
      if (kind === 'tower') {
        place('box', tone(stone, 0.46), 0, h * 0.62, depth * 0.505, width * 0.13, h * 0.19, 0.03);
        for (const dx of [-0.34, 0.34]) {
          for (const dz of [-0.34, 0.34]) {
            place('box', tone(stone, 1.11), dx * width, h * 0.99, dz * depth, width * 0.32, h * 0.15, depth * 0.32);
          }
        }
        if (biome.includes('glass')) place('jewel', accent, 0, h * 1.16, 0, width * 0.38, h * 0.29, depth * 0.38);
      }
      shadows.push({ x, y, z, s: width * 0.85 });
    } else if (kind === 'building') {
      const w = prop.width || 2.6 * s;
      const h = prop.height || 2.15 * s;
      const d = prop.depth || 2.45 * s;
      const paint = tone(stone, 1.02);
      const dark = tone(stone, 0.42);
      place('box', tone(stone, 0.68), 0, 0.12, 0, w * 1.04, 0.36, d * 1.04);
      place('box', paint, 0, h * 0.45, 0, w, h * 1.03, d);
      place('box', dark, 0, h * 0.24, d * 0.51, w * 0.24, h * 0.57, 0.06);
      place('box', tone(accent, 0.73), 0, h * 0.57, d * 0.52, w * 0.31, h * 0.07, 0.09);
      for (const dx of [-0.32, 0.32]) {
        place('box', dark, w * dx, h * 0.57, d * 0.51, w * 0.12, h * 0.19, 0.055);
      }
      if (biome.includes('sunscar')) {
        place('box', tone(stone, 1.22), 0, h, 0, w * 1.12, h * 0.17, d * 1.12);
        place('box', tone(stone, 0.81), 0, h * 1.13, 0, w * 0.62, h * 0.16, d * 0.61);
        place('column', tone(accent, 0.73), -w * 0.29, h * 0.48, d * 0.62, 0.21, h, 0.21);
        place('column', tone(accent, 0.73), w * 0.29, h * 0.48, d * 0.62, 0.21, h, 0.21);
      } else if (biome.includes('glass')) {
        place('box', tone(stone, 0.66), 0, h, 0, w * 1.09, h * 0.17, d * 1.08);
        place('box', tone(accent, 1.13), 0, h * 0.91, 0, w * 1.02, h * 0.07, d * 1.02);
        place('box', tone(stone, 0.55), w * 0.24, h * 1.35, -d * 0.22, 0.11, h * 0.61, 0.11);
        place('jewel', accent, w * 0.24, h * 1.68, -d * 0.22, 0.19, 0.28, 0.19);
      } else {
        const roof = color(biome.includes('frost') ? '#598291' : '#80563e');
        place('roof', roof, 0, h * 1.12, 0, w * 1.28, h * 0.48, d * 1.28, Math.PI / 4);
        if (biome.includes('frost')) {
          place('roof', color('#d8ebe2'), 0, h * 1.225, 0, w * 0.98, h * 0.32, d * 0.98, Math.PI / 4);
          place('box', tone(stone, 0.48), -w * 0.22, h * 1.26, d * 0.16, 0.22, h * 0.55, 0.22);
        }
      }
      shadows.push({ x, y, z, s: Math.max(w, d) * 0.64 });
    } else if (kind === 'banner') {
      const height = prop.height || (world.mode === 'arena' ? 3.9 : 3.15) * s;
      const beam = tone(stone, 0.38);
      place('column', beam, 0, height * 0.52, 0, 0.075 * s, height, 0.075 * s);
      place('box', beam, 0, height * 0.96, 0, 0.95 * s, 0.065 * s, 0.065 * s);
      place('box', cloth, 0, height * 0.81, 0.01, 0.77 * s, height * 0.31, 0.055 * s);
      place('box', tone(cloth, 0.75), 0, height * 0.67, 0.022, 0.77 * s, 0.065 * s, 0.06 * s);
      place('box', tone(accent, 1.36), 0, height * 0.81, 0.05, 0.235 * s, 0.235 * s, 0.018, 0, 0, Math.PI / 4);
    } else if (kind === 'ruin') {
      const width = prop.width || 1.15 * s;
      const height = prop.height || 1.19 * s;
      const depth = prop.depth || 0.75 * s;
      place('box', stone, 0, height * 0.23, 0, width, height * 0.54, depth, 0, 0.03, -0.07);
      place('box', tone(stone, 0.79), -width * 0.19, height * 0.58, 0.09, width * 0.62, height * 0.43, depth * 0.74, 0.28, -0.04, 0.19);
      place('rock', tone(stone, 1.12), width * 0.43, height * 0.12, depth * 0.66, width * 0.55, height * 0.48, depth * 0.72, 0.34);
    }
  }

  if (world.mode === 'arena') {
    const sand = new THREE.MeshBasicMaterial({ color: '#ad8b4c', opacity: 0.51, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const rings = [[4.04, 4.12, 72], [1.08, 1.21, 4]];
    for (const [inside, outside, sides] of rings) {
      const geometry = new THREE.RingGeometry(inside, outside, sides).rotateX(-Math.PI / 2);
      const positions = geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        const x = positions.getX(index);
        const z = positions.getZ(index);
        positions.setY(index, world.height(x, z) + 0.032);
      }
      group.add(new THREE.Mesh(geometry, sand));
    }
  }

  for (const [kind, entries] of instances) {
    const material = new THREE.MeshLambertMaterial();
    const batch = new THREE.InstancedMesh(geometries[kind], material, entries.length);
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      transform.position.set(entry.x, entry.y, entry.z);
      transform.rotation.set(entry.rx, entry.yaw, entry.rz);
      transform.scale.set(entry.width, entry.height, entry.depth);
      transform.updateMatrix();
      batch.setMatrixAt(i, transform.matrix);
      batch.setColorAt(i, entry.paint);
    }
    batch.computeBoundingSphere();
    group.add(batch);
  }

  if (shadows.length) {
    const mesh = new THREE.InstancedMesh(geometries.shadows, shadowMaterial, shadows.length);
    shadows.forEach(({ x, z, s }, index) => {
      transform.position.set(x + 0.24 * s, world.height(x + 0.24 * s, z - 0.18 * s) + 0.08, z - 0.18 * s);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(s, 1, s);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  return group;
}

function backdrop(world, geometries) {
  const group = new THREE.Group();
  const radius = world.size * 0.5;
  const material = new THREE.MeshLambertMaterial({ flatShading: true });
  const peaks = new THREE.InstancedMesh(geometries.rock, material, 38);
  const dummy = new THREE.Object3D();
  const horizonScale = world.mode === 'arena' ? 0.57 : 1;
  for (let i = 0; i < 38; i += 1) {
    const angle = i * TAU / 38;
    const radial = radius * 1.24 + (12 + noise(i, 3) * 19) * horizonScale;
    const height = (14 + noise(i, 14) * 18) * horizonScale;
    const x = Math.sin(angle) * radial;
    const z = Math.cos(angle) * radial;
    dummy.position.set(x, -5.1, z);
    dummy.rotation.set(0.35, angle, noise(i, 8) * 0.73 - 0.35);
    dummy.scale.set((11 + noise(i, 9) * 13) * horizonScale, height, (14 + noise(i, 11) * 11) * horizonScale);
    dummy.updateMatrix();
    peaks.setMatrixAt(i, dummy.matrix);
    const region = world.regionAt(clamp(x, -radius + 0.01, radius - 0.01), clamp(z, -radius + 0.01, radius - 0.01));
    peaks.setColorAt(i, color(region.stone).lerp(color('#8b9c8c'), 0.63));
  }
  peaks.computeBoundingSphere();
  group.add(peaks);

  const cloudMaterial = new THREE.MeshBasicMaterial({ color: '#dfddbc', transparent: true, opacity: 0.23, depthWrite: false, fog: false });
  const clouds = new THREE.InstancedMesh(geometries.boulder, cloudMaterial, 28);
  for (let i = 0; i < 28; i += 1) {
    const cluster = Math.floor(i / 4);
    const angle = cluster * TAU / 7 + 0.23;
    const radial = 96 + noise(cluster, 14) * 18;
    dummy.position.set(Math.sin(angle) * radial + (i % 4 - 1) * 5, 22 + noise(cluster, 6) * 14 + noise(i, 71) * 4, Math.cos(angle) * radial);
    dummy.rotation.set(0, noise(i, 4), 0.1);
    dummy.scale.set(14 + noise(i, 4) * 11, 1.4 + noise(i, 2) * 2.8, 5 + noise(i, 1) * 6);
    dummy.updateMatrix();
    clouds.setMatrixAt(i, dummy.matrix);
  }
  clouds.computeBoundingSphere();
  group.add(clouds);
  return group;
}

function meshPart(parent, geometry, material, x, y, z, width, height, depth, rz = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  mesh.rotation.z = rz;
  parent.add(mesh);
  return mesh;
}

function lambert(paint) {
  return new THREE.MeshLambertMaterial({ color: paint });
}

function luminous(paint) {
  return new THREE.MeshBasicMaterial({ color: paint });
}

function makeActorRig(geometries, region, team, arena, shadowMaterial) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const cloth = lambert(arena ? (team === 0 ? '#456b65' : '#994b3d') : region.cloth);
  const trim = lambert(arena ? (team === 0 ? '#83b7a6' : '#eca16c') : region.accent);
  const armor = lambert(region.armor);
  const dark = lambert('#34373a');
  const leather = lambert('#493b35');
  const skin = lambert(region.skin);
  const brightArmor = lambert(tone(region.armor, 1.38));
  const box = geometries.box;
  const hideInFirstPerson = [];
  const staticPart = (...args) => {
    const item = meshPart(body, ...args);
    hideInFirstPerson.push(item);
    return item;
  };

  staticPart(box, cloth, 0, 1.25, 0.015, 0.59, 0.71, 0.39);
  staticPart(box, armor, 0, 1.52, 0.02, 0.69, 0.3, 0.46);
  staticPart(box, dark, 0, 1.19, -0.213, 0.54, 0.34, 0.06);
  staticPart(box, leather, 0, 1.08, 0.005, 0.6, 0.11, 0.43);
  staticPart(box, trim, 0, 1.08, 0.23, 0.15, 0.12, 0.05);
  staticPart(box, trim, 0.08, 1.43, 0.26, 0.11, 0.11, 0.025, Math.PI / 4);
  staticPart(box, trim, 0, 1.48, -0.25, 0.21, 0.21, 0.028, Math.PI / 4);
  const cape = staticPart(box, cloth, 0, 1.03, -0.26, 0.56, 0.91, 0.075);
  staticPart(box, skin, 0, 1.86, 0.015, 0.37, 0.37, 0.35);
  staticPart(box, dark, -0.09, 1.89, 0.195, 0.062, 0.027, 0.012);
  staticPart(box, dark, 0.09, 1.89, 0.195, 0.062, 0.027, 0.012);

  switch (region.id) {
    case 'glassreach':
      staticPart(box, armor, 0, 1.91, -0.012, 0.45, 0.47, 0.41);
      staticPart(box, dark, 0, 1.94, 0.201, 0.33, 0.15, 0.022);
      staticPart(box, trim, 0, 1.952, 0.221, 0.26, 0.046, 0.035);
      staticPart(box, brightArmor, 0.112, 1.878, -0.25, 0.12, 0.39, 0.09);
      break;
    case 'frostfall':
      staticPart(box, cloth, 0, 2.028, -0.014, 0.41, 0.145, 0.41);
      staticPart(box, brightArmor, 0, 1.929, 0.213, 0.39, 0.104, 0.044);
      staticPart(box, dark, 0, 1.934, 0.241, 0.29, 0.061, 0.02);
      staticPart(box, trim, -0.113, 1.937, 0.254, 0.12, 0.038, 0.025);
      staticPart(box, trim, 0.113, 1.937, 0.254, 0.12, 0.038, 0.025);
      break;
    case 'sunscar':
      staticPart(box, brightArmor, 0, 2.009, -0.018, 0.43, 0.155, 0.38);
      staticPart(box, armor, 0, 2.14, -0.011, 0.12, 0.17, 0.35);
      staticPart(box, trim, -0.209, 1.863, 0.006, 0.065, 0.28, 0.24);
      staticPart(box, trim, 0.209, 1.863, 0.006, 0.065, 0.28, 0.24);
      break;
    default:
      staticPart(box, armor, 0, 1.991, -0.019, 0.43, 0.2, 0.42);
      staticPart(box, brightArmor, 0, 1.907, 0.207, 0.35, 0.061, 0.039);
      staticPart(box, armor, 0, 1.799, 0.202, 0.31, 0.145, 0.045);
      staticPart(box, trim, 0, 1.998, -0.24, 0.11, 0.17, 0.025);
      break;
  }

  const legs = [];
  const arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.185, 0.93, 0);
    staticPart(box, dark, side * 0.18, 0.94, 0, 0.22, 0.22, 0.27);
    meshPart(leg, box, cloth, 0, -0.24, 0.025, 0.23, 0.47, 0.28);
    meshPart(leg, box, leather, 0, -0.603, 0.02, 0.2, 0.34, 0.26);
    meshPart(leg, box, armor, 0, -0.509, 0.123, 0.22, 0.26, 0.08);
    meshPart(leg, box, leather, 0, -0.835, 0.113, 0.245, 0.17, 0.42);
    body.add(leg);
    hideInFirstPerson.push(leg);
    legs.push(leg);

    const top = meshPart(body, box, armor, 0, 0, 0, 1, 1, 1);
    const bottom = meshPart(body, box, cloth, 0, 0, 0, 1, 1, 1);
    const hand = meshPart(body, box, leather, 0, 0, 0, 0.15, 0.16, 0.13);
    const shoulder = staticPart(geometries.boulder, armor, side * 0.394, 1.535, 0.01, 0.33, 0.3, 0.39);
    arms.push({ top, bottom, hand, shoulder });
  }

  const weapons = new THREE.Group();
  body.add(weapons);
  const shadow = new THREE.Mesh(geometries.shadows, shadowMaterial);
  shadow.scale.set(0.58, 1, 0.66);
  shadow.position.y = 0.036;
  root.add(shadow);

  const helm = new THREE.Group();
  helm.position.y = 2.48;
  const healthBg = meshPart(helm, box, luminous('#252b2a'), 0, 0, 0, 0.69, 0.057, 0.025);
  const healthFg = meshPart(helm, box, luminous('#f4ad6c'), 0, 0, 0.023, 0.66, 0.031, 0.024);
  root.add(helm);

  const trails = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ color: '#f2d79e', transparent: true, side: THREE.DoubleSide, opacity: 0, depthWrite: false }),
  );
  trails.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 18), 3).setUsage(THREE.DynamicDrawUsage));
  trails.frustumCulled = false;
  root.add(trails);

  return { root, body, cape, arms, legs, weapons, weaponId: null, helm, healthBg, healthFg, trails, hideInFirstPerson, health: null, initial: true, stepPhase: 0 };
}

function makeWeapon(parent, geometries, weapon) {
  const handle = lambert('#473932');
  const guard = lambert(weapon.id === 'bronze-sword' ? '#a16b3e' : '#6a6c69');
  const steel = weapon.id === 'plasma-blade' ? luminous(weapon.color) : lambert(weapon.color);
  const edge = luminous(weapon.id === 'plasma-blade' ? '#d2fff3' : tone(weapon.color, 1.11));
  const box = geometries.box;
  meshPart(parent, box, handle, 0, 0.038, 0, 0.089, 0.33, 0.093, 0);
  meshPart(parent, geometries.boulder, guard, 0, -0.146, 0, 0.137, 0.153, 0.118);

  if (weapon.id === 'iron-axe') {
    meshPart(parent, box, handle, 0, 0.63, 0, 0.083, 1.29, 0.083);
    meshPart(parent, box, guard, 0, 1.26, 0, 0.22, 0.21, 0.13);
    meshPart(parent, box, steel, 0.22, 1.235, 0, 0.39, 0.29, 0.113, 0.19);
    meshPart(parent, box, steel, 0.42, 1.221, 0, 0.18, 0.45, 0.117, 0.12);
    meshPart(parent, box, edge, 0.515, 1.218, 0.006, 0.039, 0.438, 0.108, 0.12);
    return;
  }

  const length = weapon.id === 'steel-longsword' ? 1.64 : weapon.id === 'plasma-blade' ? 1.37 : 1.05;
  const width = weapon.id === 'bronze-sword' ? 0.17 : 0.13;
  meshPart(parent, box, guard, 0, 0.21, 0, width * 2.44, 0.087, 0.114);
  meshPart(parent, box, steel, 0, 0.245 + length * 0.45, 0, width, length * 0.9, 0.051);
  meshPart(parent, box, edge, 0.011, 0.246 + length * 0.451, 0.029, width * 0.18, length * 0.895, 0.019);
  meshPart(parent, geometries.tapered, steel, 0, 0.24 + length * 0.94, 0, width * 1.45, length * 0.21, 0.077, 0);
}

const joint = new THREE.Vector3();
const shoulderPoint = new THREE.Vector3();
const elbowPoint = new THREE.Vector3();
const handPoint = new THREE.Vector3();
const bladeDirection = new THREE.Vector3();

function positionLimb(mesh, a, b, width) {
  joint.subVectors(b, a);
  const distance = joint.length();
  mesh.position.copy(a).lerp(b, 0.5);
  mesh.scale.set(width, distance + 0.055, width);
  mesh.quaternion.setFromUnitVectors(UP, joint.normalize());
}

function poseActor(rig, actor, world, weapon, dt, firstPerson) {
  const blend = 1 - Math.exp(-23 * dt);
  const elevation = world.height(actor.x, actor.z);
  const facing = actor.facing || 0;
  if (rig.initial || Math.hypot(rig.root.position.x - actor.x, rig.root.position.z - actor.z) > 5) {
    rig.root.position.set(actor.x, elevation, actor.z);
    rig.root.rotation.y = facing;
    rig.initial = false;
  } else {
    const deltaYaw = Math.atan2(Math.sin(facing - rig.root.rotation.y), Math.cos(facing - rig.root.rotation.y));
    rig.root.position.x = mixes(rig.root.position.x, actor.x, blend);
    rig.root.position.y = mixes(rig.root.position.y, elevation, blend);
    rig.root.position.z = mixes(rig.root.position.z, actor.z, blend);
    rig.root.rotation.y += deltaYaw * blend;
  }

  const speed = clamp((actor.speed || 0) / 7, 0, 1.25);
  rig.stepPhase += dt * (2.5 + speed * 9.5);
  const stride = Math.sin(rig.stepPhase) * speed * 0.59;
  const bob = Math.abs(Math.cos(rig.stepPhase)) * Math.min(0.085, speed * 0.09);
  rig.legs[0].rotation.x = stride;
  rig.legs[1].rotation.x = -stride;
  rig.body.position.y = bob;
  rig.cape.rotation.x = -speed * 0.42 - stride * 0.15;
  rig.root.visible = actor.alive !== false && actor.health > 0;

  const phase = actor.swing;
  const active = phase >= 0;
  const impactStart = weapon.windup / (weapon.windup + weapon.swing + weapon.recovery);
  const impactEnd = (weapon.windup + weapon.swing) / (weapon.windup + weapon.swing + weapon.recovery);
  const swingProgress = clamp((phase - impactStart) / (impactEnd - impactStart), 0, 1);
  const preparation = clamp(phase / impactStart, 0, 1);
  const settle = clamp((phase - impactEnd) / (1 - impactEnd), 0, 1);
  const swingX = actor.swingX || 0;
  const swingY = actor.swingY || 0;
  const aimX = actor.aimX || 0;
  const aimY = actor.aimY || 0;
  const direction = swingX > 0.03 ? -1 : 1;
  const vertical = Math.abs(swingY) > Math.abs(swingX) * 1.2;
  let handX = 0.48 + aimX * 0.22;
  let handY = 1.25 + aimY * 0.36;
  let handZ = 0.36 + stride * 0.055;
  bladeDirection.set(aimX * 0.56 + 0.17, 0.85 + aimY * 0.55, 0.48);
  if (active) {
    const weight = 1 - settle;
    const arc = swingProgress * Math.PI;
    const sweep = Math.cos(arc) * direction;
    const forward = Math.sin(arc);
    handX = mixes(handX, vertical ? 0.37 + swingX * 0.19 : sweep * -0.58 + 0.06, preparation * weight);
    handY = mixes(handY, vertical ? (swingY < 0 ? 1.29 + forward * 0.66 : 1.81 - swingProgress * 0.63) : 1.28 + swingY * 0.35, preparation * weight);
    handZ = mixes(handZ, 0.13 + forward * 0.62, preparation * weight);
    bladeDirection.lerp(bladeDirectionScratch.set(vertical ? 0.12 - swingX * 0.46 : sweep * -0.98, vertical ? (swingY < 0 ? -0.48 + swingProgress * 1.24 : 0.93 - swingProgress * 1.54) : 0.13 + swingY * 0.37, (vertical ? 0.33 : 0.17) + forward * 0.84), preparation * weight);
  } else if (actor.guarding) {
    handX = 0.14 + aimX * 0.16;
    handY = 1.52 + aimY * 0.18;
    handZ = 0.54;
    bladeDirection.set(-0.82, 0.54 + aimY * 0.25, 0.08);
  }

  for (let index = 0; index < 2; index += 1) {
    const arm = rig.arms[index];
    const side = index ? 1 : -1;
    shoulderPoint.set(side * 0.375, 1.55, 0.012);
    if (index) {
      elbowPoint.set(mixes(shoulderPoint.x, handX, 0.51) + 0.125, mixes(shoulderPoint.y, handY, 0.53) - 0.12, handZ * 0.39 - 0.045);
      handPoint.set(handX, handY, handZ);
    } else if (actor.guarding) {
      elbowPoint.set(-0.53, 1.35, 0.22);
      handPoint.set(-0.28, 1.62 + aimY * 0.14, 0.49);
    } else {
      elbowPoint.set(-0.466, 1.21 + speed * 0.1, -0.03 - stride * 0.22);
      handPoint.set(-0.433, 0.96 + speed * 0.21, 0.08 - stride * 0.38);
    }
    shoulderPoint.x *= -1;
    elbowPoint.x *= -1;
    handPoint.x *= -1;
    positionLimb(arm.top, shoulderPoint, elbowPoint, 0.183);
    positionLimb(arm.bottom, elbowPoint, handPoint, 0.144);
    arm.hand.position.copy(handPoint);
  }

  rig.weapons.position.set(-handX, handY, handZ);
  bladeDirection.x *= -1;
  rig.weapons.quaternion.setFromUnitVectors(UP, bladeDirection.normalize());
  rig.hideInFirstPerson.forEach((part) => { part.visible = !firstPerson; });

  const ratio = clamp(actor.health / actor.maxHealth, 0, 1);
  rig.healthFg.scale.x = ratio * 0.66;
  rig.healthFg.position.x = (ratio - 1) * 0.33;
  drawTrail(rig, weapon, active, swingProgress, direction, vertical, swingY);
}

const bladeDirectionScratch = new THREE.Vector3();

function drawTrail(rig, weapon, active, swingProgress, direction, vertical, swingY) {
  const visible = active && swingProgress > 0 && swingProgress < 1;
  rig.trails.visible = visible;
  if (!visible) return;
  const attribute = rig.trails.geometry.getAttribute('position');
  const indices = [0, 1, 2, 2, 1, 3];
  const end = swingProgress;
  const start = Math.max(0, end - 0.29);
  const impact = (1 - Math.abs(0.51 - swingProgress) * 1.72);
  rig.trails.material.opacity = impact * 0.48;
  rig.trails.material.color.set(weapon.color);
  for (let index = 0; index < 24; index += 1) {
    const a = mixes(start, end, index / 24);
    const b = mixes(start, end, (index + 1) / 24);
    for (let corner = 0; corner < 6; corner += 1) {
      const key = indices[corner];
      const fraction = (key >> 1) ? b : a;
      const amount = key % 2;
      const theta = (fraction - 0.5) * 2.9;
      const radius = (weapon.reach - 0.42) * (0.97 - amount * 0.067);
      if (vertical) {
        attribute.setXYZ(index * 6 + corner, -0.18 - amount * 0.082, 1.23 - Math.sin(theta) * radius * Math.sign(swingY || 1) * 0.64, Math.cos(theta) * radius);
      } else {
        attribute.setXYZ(index * 6 + corner, -Math.sin(theta) * radius * direction, 1.12 + swingY * 0.52 + amount * 0.11, Math.cos(theta) * radius);
      }
    }
  }
  attribute.needsUpdate = true;
}

function makeCoreRig(core, region, geometries) {
  const root = new THREE.Group();
  const stone = lambert(tone(region.stone, 0.74));
  const trim = lambert(tone(region.stone, 1.19));
  const light = luminous(region.accent);
  const rare = lambert(tone(region.accent, 0.82));
  meshPart(root, geometries.column, stone, 0, 0.16, 0, 2.46, 0.47, 2.46);
  meshPart(root, geometries.column, trim, 0, 0.44, 0, 2.13, 0.2, 2.13);
  meshPart(root, geometries.column, stone, 0, 0.63, 0, 1.68, 0.22, 1.68);
  meshPart(root, geometries.column, rare, 0, 0.765, 0, 1.02, 0.12, 1.02);
  const crystal = meshPart(root, geometries.jewel, light, 0, 1.37, 0, 0.53, 1.11, 0.53);
  const crystalCover = meshPart(root, geometries.jewel, rare, 0, 1.37, 0, 0.65, 1.24, 0.65);
  crystalCover.material = new THREE.MeshLambertMaterial({ color: tone(region.accent, 1.22), transparent: true, opacity: 0.67 });
  const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.07, 8.6, 6), new THREE.MeshBasicMaterial({ color: region.accent, transparent: true, opacity: 0.2, depthWrite: false }));
  marker.position.y = 5;
  root.add(marker);

  const ring = new THREE.Mesh(new THREE.RingGeometry(1.27, 1.34, 36), new THREE.MeshBasicMaterial({ color: region.accent, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.065;
  root.add(ring);
  const pennon = new THREE.Group();
  pennon.position.y = 2.56;
  const healthFg = meshPart(pennon, geometries.box, luminous(region.accent), 0, 0, 0.027, 1.09, 0.047, 0.022);
  meshPart(pennon, geometries.box, luminous('#2b302d'), 0, 0, 0, 1.14, 0.077, 0.037);
  root.add(pennon);
  return { root, crystal, crystalCover, marker, ring, pennon, healthFg, health: core.health };
}

function makePickupRig(pickup, world, geometries, getWeapon) {
  const root = new THREE.Group();
  root.position.set(pickup.x, world.height(pickup.x, pickup.z), pickup.z);
  const hue = pickup.item === 'weapon' ? getWeapon(pickup.weaponId).color : pickup.item === 'medkit' ? '#e99691' : '#8ed4b2';
  meshPart(root, geometries.box, lambert('#504b38'), 0, 0.082, 0, 0.56, 0.26, 0.51, 0.08);
  meshPart(root, geometries.box, lambert('#8c7350'), 0, 0.216, 0, 0.59, 0.11, 0.54);
  meshPart(root, geometries.box, luminous(hue), 0, 0.198, 0.275, 0.13, 0.112, 0.047);
  const orb = meshPart(root, geometries.jewel, luminous(hue), 0, 0.68, 0, 0.205, 0.28, 0.205);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.41, 0.45, 24), new THREE.MeshBasicMaterial({ color: hue, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.61 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  root.add(ring);
  return { root, orb, ring };
}

function createParticles(geometries) {
  const mesh = new THREE.InstancedMesh(geometries.box, new THREE.MeshBasicMaterial(), 48);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const states = [];
  const dummy = new THREE.Object3D();
  mesh.count = 0;
  return {
    mesh,
    impact(x, y, z, tint, count = 9) {
      for (let index = 0; index < count && states.length < 48; index += 1) {
        const angle = Math.random() * TAU;
        const speed = 1.8 + Math.random() * 3.9;
        const life = 0.26 + Math.random() * 0.25;
        states.push({ x, y, z, vx: Math.sin(angle) * speed, vy: 0.8 + Math.random() * 3.3, vz: Math.cos(angle) * speed, tint, life, initial: life, angle });
      }
    },
    update(dt) {
      for (const bit of states) {
        bit.x += bit.vx * dt;
        bit.y += bit.vy * dt;
        bit.z += bit.vz * dt;
        bit.vy -= dt * 8.3;
        bit.life -= dt;
      }
      for (let i = states.length - 1; i >= 0; i -= 1) {
        if (states[i].life <= 0) states.splice(i, 1);
      }
      mesh.count = states.length;
      for (let i = 0; i < states.length; i += 1) {
        const bit = states[i];
        const size = 0.025 + bit.life / bit.initial * 0.042;
        dummy.position.set(bit.x, bit.y, bit.z);
        dummy.rotation.set(bit.life * 8, bit.angle, bit.life * 12);
        dummy.scale.set(size, size * 1.66, size);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, bit.tint);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    reset() {
      states.length = 0;
      mesh.count = 0;
    },
  };
}

function worldTint(world) {
  if (world.mode === 'arena') return '#c2a87d';
  const id = world.spawns[0]?.region?.id;
  if (id === 'frostfall') return '#9cabaa';
  if (id === 'sunscar') return '#c4a681';
  if (id === 'glassreach') return '#a49eaa';
  return '#a6b09a';
}

function cameraBlockers(world) {
  return world.props
    .filter((prop) => prop.kind === 'wall' || prop.kind === 'building' || prop.kind === 'tower' || prop.kind === 'tree' || prop.kind === 'pillar')
    .map(({ x, z, kind, width, depth, scale = 1, height, rotation }) => {
      const w = width || (kind === 'tree' ? 1.32 * scale : 0.68);
      return {
        x, z, w: w / 2 + 0.12, d: (depth || w) / 2 + 0.12,
        height: (height || 3.1 * scale) + world.height(x, z),
        c: Math.cos(rotation), s: Math.sin(rotation),
      };
    });
}

function blocksCamera(x, y, z, world, blockers) {
  if (world.height(x, z) + 0.68 > y) return true;
  return blockers.some((prop) => {
    if (y > prop.height) return false;
    const dx = x - prop.x;
    const dz = z - prop.z;
    return Math.abs(dx * prop.c - dz * prop.s) < prop.w && Math.abs(dx * prop.s + dz * prop.c) < prop.d;
  });
}

function cleanGroup(group, sharedGeometries, sharedMaterials) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse((object) => {
    if (object.geometry && !sharedGeometries.has(object.geometry)) geometries.add(object.geometry);
    if (object.material && !sharedMaterials.has(object.material)) materials.add(object.material);
    if (object.isInstancedMesh) object.dispose();
  });
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
  group.clear();
}

export function createRenderer(canvas) {
  const graphics = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  graphics.outputColorSpace = THREE.SRGBColorSpace;
  graphics.toneMapping = THREE.ACESFilmicToneMapping;
  graphics.toneMappingExposure = 1.26;
  graphics.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.6));
  const scene = new THREE.Scene();
  scene.background = color('#a9b59f');
  scene.fog = new THREE.Fog('#a9b59f', 26, 120);
  const sky = createHorizon();
  scene.add(sky);
  const light = new THREE.DirectionalLight('#fff0cf', 1.96);
  light.position.set(-22, 27, 16);
  scene.add(light, new THREE.HemisphereLight('#e9eee1', '#75624e', 1.36));
  const camera = new THREE.PerspectiveCamera(61, 16 / 9, 0.06, 280);
  camera.position.set(0, 27, -20);
  camera.lookAt(0, 0, 0);
  const geometries = createGeometries();
  const shadowTexture = softShadowTexture();
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#161f1c', map: shadowTexture, opacity: 0.27, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const sharedGeometries = new Set(Object.values(geometries));
  const sharedMaterials = new Set([shadowMaterial]);
  const particles = createParticles(geometries);
  scene.add(particles.mesh);
  const sceneryRoot = new THREE.Group();
  const actorsRoot = new THREE.Group();
  scene.add(sceneryRoot, actorsRoot);
  const actors = new Map();
  const cores = new Map();
  const pickups = new Map();
  const cameraTarget = new THREE.Vector3();
  const cameraDesired = new THREE.Vector3();
  const cameraBase = new THREE.Vector3();
  const look = new THREE.Vector3();
  const billboard = new THREE.Quaternion();
  const rigRotation = new THREE.Quaternion();
  const regions = new Map();
  let world = null;
  let blockers = [];
  let cameraInitialized = false;
  let lastFirstPerson = false;
  let lastWidth = 0;
  let lastHeight = 0;
  let lastEvent = null;
  let elapsed = 0;

  function setWorld(next) {
    cleanGroup(sceneryRoot, sharedGeometries, sharedMaterials);
    cleanGroup(actorsRoot, sharedGeometries, sharedMaterials);
    actors.clear();
    cores.clear();
    pickups.clear();
    regions.clear();
    particles.reset();
    world = next;
    world.regions.forEach((region) => regions.set(region.id, region));
    blockers = cameraBlockers(world);
    cameraInitialized = false;
    lastEvent = null;
    elapsed = 0;
    const tint = worldTint(world);
    const arena = world.mode === 'arena';
    scene.fog.color.set(tint);
    scene.fog.near = arena ? 17 : 26;
    scene.fog.far = arena ? 76 : 117;
    sky.material.uniforms.haze.value.set(tint);
    sky.material.uniforms.zenith.value.set(arena ? '#7a8f88' : '#496e79');
    sceneryRoot.add(createTerrain(world), scenery(world, geometries, shadowMaterial), backdrop(world, geometries));
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width <= 0 || height <= 0) return false;
    if (lastWidth !== width || lastHeight !== height) {
      lastWidth = width;
      lastHeight = height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      graphics.setSize(width, height, false);
    }
    return true;
  }

  function positionCamera(actor, view, dt, weapon) {
    const { x, z } = actor;
    const y = world.height(x, z);
    const time = elapsed;
    const yaw = view.yaw ?? actor.facing ?? 0;
    const pitch = clamp(view.pitch ?? -0.18, -0.93, 0.67);
    const directionX = Math.sin(yaw);
    const directionZ = Math.cos(yaw);
    const aimX = actor.aimX || 0;
    const firstPerson = Boolean(view.firstPerson);
    const power = actor.swing < 0 ? 0 : Math.sin(actor.swing * Math.PI) ** 2 * weapon.weight;
    const jitter = Math.sin(time * 10.6) * 0.014 * Math.min(1, (actor.speed || 0) / 7);
    if (firstPerson) {
      cameraDesired.set(x + directionX * 0.11, y + 1.985 + jitter, z + directionZ * 0.11);
      const rise = Math.sin(pitch + (actor.swingY || 0) * power * 0.016);
      cameraTarget.set(x + (directionX * 8 - directionZ * power * 0.086 * aimX) * Math.cos(pitch), y + 1.985 + rise * 8 + jitter, z + (directionZ * 8 + directionX * power * 0.086 * aimX) * Math.cos(pitch));
    } else {
      const distance = world.mode === 'arena' ? 6.55 : 7.55;
      const horizontal = distance * Math.cos(pitch);
      const shoulder = 0.72 + power * aimX * 0.061;
      cameraDesired.set(x - directionX * horizontal - directionZ * shoulder, y + 2.48 - Math.sin(pitch) * distance + jitter * 0.5, z - directionZ * horizontal + directionX * shoulder);
      cameraBase.set(x, y + 2.22, z);
      for (let step = 3; step <= 15; step += 1) {
        const fraction = step / 15;
        const tryX = mixes(cameraBase.x, cameraDesired.x, fraction);
        const tryY = mixes(cameraBase.y, cameraDesired.y, fraction);
        const tryZ = mixes(cameraBase.z, cameraDesired.z, fraction);
        if (blocksCamera(tryX, tryY, tryZ, world, blockers)) {
          cameraDesired.copy(cameraBase).lerp(cameraCollisionTarget.set(tryX, tryY, tryZ), Math.max(0.62, 1 - 0.62 / step));
          break;
        }
      }
      cameraDesired.y = Math.max(cameraDesired.y, world.height(cameraDesired.x, cameraDesired.z) + 0.72);
      const ahead = world.mode === 'arena' ? 3.1 : 4.5;
      cameraTarget.set(
        x + directionX * ahead - directionZ * 0.39,
        y + 1.31 + Math.sin(pitch) * 2.36 - (actor.swingY || 0) * power * 0.069,
        z + directionZ * ahead + directionX * 0.39,
      );
    }

    if (!cameraInitialized || firstPerson !== lastFirstPerson || camera.position.distanceTo(cameraDesired) > 12) {
      camera.position.copy(cameraDesired);
      look.copy(cameraTarget);
      cameraInitialized = true;
    } else {
      camera.position.lerp(cameraDesired, 1 - Math.exp(-(firstPerson ? 32 : 16) * dt));
      look.lerp(cameraTarget, 1 - Math.exp(-26 * dt));
    }
    camera.lookAt(look);
    camera.rotateZ(power * (actor.swingX || 0) * (firstPerson ? 0.017 : 0.011));
    lastFirstPerson = firstPerson;
  }

  function faceCamera(rigRoot, panel) {
    rigRoot.getWorldQuaternion(rigRotation);
    billboard.copy(rigRotation).invert().multiply(camera.quaternion);
    panel.quaternion.copy(billboard);
  }

  function draw(game, view = {}, delta = 1 / 60) {
    if (!resize() || !game?.world) return;
    if (game.world !== world) setWorld(game.world);
    const dt = clamp(delta, 0.001, 0.053);
    elapsed += dt;
    const { actors: members = [], cores: objectives = [], pickups: loot = [] } = game;
    const player = members.find((actor) => actor.id === view.actorId) || game.player;
    if (!player) return;
    const ownWeapon = getWeapon(player.weaponId);
    positionCamera(player, view, dt, ownWeapon);

    for (const member of members) {
      let rig = actors.get(member.id);
      if (!rig) {
        const region = regions.get(member.regionId) || world.regionAt(member.x, member.z);
        rig = makeActorRig(geometries, region, member.team, world.mode === 'arena', shadowMaterial);
        actorsRoot.add(rig.root);
        actors.set(member.id, rig);
      }
      const own = member.id === player.id;
      const weapon = own ? ownWeapon : getWeapon(member.weaponId);
      if (rig.weaponId !== weapon.id) {
        cleanGroup(rig.weapons, sharedGeometries, sharedMaterials);
        makeWeapon(rig.weapons, geometries, weapon);
        rig.weaponId = weapon.id;
      }
      if (rig.health !== null && member.health < rig.health) {
        particles.impact(member.x, world.height(member.x, member.z) + 1.16, member.z, color('#ffe3a1'), member.health > 0 ? 8 : 14);
      }
      rig.health = member.health;
      poseActor(rig, member, world, weapon, dt, own && view.firstPerson);
      const gap = Math.hypot(member.x - player.x, member.z - player.z);
      rig.helm.visible = !own && gap < 17;
      if (rig.helm.visible) faceCamera(rig.root, rig.helm);
    }

    for (const objective of objectives) {
      let rig = cores.get(objective.id);
      if (!rig) {
        const region = regions.get(objective.regionId) || world.regionAt(objective.x, objective.z);
        rig = makeCoreRig(objective, region, geometries);
        rig.root.position.set(objective.x, world.height(objective.x, objective.z), objective.z);
        actorsRoot.add(rig.root);
        cores.set(objective.id, rig);
      }
      if (objective.health < rig.health) {
        particles.impact(objective.x, rig.root.position.y + 1.46, objective.z, rig.crystal.material.color, objective.health > 0 ? 10 : 20);
      }
      rig.health = objective.health;
      const alive = objective.health > 0;
      rig.marker.visible = rig.crystal.visible = rig.crystalCover.visible = rig.ring.visible = alive;
      rig.crystal.rotation.y = elapsed * 1.05;
      rig.crystalCover.rotation.y = -elapsed * 0.74;
      rig.crystal.position.y = rig.crystalCover.position.y = 1.43 + Math.sin(elapsed * 2.44) * 0.13;
      const ratio = clamp(objective.health / objective.maxHealth, 0, 1);
      rig.healthFg.scale.x = 1.09 * ratio;
      rig.healthFg.position.x = (ratio - 1) * 0.545;
      rig.marker.material.opacity = 0.14 + ratio * 0.09;
      rig.pennon.visible = alive && Math.hypot(objective.x - player.x, objective.z - player.z) < 12;
      if (rig.pennon.visible) faceCamera(rig.root, rig.pennon);
    }

    for (const entry of loot) {
      if (!entry.available && !pickups.has(entry.id)) continue;
      let rig = pickups.get(entry.id);
      if (!rig) {
        rig = makePickupRig(entry, world, geometries, getWeapon);
        actorsRoot.add(rig.root);
        pickups.set(entry.id, rig);
      }
      rig.root.visible = entry.available;
      rig.orb.rotation.set(elapsed * 0.64, elapsed * 2.06, 0.19);
      rig.orb.position.y = 0.69 + Math.sin(elapsed * 2.9 + entry.x) * 0.13;
      rig.ring.material.opacity = 0.43 + Math.sin(elapsed * 2.7 + entry.z) * 0.15;
    }

    if (game.events?.[0] !== lastEvent) {
      for (const event of game.events || []) {
        if (event.type === 'block') particles.impact(event.x, world.height(event.x, event.z) + 1.46, event.z, color('#b3e5de'), 5);
      }
      lastEvent = game.events?.[0];
    }

    particles.update(dt);
    graphics.render(scene, camera);
  }

  function dispose() {
    cleanGroup(sceneryRoot, sharedGeometries, sharedMaterials);
    cleanGroup(actorsRoot, sharedGeometries, sharedMaterials);
    sky.geometry.dispose();
    sky.material.dispose();
    particles.mesh.material.dispose();
    particles.mesh.dispose();
    for (const geometry of sharedGeometries) geometry.dispose();
    shadowMaterial.dispose();
    shadowTexture.dispose();
    graphics.dispose();
  }

  return { setWorld, draw, dispose };
}

const cameraCollisionTarget = new THREE.Vector3();

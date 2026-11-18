export const REGIONS = Object.freeze([
  Object.freeze({
    id: 'ironwood', name: 'Ironwood', faction: 'Ironwood Wardens', era: 'Medieval',
    ground: '#394d38', groundLight: '#6f8155', path: '#82745a',
    stone: '#676b65', foliage: '#354c32', accent: '#e2bd69',
    cloth: '#415d4f', skin: '#97684c', armor: '#776b53', buildingStyle: 'timber',
  }),
  Object.freeze({
    id: 'sunscar', name: 'Sunscar Basin', faction: 'Dune Kin', era: 'Bronze Age',
    ground: '#92583c', groundLight: '#bf9060', path: '#bd9b73',
    stone: '#a77954', foliage: '#6e7048', accent: '#ffbc69',
    cloth: '#a75235', skin: '#885843', armor: '#ad8558', buildingStyle: 'sandstone',
  }),
  Object.freeze({
    id: 'frostfall', name: 'Frostfall Ridge', faction: 'Frostborne', era: 'Industrial',
    ground: '#5a6b75', groundLight: '#a6b8b7', path: '#83969c',
    stone: '#65717c', foliage: '#496265', accent: '#bce3e8',
    cloth: '#58677b', skin: '#af8771', armor: '#7f8890', buildingStyle: 'steel',
  }),
  Object.freeze({
    id: 'glassreach', name: 'Glassreach', faction: 'Glassreach Scouts', era: 'Future',
    ground: '#514c67', groundLight: '#8b849d', path: '#9090a4',
    stone: '#716e8c', foliage: '#53576d', accent: '#c6affb',
    cloth: '#645174', skin: '#7a617e', armor: '#8583a3', buildingStyle: 'alloy',
  }),
]);

const ARENA_REGION = Object.freeze({
  id: 'arena', name: 'The Crucible', faction: 'Arena Challenger', era: 'All eras',
  ground: '#73563c', groundLight: '#b39468', path: '#be9b71',
  stone: '#786451', foliage: '#665a45', accent: '#f3b469',
  cloth: '#936849', skin: '#a87858', armor: '#777079', buildingStyle: 'sandstone',
});

const FRONTIER_SIZE = 108;
const ARENA_SIZE = 26;
const ARENA_LIMIT = 9;
const FORT_WALL_OFFSET = 6.2;
const HALF_TURN = Math.PI;
const QUARTER_TURN = HALF_TURN / 2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (start, end, amount) => start + (end - start) * amount;
const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function hashSeed(seed) {
  let value = 2166136261;
  for (const character of seed) {
    value ^= character.codePointAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function randomGenerator(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function lattice(seed, x, z) {
  let value = seed ^ Math.imul(x, 1597334677) ^ Math.imul(z, 3812015801);
  value = Math.imul(value ^ value >>> 16, 2146121005);
  value = Math.imul(value ^ value >>> 15, 2221713035);
  return ((value ^ value >>> 16) >>> 0) / 4294967296;
}

function noise(seed, x, z) {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const u = smoothstep(0, 1, x - cellX);
  const v = smoothstep(0, 1, z - cellZ);
  const north = lerp(lattice(seed, cellX, cellZ), lattice(seed, cellX + 1, cellZ), u);
  const south = lerp(lattice(seed, cellX, cellZ + 1), lattice(seed, cellX + 1, cellZ + 1), u);
  return lerp(north, south, v);
}

function segmentDistanceSquared(x, z, from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const amount = clamp(((x - from.x) * dx + (z - from.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return (x - from.x - dx * amount) ** 2 + (z - from.z - dz * amount) ** 2;
}

function createFrontier(seed, number) {
  const random = randomGenerator(number);
  const range = (min, max) => lerp(min, max, random());
  const regions = [...REGIONS];
  for (let index = regions.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [regions[index], regions[other]] = [regions[other], regions[index]];
  }

  const quadrants = [
    { x: -1, z: 1 },
    { x: 1, z: 1 },
    { x: -1, z: -1 },
    { x: 1, z: -1 },
  ];
  const ridgePhase = range(0, 2 * HALF_TURN);

  function regionAt(x, z) {
    const east = x > Math.sin(z * 0.085 + ridgePhase) * 5.5;
    const north = z < Math.cos(x * 0.08 + ridgePhase) * 5.5;
    return regions[Number(east) + Number(north) * 2];
  }

  const elevation = {
    ironwood: 0.5,
    sunscar: -0.8,
    frostfall: 4.7,
    glassreach: 2.6,
  };

  function naturalHeight(x, z) {
    const hills = (noise(number, x * 0.035 + 17, z * 0.038 - 9) - 0.36) * 7.8;
    const outcrops = (noise(number ^ 0x731aa082, x * 0.087, z * 0.081) - 0.5) * 2.3;
    const groundVariation = (noise(number ^ 0xd508cabd, x * 0.21, z * 0.21) - 0.5) * 0.41;
    const edgeHeight = (1.5 + noise(number, x * 0.055, z * 0.055) * 6.7)
      * smoothstep(36, 57, Math.max(Math.abs(x), Math.abs(z)));
    const east = smoothstep(-11, 11, x - Math.sin(z * 0.085 + ridgePhase) * 5.5);
    const north = smoothstep(-11, 11, Math.cos(x * 0.08 + ridgePhase) * 5.5 - z);
    const southAltitude = lerp(elevation[regions[0].id], elevation[regions[1].id], east);
    const northAltitude = lerp(elevation[regions[2].id], elevation[regions[3].id], east);
    return hills + outcrops + groundVariation + edgeHeight + lerp(southAltitude, northAltitude, north);
  }

  const forts = quadrants.map((quadrant, index) => {
    const region = regions[index];
    const x = quadrant.x * range(24.5, 30.5);
    const z = quadrant.z * range(24.5, 30.5);
    const id = `fort-${region.id}`;
    const yaw = Math.atan2(x, z);
    const outwardX = x / Math.hypot(x, z);
    const outwardZ = z / Math.hypot(x, z);
    const spawn = {
      x: x + outwardX * 2.55 - outwardZ * 1.25,
      z: z + outwardZ * 2.55 + outwardX * 1.25,
      yaw, facing: yaw, region, fortId: id,
    };
    return {
      id, x, z, region, spawn,
      core: { x, z, maxHealth: 100 },
      elevation: naturalHeight(x, z),
    };
  });

  const paths = [];
  const crossroads = { x: range(-3, 3), z: range(-3, 3) };
  for (const fort of forts) {
    const route = [
      fort,
      { x: fort.x, z: fort.z - Math.sign(fort.z) * 8.6 },
      { x: fort.x * 0.73 + range(-2, 2), z: fort.z * 0.47 + range(-2, 2) },
      { x: fort.x * 0.39 + range(-1, 1), z: fort.z * 0.16 + range(-2, 2) },
      crossroads,
    ];
    for (let index = 1; index < route.length; index++) {
      paths.push([route[index - 1], route[index]]);
    }
  }

  function pathAt(x, z) {
    let nearest = Infinity;
    for (const [from, to] of paths) {
      nearest = Math.min(nearest, segmentDistanceSquared(x, z, from, to));
    }
    return 1 - smoothstep(0.61, 3.6, nearest);
  }

  function height(x, z) {
    const natural = naturalHeight(x, z);
    for (const fort of forts) {
      const distance = Math.max(Math.abs(x - fort.x), Math.abs(z - fort.z));
      if (distance < 14) {
        return lerp(fort.elevation, natural, smoothstep(7.4, 14, distance));
      }
    }
    return natural;
  }

  const props = [];
  const movement = createMovementMap(FRONTIER_SIZE / 2 - 1.2);
  const place = createPropPlacer(props, movement, regionAt);

  for (const fort of forts) {
    addFortProps(fort, place, movement);
  }

  const terrainThemes = {
    ironwood: { landmark: 'tree', vegetation: 'tuft', trees: 49, rocks: 15, details: 35 },
    sunscar: { landmark: 'pillar', vegetation: 'tuft', trees: 13, rocks: 27, details: 25 },
    frostfall: { landmark: 'tree', vegetation: 'tuft', trees: 30, rocks: 34, details: 22 },
    glassreach: { landmark: 'crystal', vegetation: 'crystal', trees: 11, rocks: 28, details: 33 },
  };

  for (const [index, quadrant] of quadrants.entries()) {
    const region = regions[index];
    const theme = terrainThemes[region.id];
    const scatter = (kind, quantity, minScale, maxScale, collision = 0) => {
      let placed = 0;
      for (let attempt = 0; attempt < quantity * 12 && placed < quantity; attempt++) {
        const x = range(4, 51) * quadrant.x;
        const z = range(4, 51) * quadrant.z;
        const scale = range(minScale, maxScale);
        const spacing = Math.max(collision * scale + 0.45, 0.48);
        if (regionAt(x, z) !== region || pathAt(x, z) > 0.27 || !movement.canMove(x, z, spacing)) {
          continue;
        }
        if (forts.some((fort) => Math.max(Math.abs(x - fort.x), Math.abs(z - fort.z)) < 8.7)) {
          continue;
        }
        place(kind, x, z, {
          scale,
          rotation: range(-HALF_TURN, HALF_TURN),
          variant: Math.floor(range(0, 3)),
          radius: collision * scale,
        });
        placed++;
      }
    };

    scatter('tree', theme.trees, 0.75, 1.85, 0.35);
    scatter('rock', theme.rocks, 0.62, 2.1, 0.46);
    scatter(theme.vegetation, theme.details, 0.44, 1.35);
    scatter(theme.landmark, 8, 1.3, 2.3, 0.5);
    scatter('ruin', 3, 0.85, 1.7, 0.72);

    const buildingWidth = range(2.35, 3.45);
    const buildingDepth = range(2.15, 3.2);
    const buildingHeight = range(2.35, 3.35);
    let cottages = 0;
    for (let attempt = 0; attempt < 75 && cottages < 2; attempt++) {
      const x = range(8, 43) * quadrant.x;
      const z = range(8, 43) * quadrant.z;
      if (pathAt(x, z) > 0.04 || !movement.canMove(x, z, 2.75)) continue;
      if (forts.some((fort) => Math.hypot(x - fort.x, z - fort.z) < 12.5)) continue;
      place('building', x, z, {
        width: buildingWidth,
        height: buildingHeight,
        depth: buildingDepth,
        rotation: Math.floor(range(0, 4)) * QUARTER_TURN,
        variant: cottages,
        solid: true,
      });
      const pickupOffset = Math.max(buildingDepth, buildingWidth) / 2 + 0.59;
      place('pickup', x, z + pickupOffset, { item: cottages ? 'stamina' : 'weapon' });
      cottages++;
    }
  }

  return {
    seed, mode: 'frontier', size: FRONTIER_SIZE, regions, props, forts,
    spawns: forts.map((fort) => fort.spawn),
    height, regionAt, pathAt, canMove: movement.canMove,
  };
}

function addFortProps(fort, place, movement) {
  const { x, z, id } = fort;
  const offset = FORT_WALL_OFFSET;

  const wall = { width: 3.87, height: 2.1, depth: 0.62, solid: true, fortId: id };
  for (const side of [-1, 1]) {
    place('wall', x - 3.6, z + side * offset, wall);
    place('wall', x + 3.6, z + side * offset, wall);
    place('wall', x + side * offset, z - 3.6, { ...wall, rotation: QUARTER_TURN });
    place('wall', x + side * offset, z + 3.6, { ...wall, rotation: QUARTER_TURN });

    for (const corner of [-1, 1]) {
      place('tower', x + side * offset, z + corner * offset, {
        width: 1.92, depth: 1.92, height: 4.4, solid: true, fortId: id,
      });
    }

    place('banner', x + 2.1, z + side * offset, { scale: 1.1, fortId: id });
    place('banner', x - 2.1, z + side * offset, { scale: 1.1, fortId: id });
  }

  for (const side of [-1, 1]) {
    place('building', x + side * 3.85, z + side * 3.4, {
      width: 2.4, depth: 2.3, height: 2.45, rotation: side * QUARTER_TURN,
      solid: true, fortId: id,
    });
  }

  place('pickup', x + 4.25, z, { item: 'weapon', fortId: id });
  place('pickup', x - 4.25, z, { item: 'medkit', fortId: id });
  movement.addCircle(x, z, 0.76);
}

function createArena(seed, number) {
  const random = randomGenerator(number ^ 0x1369ae7b);
  const phases = [random() * 6, random() * 6];
  const props = [];
  const regionAt = () => ARENA_REGION;
  const movement = createMovementMap(ARENA_LIMIT);
  const place = createPropPlacer(props, movement, regionAt);

  function height(x, z) {
    const variation = Math.cos(x * 0.67 + phases[0]) * Math.sin(z * 0.56 + phases[1]) * 0.11;
    const embankment = smoothstep(8.75, 13, Math.max(Math.abs(x), Math.abs(z))) * 1.1;
    return variation + embankment;
  }

  const wall = { width: 4.65, depth: 0.9, height: 2.6, solid: true };
  for (const side of [-1, 1]) {
    for (const offset of [-6.98, -2.33, 2.33, 6.98]) {
      const variant = Math.floor(random() * 3);
      place('wall', offset, side * 9.65, { ...wall, variant });
      place('wall', side * 9.65, offset, { ...wall, rotation: QUARTER_TURN, variant });
    }
    for (const corner of [-1, 1]) {
      place('tower', side * 9.65, corner * 9.65, { width: 2.6, depth: 2.6, height: 4.8, solid: true });
    }
    place('banner', -4.1, side * 9.1, { scale: 1.35 });
    place('banner', 4.1, side * 9.1, { scale: 1.35 });
    place('pillar', side * 7.25, -5.8, { scale: 1.4, radius: 0.55 });
    place('pillar', side * 7.25, 5.8, { scale: 1.4, radius: 0.55 });
  }

  for (let index = 0; index < 20; index++) {
    const angle = random() * 2 * HALF_TURN;
    const radius = 11.1 + random() * 1.6;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.max(Math.abs(x), Math.abs(z)) < 10.25) continue;
    place(index % 3 ? 'rock' : 'ruin', x, z, {
      scale: 0.6 + random() * 1.15,
      rotation: random() * 2 * HALF_TURN,
    });
  }

  const spawns = [
    { x: 0, z: 4.35, yaw: 0, facing: 0, region: ARENA_REGION, fortId: null },
    { x: 0, z: -4.35, yaw: HALF_TURN, facing: HALF_TURN, region: ARENA_REGION, fortId: null },
  ];

  return {
    seed, mode: 'arena', size: ARENA_SIZE, regions: [ARENA_REGION], props, forts: [], spawns,
    height, regionAt,
    pathAt: (x, z) => 1 - smoothstep(5, 8.6, Math.hypot(x, z)),
    canMove: movement.canMove,
  };
}

function createPropPlacer(props, movement, regionAt) {
  return (kind, x, z, options = {}) => {
    const { radius = 0, solid = false, ...appearance } = options;
    const prop = {
      id: `${kind}-${props.length}`,
      kind, x, z, region: regionAt(x, z),
      scale: 1, rotation: 0,
      ...appearance,
    };
    props.push(prop);
    if (solid) movement.addBox(prop);
    if (radius) movement.addCircle(x, z, radius);
    return prop;
  };
}

function createMovementMap(limit) {
  const colliders = new Map();
  const cellSize = 4;
  const cellKey = (x, z) => `${x},${z}`;

  function visitCells(x, z, radius, visit) {
    const right = Math.floor((x + radius) / cellSize);
    const bottom = Math.floor((z + radius) / cellSize);
    for (let column = Math.floor((x - radius) / cellSize); column <= right; column++) {
      for (let row = Math.floor((z - radius) / cellSize); row <= bottom; row++) {
        if (visit(cellKey(column, row)) === false) return false;
      }
    }
    return true;
  }

  function addCollider(x, z, radius, overlaps) {
    visitCells(x, z, radius, (key) => {
      const cell = colliders.get(key);
      if (cell) cell.push(overlaps);
      else colliders.set(key, [overlaps]);
    });
  }

  function addCircle(x, z, radius) {
    addCollider(x, z, radius, (otherX, otherZ, otherRadius) => (
      (otherX - x) ** 2 + (otherZ - z) ** 2 < (radius + otherRadius) ** 2
    ));
  }

  function addBox({ x, z, width, depth, rotation }) {
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    addCollider(x, z, Math.hypot(halfWidth, halfDepth), (otherX, otherZ, radius) => {
      const dx = otherX - x;
      const dz = otherZ - z;
      const localX = Math.abs(dx * cos - dz * sin);
      const localZ = Math.abs(dx * sin + dz * cos);
      const edgeX = Math.max(0, localX - halfWidth);
      const edgeZ = Math.max(0, localZ - halfDepth);
      return edgeX ** 2 + edgeZ ** 2 <= radius ** 2;
    });
  }

  function canMove(x, z, radius = 0.4) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius < 0) {
      return false;
    }
    if (Math.abs(x) + radius > limit || Math.abs(z) + radius > limit) return false;
    return visitCells(x, z, radius, (key) => !colliders.get(key)?.some((overlaps) => overlaps(x, z, radius)));
  }

  return { addCircle, addBox, canMove };
}

export function createWorld(seed = 'RIFT-01', mode = 'frontier') {
  const label = String(seed).trim() || 'RIFT-01';
  const number = hashSeed(label);
  return mode === 'arena' ? createArena(label, number) : createFrontier(label, number);
}

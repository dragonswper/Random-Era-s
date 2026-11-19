import { MeshLambertMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let request;

export function loadMapKit() {
  request ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}map-kit.glb`)
    .then(({ scene }) => {
      const kit = new Map();
      const finishes = new Map();
      for (const variant of scene.children) {
        const parts = [];
        variant.traverse((mesh) => {
          if (!mesh.isMesh) return;
          const source = mesh.material;
          const finish = `${source.map?.uuid ?? 'plain'}/${source.side}`;
          if (!finishes.has(finish)) finishes.set(finish, new MeshLambertMaterial({ map: source.map, side: source.side }));
          const name = source.name.toLowerCase();
          const colorSlot = name.includes('bark') ? 'bark' : name.startsWith('grass') ? 'grass' : 'main';
          // Each mesh is packed in unit bounds with its bottom at Y = 0.
          parts.push({ id: `kit/${variant.name}/${parts.length}`, geometry: mesh.geometry, material: finishes.get(finish), colorSlot });
        });
        if (parts.length) kit.set(variant.name, parts);
      }
      return kit;
    }).catch((error) => {
      request = undefined;
      throw error;
    });
  return request;
}

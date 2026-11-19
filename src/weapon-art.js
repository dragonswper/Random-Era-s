import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let request;

export function loadWeaponArt() {
  request ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}weapons.glb`)
    .then(({ scene }) => new Map(scene.children.map((root) => {
      const id = root.name.slice('weapon_'.length).replaceAll('_', '-');
      const tip = root.getObjectByName(`${root.name}_tip`)?.position;
      return [id, { root, tip }];
    })))
    .catch((error) => {
      request = undefined;
      throw error;
    });
  return request;
}

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let knightRequest;

export function loadKnight() {
  knightRequest ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}knight.glb`)
    .then(({ scene }) => scene)
    .catch((error) => {
      knightRequest = undefined;
      throw error;
    });
  return knightRequest;
}

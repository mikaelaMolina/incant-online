import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

/** Physics runs at a fixed rate; rendering interpolates between steps. */
export const FIXED_DT = 1 / 60;

export async function createPhysicsWorld(): Promise<RAPIER.World> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_DT;
  return world;
}

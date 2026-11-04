import { parseFloorSpec, type FloorSpec } from '../schemas/floorSpec';
import startingArenaJson from './starting-arena.json';

function mustParse(name: string, json: unknown): FloorSpec {
  const r = parseFloorSpec(json);
  if (!r.ok) throw new Error(`Fallback floor "${name}" is invalid: ${r.error}`);
  return r.value;
}

/** The first floor of the Spire, and the floor used when nothing else is available. */
export const STARTING_ARENA: FloorSpec = mustParse('starting-arena', startingArenaJson);

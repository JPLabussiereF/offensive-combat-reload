// Every kind of map piece the client can build: one adapter per kind of shared/mapCatalog.ts (a test checks
// they match one to one).
import type { Adapter } from './types';
import { primitives } from './primitives';
import { street } from './street';
import { vehicles } from './vehicles';
import { furniture } from './furniture';
import { haunted } from './haunted';
import { objects } from './objects';
import { cemetery } from './cemetery';
import { garden } from './garden';
import { gardenPieces } from './gardenPieces';
import { glb } from './glb';

export const CATALOG: Readonly<Record<string, Adapter>> = { ...primitives, ...street, ...vehicles, ...furniture, ...haunted, ...objects, ...cemetery, ...garden, ...gardenPieces, ...glb };

export type { Adapter, BuildCtx } from './types';

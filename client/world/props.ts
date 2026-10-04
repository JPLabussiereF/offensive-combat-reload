// Environmental gags that every player in a session must see (hydrants, ice cream truck, flamingos).
// A local trigger runs the gag and reports it (online: to the server, which relays it to the others);
// a remote trigger just runs it.
import type * as THREE from 'three';

/** Who set a gag off: us (`local`) or another player, and from where when known (the ghost faces them). */
export interface PropTrigger {
  local: boolean;
  from: THREE.Vector3 | null;
}

export class PropBus {
  private handlers = new Map<string, (t: PropTrigger) => void>();
  /** Set by the game when online: forwards local triggers to the server. */
  onLocal: (id: string) => void = () => {};
  /** Set by the game: where the local player shoots from (their eye). */
  shooter: () => THREE.Vector3 | null = () => null;

  /** Registers a gag and returns the handler to use as a collider's onShot. */
  register(id: string, fn: (t: PropTrigger) => void): () => void {
    this.handlers.set(id, fn);
    return () => {
      fn({ local: true, from: this.shooter() });
      this.onLocal(id);
    };
  }

  /** Another player triggered it (`from`: their position, when the game knows it). */
  remote(id: string, from: THREE.Vector3 | null = null) {
    this.handlers.get(id)?.({ local: false, from });
  }

  has(id: string) {
    return this.handlers.has(id);
  }
}

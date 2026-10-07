// The thumbnails' drawing line (PF-6 Revisions 01, etapa 4): one picture at a time, each one started when the page
// has a moment (the editor passes requestIdleCallback), so the editor never stalls while a few hundred kinds are
// drawn for the first time. The folder on screen goes first (a higher priority); the same asset asked twice is
// drawn once; a picture that fails doesn't stop the others; the line holds while the map is played (Play) and
// goes on after. Without a screen: client/tests/editorThumbs.test.ts drives it with its own clock.

/** Starts `run` when the page has a moment. */
export type Schedule = (run: () => void) => void;

export class ThumbQueue<K extends string = string> {
  /** Waiting: the key and its priority (higher first; equal ones in the order asked). */
  private wait = new Map<K, number>();
  private busy: K | null = null;
  private scheduled = false;
  private held = false;
  /** Drawn (or failed: they aren't asked again until `retry`). */
  readonly done = new Set<K>();
  readonly failed = new Set<K>();
  /** A picture was drawn (`ok`) or failed. */
  onDone: (key: K, ok: boolean) => void = () => {};

  constructor(
    private readonly job: (key: K) => Promise<void>,
    private readonly schedule: Schedule,
  ) {}

  /** Asks for a picture (`priority`: higher first). Nothing when it's drawn, being drawn or already waiting higher. */
  request(key: K, priority = 0) {
    if (this.done.has(key) || this.busy === key) return;
    const was = this.wait.get(key);
    if (was !== undefined && was >= priority) return;
    // A raised priority goes to the end of its new rank (Map keeps the order things were set in).
    if (was !== undefined) this.wait.delete(key);
    this.wait.set(key, priority);
    this.kick();
  }

  /** These keys first (the folder on screen): the others keep waiting behind them. */
  focus(keys: Iterable<K>, priority = 1) {
    for (const k of keys) this.request(k, priority);
  }

  /** Lowers every waiting key back to `priority` (another folder took the screen). */
  lower(priority = 0) {
    for (const [k, p] of this.wait) if (p > priority) this.wait.set(k, priority);
  }

  /** A failed or drawn key asked again (its asset changed). */
  retry(key: K, priority = 1) {
    this.done.delete(key);
    this.failed.delete(key);
    this.request(key, priority);
  }

  /** How many are waiting (the one being drawn not counted). */
  get pending() {
    return this.wait.size;
  }

  /** The key being drawn now, if any. */
  get running() {
    return this.busy;
  }

  /** Holds the line (the one being drawn finishes); `false` lets it go on. */
  hold(on: boolean) {
    this.held = on;
    if (!on) this.kick();
  }

  get holding() {
    return this.held;
  }

  /** Forgets everything waiting (the editor is closing). */
  clear() {
    this.wait.clear();
  }

  private kick() {
    if (this.busy !== null || this.scheduled || this.held || !this.wait.size) return;
    this.scheduled = true;
    this.schedule(() => {
      this.scheduled = false;
      void this.next();
    });
  }

  private async next() {
    if (this.busy !== null || this.held || !this.wait.size) return;
    let key: K | null = null;
    let best = -Infinity;
    for (const [k, p] of this.wait)
      if (p > best) {
        best = p;
        key = k;
      }
    if (key === null) return;
    this.wait.delete(key);
    this.busy = key;
    let ok = true;
    try {
      await this.job(key);
    } catch {
      ok = false;
    }
    this.busy = null;
    this.done.add(key);
    if (!ok) this.failed.add(key);
    this.onDone(key, ok);
    this.kick();
  }
}

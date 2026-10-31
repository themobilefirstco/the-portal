// Network IO runs outside the meeting-command queue. Publish only the latest generation.
export class SnapshotPoller {
  constructor({read, publish, failed, interval = 30_000, now = Date.now}) {
    Object.assign(this, {read, publish, failed, interval, now});
    this.busy = null; this.next = 0; this.generation = 0;
  }
  invalidate() { this.generation++; this.next = 0; }
  refresh({force = false} = {}) {
    if (this.busy) return this.busy;
    if (!force && this.now() < this.next) return Promise.resolve();
    const generation = this.generation;
    this.busy = (async () => {
      // Yield before read: synchronous throws must not clear busy before assignment.
      await Promise.resolve();
      try { const snapshot = await this.read(); if (generation === this.generation) this.publish(snapshot, this.now()); }
      catch (error) { if (generation === this.generation) this.failed(error); }
      finally { if (generation === this.generation) this.next = this.now() + this.interval; this.busy = null; }
    })();
    return this.busy;
  }
}

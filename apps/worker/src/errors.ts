/**
 * An error whose cause is deterministic: retrying the job cannot succeed
 * (missing rows, over-cap outputs, invalid payloads). The runner fails the
 * job immediately instead of burning the remaining attempts on re-work —
 * for render jobs that re-work is a full re-render.
 */
export class PermanentJobError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PermanentJobError";
  }
}

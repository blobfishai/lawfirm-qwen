/** Fail-closed storage preflight for paid leaderboard sweeps. */
import { statfsSync } from "node:fs";

export function storageHeadroomFromStat(stat, minimumFreeMb) {
  if (!Number.isFinite(minimumFreeMb) || minimumFreeMb < 0) {
    throw new TypeError("minimum free disk must be a non-negative number of MiB");
  }
  const availableBytes = BigInt(stat.bavail) * BigInt(stat.bsize);
  const requiredBytes = BigInt(Math.ceil(minimumFreeMb * 1024 * 1024));
  return {
    ok: availableBytes >= requiredBytes,
    availableBytes: Number(availableBytes),
    requiredBytes: Number(requiredBytes),
    availableMb: Number(availableBytes) / (1024 * 1024),
    requiredMb: minimumFreeMb,
  };
}

export function readStorageHeadroom(path, minimumFreeMb) {
  return storageHeadroomFromStat(statfsSync(path, { bigint: true }), minimumFreeMb);
}

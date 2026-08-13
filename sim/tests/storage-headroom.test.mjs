import assert from "node:assert/strict";
import { storageHeadroomFromStat } from "../lib/storage-headroom.mjs";

const enough = storageHeadroomFromStat({ bavail: 2048n, bsize: 1024n }, 1);
assert.equal(enough.ok, true);
assert.equal(enough.availableBytes, 2 * 1024 * 1024);
assert.equal(enough.requiredBytes, 1024 * 1024);

const low = storageHeadroomFromStat({ bavail: 1023n, bsize: 1024n }, 1);
assert.equal(low.ok, false);
assert.throws(
  () => storageHeadroomFromStat({ bavail: 1n, bsize: 1n }, -1),
  /non-negative/,
);

console.log("storage-headroom gate: paid sweeps reject low disk before model calls");

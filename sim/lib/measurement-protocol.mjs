/** Immutable identifier/config for the world-v19 paid calibration protocol. */
export const MEASUREMENT_PROTOCOL_ID = "v19-systems-bounded-context-v1";

export const MEASUREMENT_PROTOCOL = Object.freeze({
  id: MEASUREMENT_PROTOCOL_ID,
  toolScope: "systems",
  turnBudget: "min(50, max(10, ceil(reference_calls * 1.25) + 5))",
  contextPolicy: "keep 12 recent tool results; compact older results to 1000 chars",
  episodeStorage: "deterministic-json-gzip",
});

export function measurementProtocolId(toolScope) {
  return toolScope === MEASUREMENT_PROTOCOL.toolScope ? MEASUREMENT_PROTOCOL_ID : null;
}

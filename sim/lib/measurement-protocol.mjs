/** Immutable identifier/config for the world-v19 paid calibration protocol. */
export const MEASUREMENT_PROTOCOL_ID = "v19-all-tools-fixed50-context-v4";

export const MEASUREMENT_PROTOCOL = Object.freeze({
  id: MEASUREMENT_PROTOCOL_ID,
  toolScope: "all",
  turnBudget: "fixed 50-turn ceiling",
  wallClockTimeoutMinutes: 30,
  contextPolicy: "keep 12 recent tool results; compact older results to 1000 chars",
  episodeStorage: "deterministic-json-gzip",
});

export function measurementProtocolId(toolScope, hasTurnOverride = false) {
  return toolScope === MEASUREMENT_PROTOCOL.toolScope && !hasTurnOverride
    ? MEASUREMENT_PROTOCOL_ID : null;
}

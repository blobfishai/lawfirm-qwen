/** Classify child-process failures without treating them as model outcomes. */

const TERMINAL_PROVIDER_STATUS = new Set([400, 401, 402, 403, 404, 422]);

export function classifyInfrastructureFailure({ stderr = "", stdout = "", timedOut = false } = {}) {
  if (timedOut) return { kind: "timeout", terminal: false, detail: "episode wall-clock timeout" };
  const text = `${stderr}\n${stdout}`;
  const statusMatch = /LLM API\s+(\d{3})\s*:\s*([^\n]*)/i.exec(text);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    const detail = statusMatch[2].trim().slice(0, 500);
    return {
      kind: TERMINAL_PROVIDER_STATUS.has(status) ? "terminal_provider" : "transient_provider",
      terminal: TERMINAL_PROVIDER_STATUS.has(status),
      status,
      detail,
    };
  }
  if (/insufficient balance/i.test(text)) {
    return { kind: "terminal_provider", terminal: true, status: 402, detail: "Insufficient Balance" };
  }
  return { kind: "unknown_infrastructure", terminal: false, detail: text.trim().slice(-500) || "child exited without an episode record" };
}

export function appendDiagnosticTail(current, chunk, maximum = 4000) {
  const next = current + String(chunk ?? "");
  return next.length > maximum ? next.slice(-maximum) : next;
}

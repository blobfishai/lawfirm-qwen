#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  appendDiagnosticTail, classifyInfrastructureFailure,
} from "../sim/lib/infrastructure-failure.mjs";

const billing = classifyInfrastructureFailure({
  stderr: 'Simulation failed: Error: LLM API 402: {"error":{"message":"Insufficient Balance"}}',
});
if (!billing.terminal || billing.kind !== "terminal_provider" || billing.status !== 402) {
  throw new Error(`billing failure not terminal: ${JSON.stringify(billing)}`);
}
const overloaded = classifyInfrastructureFailure({ stderr: "Error: LLM API 503: overloaded" });
if (overloaded.terminal || overloaded.kind !== "transient_provider") {
  throw new Error(`503 failure not retryable: ${JSON.stringify(overloaded)}`);
}
const timeout = classifyInfrastructureFailure({ timedOut: true });
if (timeout.terminal || timeout.kind !== "timeout") throw new Error("timeout classification changed");
if (appendDiagnosticTail("abc", "def", 4) !== "cdef") throw new Error("diagnostic tail changed");
const proof = JSON.parse(readFileSync("data/leaderboard/provider-halt-proof-v19.json", "utf8"));
if (proof.classes?.infra_error !== 1 || proof.canaries?.failed !== 0
    || !String(proof.haltedBy).includes("HTTP 402")
    || proof.spend?.reportedCostUsd !== 0) {
  throw new Error(`provider halt proof is invalid: ${JSON.stringify(proof)}`);
}
console.log("infrastructure-failure gate: terminal billing/auth, transient provider, timeout, and bounded diagnostics clean");

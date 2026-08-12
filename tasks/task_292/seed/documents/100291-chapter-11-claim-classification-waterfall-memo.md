<!-- dm_documents id 100291 · doc_class: claims_waterfall · role: INPUT (must be read in full) -->
# Chapter 11 — Claim classification waterfall memo

CLAIM CLASSIFICATION MEMO — In re Northgate Holdings, Chapter 11

Petition date: 2026-01-20.   Claims bar date: 2026-04-15.

Apply the tests IN ORDER. The first test that matches controls.

  1. LATE FILING. A proof of claim filed after 2026-04-15 is disallowed unless the docket
     shows an excusable-neglect order. No such order has been entered in this case.
     -> disallowed

  2. PERFECTED SECURITY INTEREST. A UCC-1 financing statement filed BEFORE the petition
     date perfects the interest. A UCC-1 filed on or after the petition date does not.
     -> allowed_secured

  3. EMPLOYEE WAGES. Wages EARNED within the 180 days before the petition date (that is, on
     or after 2025-07-24), capped at $15,150.00 per employee. Wages earned wholly or
     partly outside that window, or exceeding the cap, do not take priority treatment.
     -> allowed_priority

  4. EVERYTHING ELSE.  -> allowed_general_unsecured

A creditor's own characterisation of its claim in the proof of claim is not evidence of its
treatment and is routinely overstated. Classify on the tests above alone.

Outcome vocabulary (use exactly):
  disallowed | allowed_secured | allowed_priority | allowed_general_unsecured

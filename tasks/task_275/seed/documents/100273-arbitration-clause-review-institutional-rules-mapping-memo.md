<!-- dm_documents id 100273 · doc_class: arbitration_rules_memo · role: INPUT (must be read in full) -->
# Arbitration clause review — Institutional rules mapping memo

ARBITRATION CLAUSE REVIEW (firm memo)

Classify each clause by the RULES it adopts, not by where hearings are held. A clause that
fixes a hearing venue for convenience does not change the administering institution, and the
venue city is frequently another institution's home seat — that coincidence is a trap.

MAPPING (by the rules named in the clause):
  ICC Rules of Arbitration ......... administered by the ICC     -> icc_administered
  LCIA Arbitration Rules ........... administered by the LCIA    -> lcia_administered
  SIAC Arbitration Rules ........... administered by SIAC        -> siac_administered
  UNCITRAL Arbitration Rules ....... NOT administered by an institution unless the clause
                                     separately appoints one     -> uncitral_ad_hoc

Record the classification as an evidence record with owner_role exactly "arbitration-counsel"
and status exactly "confirmed".

Evidence type vocabulary (use exactly):
  icc_administered | lcia_administered | siac_administered | uncitral_ad_hoc

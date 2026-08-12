# Manifest-first deterministic tasks

Every generated task begins with one committed fact manifest. Documents and
grade-time assertions are compiled from that same source; an LLM may propose
locked prose or candidate facts at build time, but it is never on the scoring
path.

```bash
python3 world/manifest/render.py path/to/manifest.json --out build/task --check
python3 world/manifest/roundtrip.py path/to/manifest.json build/task
python3 world/manifest/compile_assertions.py path/to/manifest.json \
  --out build/task/assertions.json --vcode build/task/grounding.py
python3 -m unittest discover -s world/manifest/tests -v
```

The round-trip gate proves required facts survived rendering, planted
inconsistencies exist and are distinct, distractors do not collide with answer
values, and declared absences remain absent. The assertion compiler enumerates
all accepted money, date, number, section, and explicit synonym variants at
build time. Missing grounded facts and fabricated absent values are vetoes:
either condition forces reward to zero.

The minimal DOCX renderer fixes ZIP metadata and entry order so resampling a
manifest produces byte-identical evidence. Richer prose is stored in the
manifest's section paragraphs before compilation; generated prose is therefore
reviewable and hashable rather than regenerated during grading.

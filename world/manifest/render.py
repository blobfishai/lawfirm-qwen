#!/usr/bin/env python3
"""Render locked task manifests into byte-identical evidence documents."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import tempfile
import zipfile
from html import escape
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from world.manifest.roundtrip import check_roundtrip, validate_manifest
else:
    from .roundtrip import check_roundtrip, validate_manifest

FIXED_ZIP_TIME = (2026, 1, 1, 0, 0, 0)
PLACEHOLDER = re.compile(r"\{\{(fact|distractor):([a-zA-Z0-9_.-]+)\}\}")


def _materialize(text: str, values: dict[tuple[str, str], Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = (match.group(1), match.group(2))
        if key not in values:
            raise ValueError(f"unknown placeholder {match.group(0)}")
        return str(values[key])
    rendered = PLACEHOLDER.sub(replace, text)
    if "{{" in rendered or "}}" in rendered:
        raise ValueError(f"unresolved placeholder in {rendered!r}")
    return rendered


def _paragraphs(document: dict[str, Any], values: dict[tuple[str, str], Any]) -> list[tuple[str, str]]:
    rows = [("title", _materialize(document["title"], values))]
    for section in document["sections"]:
        rows.append(("heading", _materialize(section["heading"], values)))
        rows.extend(("body", _materialize(paragraph, values)) for paragraph in section["paragraphs"])
    return rows


def _zip_write(archive: zipfile.ZipFile, name: str, data: str) -> None:
    info = zipfile.ZipInfo(name, FIXED_ZIP_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    archive.writestr(info, data.encode("utf-8"))


def _write_docx(path: Path, rows: list[tuple[str, str]]) -> None:
    body = []
    for style, text in rows:
        style_xml = ""
        if style == "title":
            style_xml = '<w:pPr><w:pStyle w:val="Title"/></w:pPr>'
        elif style == "heading":
            style_xml = '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'
        body.append(f'<w:p>{style_xml}<w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>')
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:body>{"".join(body)}<w:sectPr/></w:body></w:document>'
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '</Types>'
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '</Relationships>'
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as archive:
        _zip_write(archive, "[Content_Types].xml", content_types)
        _zip_write(archive, "_rels/.rels", rels)
        _zip_write(archive, "word/document.xml", document_xml)


def render_manifest(manifest: dict[str, Any], output: Path) -> dict[str, Any]:
    validate_manifest(manifest)
    values = {("fact", item["id"]): item["value"] for item in manifest["facts"]}
    values.update({("distractor", item["id"]): item["value"] for item in manifest.get("distractors", [])})
    output.mkdir(parents=True, exist_ok=True)
    files = []
    for document in manifest["documents"]:
        path = output / document["filename"]
        rows = _paragraphs(document, values)
        if path.suffix.casefold() == ".docx":
            _write_docx(path, rows)
        elif path.suffix.casefold() in {".txt", ".md"}:
            path.write_text("\n\n".join(text for _, text in rows) + "\n", "utf-8", newline="\n")
        else:
            raise ValueError(f"unsupported output format: {path.name}")
        payload = path.read_bytes()
        files.append({"document": document["id"], "filename": path.name,
                      "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()})
    roundtrip = check_roundtrip(manifest, output)
    report = {"schema_version": 1, "manifest_id": manifest["manifest_id"],
              "files": files, "roundtrip": roundtrip}
    (output / "render-report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", "utf-8")
    if not roundtrip["passed"]:
        raise ValueError(f"round-trip gate failed: {roundtrip['failures']}")
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--check", action="store_true", help="render twice and require byte identity")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text("utf-8"))
    report = render_manifest(manifest, args.out)
    if args.check:
        with tempfile.TemporaryDirectory(prefix="manifest-render-") as temp:
            second = render_manifest(manifest, Path(temp))
        if report["files"] != second["files"]:
            raise SystemExit("non-deterministic render: file digests differ")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

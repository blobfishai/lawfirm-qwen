#!/usr/bin/env python3
"""Regression test: concurrent server startup never exposes a partial seed."""
from __future__ import annotations

import shutil
import sqlite3
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "world" / "local"))
import server  # noqa: E402


WORLD = {
    "tables": [
        {
            "name": "records",
            "columns": [{"name": "id", "type": "TEXT", "pk": True}],
            "sample_rows": [{"id": "record_001"}],
        }
    ]
}


def integrity(path: Path) -> str:
    connection = sqlite3.connect(path)
    try:
        return connection.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        connection.close()


def main() -> int:
    old_paths = server.STATE_DIR, server.SESS_DIR, server.SEED_DB
    try:
        with tempfile.TemporaryDirectory(prefix="legal-agent-atomic-seed-") as tmp:
            root = Path(tmp)
            server.STATE_DIR = str(root)
            server.SESS_DIR = str(root / "sessions")
            server.SEED_DB = str(root / "seed.db")
            server.build_seed_db(WORLD)

            entered = threading.Event()
            release = threading.Event()
            failure: list[BaseException] = []

            class SlowExtension:
                @staticmethod
                def create_and_seed(
                    connection: sqlite3.Connection,
                    skip_seed_tables: set[str] | None = None,
                ) -> None:
                    if skip_seed_tables != {"records"}:
                        raise AssertionError(
                            f"embedded-table exclusion was not forwarded: {skip_seed_tables}"
                        )
                    connection.execute("CREATE TABLE extension (id TEXT PRIMARY KEY)")
                    connection.execute("INSERT INTO extension VALUES ('extension_001')")
                    connection.commit()
                    entered.set()
                    if not release.wait(timeout=10):
                        raise TimeoutError("atomic seed test timed out")

            def rebuild() -> None:
                try:
                    server.build_seed_db(WORLD, v2=SlowExtension())
                except BaseException as error:  # surfaced in the main test thread
                    failure.append(error)

            writer = threading.Thread(target=rebuild, daemon=True)
            writer.start()
            if not entered.wait(timeout=10):
                raise AssertionError("concurrent seed build never reached extension phase")

            snapshot = root / "reader-copy.db"
            shutil.copyfile(server.SEED_DB, snapshot)
            if integrity(snapshot) != "ok":
                raise AssertionError("reader observed a malformed seed during rebuild")
            connection = sqlite3.connect(snapshot)
            try:
                extension_seen = connection.execute(
                    "SELECT COUNT(*) FROM sqlite_master WHERE name='extension'"
                ).fetchone()[0]
            finally:
                connection.close()
            if extension_seen:
                raise AssertionError("reader observed an unpublished partial extension")

            release.set()
            writer.join(timeout=10)
            if writer.is_alive():
                raise AssertionError("concurrent seed writer did not finish")
            if failure:
                raise failure[0]
            if integrity(Path(server.SEED_DB)) != "ok":
                raise AssertionError("published seed failed integrity check")

            connection = sqlite3.connect(server.SEED_DB)
            try:
                rows = connection.execute("SELECT COUNT(*) FROM extension").fetchone()[0]
            finally:
                connection.close()
            if rows != 1:
                raise AssertionError(f"published extension has {rows} rows; expected 1")
    finally:
        server.STATE_DIR, server.SESS_DIR, server.SEED_DB = old_paths

    print("atomic seed publication: reader saw complete old seed, then complete new seed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

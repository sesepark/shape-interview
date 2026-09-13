#!/usr/bin/env python3
"""비공개 tools/results.json을 공개용 assets/results.js로 변환한다."""

from __future__ import annotations

import hashlib
import json
import re
import secrets
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "tools" / "results.json"
OUT = ROOT / "assets" / "results.js"
ITERATIONS = 300_000
KEY_BYTES = 16
RESULT_CODES = {"junior_pass": "j", "regular_pass": "r", "rejected": "n"}
EXPECTED = {"junior_pass": 41, "regular_pass": 7, "rejected": 14}


def norm_name(name: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFC", name)).lower()


def norm_sid(sid: str) -> str:
    return re.sub(r"[^0-9]", "", sid)


def derive(material: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", material.encode("utf-8"), salt, ITERATIONS, KEY_BYTES
    ).hex()


def read_salt() -> bytes:
    if OUT.exists():
        found = re.search(r'"salt":\s*"([0-9a-f]+)"', OUT.read_text(encoding="utf-8"))
        if found:
            return bytes.fromhex(found.group(1))
    return secrets.token_bytes(16)


def main() -> int:
    if not SOURCE.exists():
        print(f"결과 명단 파일이 없습니다: {SOURCE}", file=sys.stderr)
        return 1

    rows = json.loads(SOURCE.read_text(encoding="utf-8"))
    counts = Counter(row.get("result") for row in rows)
    if len(rows) != 62 or counts != Counter(EXPECTED):
        print(f"인원 검증 실패: 전체 {len(rows)}명, 분류 {dict(counts)}", file=sys.stderr)
        print(f"기대값: 전체 62명, 분류 {EXPECTED}", file=sys.stderr)
        return 1

    names: set[str] = set()
    sids: set[str] = set()
    people: dict[str, str] = {}
    salt = read_salt()

    for row in rows:
        name = norm_name(row["name"])
        sid = norm_sid(row["sid"])
        result = row["result"]
        if not name or len(sid) != 9 or result not in RESULT_CODES:
            print(f"잘못된 결과 행: {row}", file=sys.stderr)
            return 1
        if name in names or sid in sids:
            print(f"이름 또는 학번 중복: {row}", file=sys.stderr)
            return 1
        names.add(name)
        sids.add(sid)
        key = derive(f"{name}|{sid}", salt)
        if key in people:
            print(f"조회 키 중복: {row['name']}", file=sys.stderr)
            return 1
        people[key] = RESULT_CODES[result]

    payload = {
        "salt": salt.hex(),
        "iterations": ITERATIONS,
        "bytes": KEY_BYTES,
        "people": dict(sorted(people.items())),
    }
    OUT.write_text(
        "/* 자동 생성 파일입니다. 고치지 마세요.\n"
        " * 공개 파일에는 이름과 학번이 없고, 조회 키와 결과 코드만 있습니다.\n"
        " * 다시 만들기: python3 tools/build_results.py\n"
        " */\n"
        f"window.SHAPE_RESULTS = {json.dumps(payload, ensure_ascii=False, indent=1)};\n",
        encoding="utf-8",
    )
    print(f"62명 (준회원 합격 41 · 정회원 합격 7 · 불합격 14) → {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

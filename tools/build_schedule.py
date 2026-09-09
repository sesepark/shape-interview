#!/usr/bin/env python3
"""tools/roster.json (비공개) → assets/schedule.js (공개)

이름과 학번은 결과물에 남지 않는다. 조회 키는 PBKDF2-HMAC-SHA256 으로만 싣고,
브라우저가 같은 방식으로 다시 계산해 맞춰 본다. 자세한 이유는 README 참고.

    python3 tools/build_schedule.py
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
import sys
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "tools" / "roster.json"
CONFIG = ROOT / "tools" / "interview.json"
OUT = ROOT / "assets" / "schedule.js"

ITERATIONS = 300_000  # 브라우저 한 번 조회 ≈ 0.1초. 대입 공격은 그만큼 비싸진다
KEY_BYTES = 16


def norm_name(name: str) -> str:
    """공백을 지우고 NFC 로 맞춘다. 라틴 문자는 소문자로.

    assets/app.js 의 normName 과 결과가 한 글자도 달라선 안 된다. 그래서
    casefold() 가 아니라 lower() 다 — 자바스크립트 toLowerCase() 와 같아야 한다.
    """
    return re.sub(r"\s+", "", unicodedata.normalize("NFC", name)).lower()


def norm_sid(sid: str) -> str:
    """2025-12345 도 202512345 도 같은 값이 되도록 숫자만 남긴다.

    `\\D` 가 아니라 `[^0-9]` 인 것도 같은 이유다. 파이썬의 `\\D` 는 유니코드
    숫자를 남기지만 자바스크립트는 아스키만 본다.
    """
    return re.sub(r"[^0-9]", "", sid)


def derive(material: str, salt: bytes) -> str:
    raw = hashlib.pbkdf2_hmac("sha256", material.encode("utf-8"), salt, ITERATIONS, KEY_BYTES)
    return raw.hex()


def read_salt() -> bytes:
    """이미 배포한 salt 는 그대로 쓴다. 바뀌면 예전 링크의 조회가 전부 깨진다."""
    if OUT.exists():
        found = re.search(r'"salt":\s*"([0-9a-f]+)"', OUT.read_text(encoding="utf-8"))
        if found:
            return bytes.fromhex(found.group(1))
    return secrets.token_bytes(16)


def main() -> int:
    if not ROSTER.exists():
        print(f"명단 파일이 없습니다: {ROSTER}", file=sys.stderr)
        print("tools/roster.example.json 를 복사해 채운 뒤 다시 실행하세요.", file=sys.stderr)
        return 1

    roster = json.loads(ROSTER.read_text(encoding="utf-8"))
    salt = read_salt()

    conf = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {}
    place_conf = conf.get("place", {})
    default_place = place_conf.get("default", "")
    by_date = place_conf.get("byDate", {})
    default_minutes = int(conf.get("durationMinutes", 0))

    people: dict[str, dict] = {}
    used_places: dict[str, str] = {}
    seen: set[str] = set()

    for row in roster:
        name, sid = norm_name(row["name"]), norm_sid(row["sid"])
        if not name or not sid:
            print(f"이름·학번이 비어 있습니다: {row}", file=sys.stderr)
            return 1
        if sid in seen:
            print(f"학번이 겹칩니다: {row['sid']}", file=sys.stderr)
            return 1
        seen.add(sid)

        if row.get("status") == "pending":
            record: dict = {"s": "pending"}
        else:
            y, m, d = (int(x) for x in row["date"].split("-"))
            record = {"d": row["date"], "t": int(row["start"])}
            # 요일은 파일을 만들 때 확정한다 — 브라우저 시계를 믿지 않는다.
            record["w"] = "월화수목금토일"[date(y, m, d).weekday()]
            # 장소·소요 시간은 표에서 정하고, 한 사람만 다르면 그 사람 항목이 이긴다.
            place = row.get("place") or by_date.get(row["date"], default_place)
            if row.get("place"):
                record["p"] = place
            else:
                used_places[row["date"]] = place
            if row.get("duration") and int(row["duration"]) != default_minutes:
                record["m"] = int(row["duration"])

        # 이름만으로도, 학번만으로도 맞출 수 없게 둘을 한 번에 넣어 키를 만든다.
        # 학번만의 해시를 따로 실으면 학번 전체(약 80만 가지)를 훑어 명단에 든
        # 학번을 골라낼 수 있어서, 그런 색인은 만들지 않는다.
        key = derive(f"{name}|{sid}", salt)
        if key in people:
            print(f"조회 키가 겹칩니다: {row['name']}", file=sys.stderr)
            return 1
        people[key] = record

    # 키 순으로 정렬한다. 파일에 적힌 순서에서 명단 순서를 읽을 수 없게.
    ordered = dict(sorted(people.items()))

    payload = {
        "salt": salt.hex(),
        "iterations": ITERATIONS,
        "bytes": KEY_BYTES,
        "place": default_place,
        "places": dict(sorted(used_places.items())),
        "minutes": default_minutes,
        "people": ordered,
    }
    body = json.dumps(payload, ensure_ascii=False, indent=1)
    OUT.write_text(
        "/* 자동 생성 파일입니다. 고치지 마세요.\n"
        " * 원천: tools/roster.json (저장소에 올리지 않습니다) + tools/interview.json\n"
        " * 다시 만들기: python3 tools/build_schedule.py\n"
        " */\n"
        f"window.SHAPE_SCHEDULE = {body};\n",
        encoding="utf-8",
    )

    pending = sum(1 for r in ordered.values() if r.get("s") == "pending")
    print(f"{len(ordered)}명 ({len(ordered) - pending}명 시간 확정, {pending}명 개별 조율) → {OUT.relative_to(ROOT)}")
    print(f"salt {salt.hex()} · {ITERATIONS:,}회 반복")
    for d, p in sorted(used_places.items()):
        print(f"  {d}  {p}")
    for r in ordered.values():
        if "p" in r:
            print(f"  {r['d']}  {r['p']}  (개인 지정)")
    others = sorted({r["m"] for r in ordered.values() if "m" in r})
    print(f"  면접 시간 {default_minutes}분" + (f" · 개인 지정 {others}" if others else " (전원 동일)"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
Verify an ActiveLedger chain (receipts/active_ledger.jsonl).

Re-walks the chain from GENESIS, recomputing every checksum. Any edit,
deletion, or reordering breaks the chain and is reported with the line no.
Exit 0 = chain intact, 1 = broken.
"""
import json
import sys

from active_ledger import fnv1a_64, chain_hash


def verify(path: str) -> bool:
    prev = fnv1a_64("GENESIS")
    ok = True
    n = 0
    with open(path) as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            n += 1
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                print(f"LINE {lineno}: invalid JSON")
                ok = False
                break
            body = {k: v for k, v in rec.items() if k not in ("checksum", "prev")}
            canonical = json.dumps(body, sort_keys=True, separators=(",", ":"))
            expected = chain_hash(prev, canonical)
            if rec.get("prev") != prev:
                print(f"LINE {lineno}: prev mismatch "
                      f"(got {rec.get('prev')}, want {prev})")
                ok = False
                break
            if rec.get("checksum") != expected:
                print(f"LINE {lineno}: checksum mismatch "
                      f"(got {rec.get('checksum')}, want {expected})")
                ok = False
                break
            prev = rec["checksum"]
    if ok:
        print(f"CHAIN OK — {n} receipts, tail={prev}")
    return ok


if __name__ == "__main__":
    p = sys.argv[1] if len(sys.argv) > 1 else "receipts/active_ledger.jsonl"
    sys.exit(0 if verify(p) else 1)

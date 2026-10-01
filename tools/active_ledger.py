#!/usr/bin/env python3
"""
ActiveLedger — append-only receipt writer (RD-PLAN Round 2, item 3).

Format: one JSON object per line in receipts/active_ledger.jsonl.
Each receipt carries an FNV-1a 64-bit checksum over its canonical content
and chains to the previous receipt's checksum (hash chain = tamper-evident).

R3: every receipt pins what it can — no float-only claims without a run id.
"""
import json
import os
import time

FNV_OFFSET = 0xcbf29ce484222325
FNV_PRIME = 0x100000001b3


def fnv1a_64(data: str) -> str:
    h = FNV_OFFSET
    for b in data.encode("utf-8"):
        h ^= b
        h = (h * FNV_PRIME) & 0xFFFFFFFFFFFFFFFF
    return format(h, "016x")


def chain_hash(prev: str, content: str) -> str:
    return fnv1a_64(prev + content)


class ActiveLedger:
    DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "..",
                                "receipts", "active_ledger.jsonl")

    def __init__(self, path: str = None):
        self.path = path or self.DEFAULT_PATH
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        self.last_hash = self._tail_hash()

    def _tail_hash(self) -> str:
        if not os.path.exists(self.path):
            return fnv1a_64("GENESIS")
        last = None
        with open(self.path) as f:
            for line in f:
                line = line.strip()
                if line:
                    last = line
        if last is None:
            return fnv1a_64("GENESIS")
        try:
            return json.loads(last)["checksum"]
        except (json.JSONDecodeError, KeyError):
            return fnv1a_64("CORRUPT")

    def append(self, event: str, dials_before: dict, dials_after: dict,
               prompt: str = "", run_id: str = "", meta: dict = None) -> dict:
        body = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "event": event,
            "dials_before": dials_before,
            "dials_after": dials_after,
            "prompt": prompt,
            "run_id": run_id,
            "meta": meta or {},
        }
        canonical = json.dumps(body, sort_keys=True, separators=(",", ":"))
        body["checksum"] = chain_hash(self.last_hash, canonical)
        body["prev"] = self.last_hash
        with open(self.path, "a") as f:
            f.write(json.dumps(body) + "\n")
        self.last_hash = body["checksum"]
        return body


def main():
    ledger = ActiveLedger()
    r = ledger.append(
        event="ROUND2_SELFTEST",
        dials_before={"contrast": 1.3, "blackPoint": 0.15, "trailDecay": 0.5},
        dials_after={"contrast": 1.8, "blackPoint": 0.40, "trailDecay": 0.4},
        prompt="heavy woodcut carving",
        run_id="selftest-001",
        meta={"source": "tools/active_ledger.py self-test"},
    )
    print(json.dumps(r, indent=2))


if __name__ == "__main__":
    main()

from __future__ import annotations

import sys
from pathlib import Path

import uvicorn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
LOG = ROOT / "uvicorn.log"


def main() -> None:
    with LOG.open("a", encoding="utf-8") as log:
        sys.stdout = log
        sys.stderr = log
        uvicorn.run("api.index:app", host="127.0.0.1", port=8000, log_level="info")


if __name__ == "__main__":
    main()

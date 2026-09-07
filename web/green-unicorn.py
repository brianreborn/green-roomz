#!/usr/bin/env python3
"""Green Unicorn launcher.

Opens the Roomz web/file-drop UI at http://127.0.0.1:8080/unicorn
(same gateway as scripts/chat-mvp.cmd). Does not start a second chat server.
"""
from __future__ import annotations

import sys
import urllib.error
import urllib.request
import webbrowser

BASE = "http://127.0.0.1:8080"
UNICORN = BASE + "/unicorn"


def main() -> int:
    try:
        urllib.request.urlopen(UNICORN, timeout=5)
    except urllib.error.HTTPError as err:
        print(f"GET /unicorn -> HTTP {err.code}. Bounce Roomz serve onto current main.", file=sys.stderr)
        return 1
    except Exception as err:
        print(f"Gateway not reachable at {BASE} ({err}).", file=sys.stderr)
        print(r"Start Roomz first: scripts\start-windows-mvp.cmd", file=sys.stderr)
        return 1
    print(f"Opening {UNICORN}")
    print("Console sibling: scripts\\chat-mvp.cmd")
    webbrowser.open(UNICORN)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
Discovers Disney Lorcana Challenge (DLC) and Challenge Championship
Qualifier (CCQ) events on the Ravensburger Play Hub and imports any that
aren't already in this repo's Tournament History archive, via
POST /api/tournament-history?endpoint=import.

Why this exists: the admin import page (/admin/tournament-import) only
imports one event URL at a time, and there's no upstream "list of DLCs and
CCQs" endpoint — CCQs in particular are independently named by each store,
not tagged by a shared template, so discovery has to search by name. See
SKILL.md in this directory for the full write-up of how this was reverse
engineered.

State is cached in two JSON files next to this script:
  - imported_cache.json: events successfully imported before. Completed
    events don't change, so these are skipped on repeat runs unless
    --force is passed.
  - dead_cache.json: events confirmed to have zero rounds/standings ever
    recorded on the Play Hub (the store marked them "complete" without
    ever running matches through the platform). These can never succeed,
    so they're skipped unless --force-dead is passed.

Usage:
  python3 sync_import.py --token <supabase_access_token> [--dry-run] [--force] [--force-dead]

The token is a short-lived Supabase session access_token for an admin
account (see SKILL.md for how to obtain one) — never hardcode or commit it.
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RAVEN_BASE = "https://api.ravensburgerplay.com/api/v2"
GAME_SLUG = "disney-lorcana"
DLC_TEMPLATE_ID = "a1b77361-c19e-4942-8741-f6b96bb24a80"  # "Disney Lorcana Challenge" event-configuration-template
APP_BASE = "https://lorcana-pro-tools.vercel.app"

SCRIPT_DIR = Path(__file__).resolve().parent
IMPORTED_CACHE_PATH = SCRIPT_DIR / "imported_cache.json"
DEAD_CACHE_PATH = SCRIPT_DIR / "dead_cache.json"


def http_get_json(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_post_json(url, body, token, timeout=45):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {"error": str(e)}
    except Exception as e:
        return 0, {"error": str(e)}


def paginate_events(query_params, page_size=100):
    """Fetches every page of /events/ for the given query params, returns the merged results list."""
    results = []
    page = 1
    while True:
        qs = "&".join(f"{k}={v}" for k, v in query_params.items())
        url = f"{RAVEN_BASE}/events/?{qs}&page_size={page_size}&page={page}"
        d = http_get_json(url)
        results.extend(d.get("results", []))
        nxt = d.get("next_page_number")
        if not nxt:
            break
        page = nxt
    return results


def discover_dlc():
    return paginate_events({"game_slug": GAME_SLUG, "event_configuration_template_id": DLC_TEMPLATE_ID})


def discover_ccq():
    # "name=CCQ" is a contains-match on the upstream API, not an exact match
    # (confirmed empirically) — it's the only working text-search filter
    # found on this endpoint.
    return paginate_events({"game_slug": GAME_SLUG, "name": "CCQ"})


def load_cache(path):
    if path.exists():
        return json.loads(path.read_text())
    return {}


def save_cache(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True) + "\n")


def try_import(event_id, event_name, token, dry_run):
    if dry_run:
        return "dry-run", None
    event_url = f"https://tcg.ravensburgerplay.com/events/{event_id}"
    for attempt in range(2):
        status, body = http_post_json(
            f"{APP_BASE}/api/tournament-history?endpoint=import", {"eventUrl": event_url}, token
        )
        if status == 200:
            return "ok", body
        if status == 400 and "no completed round" in str(body.get("error", "")):
            return "no-standings", body
        if status in (401, 403):
            return "auth-error", body
        # transient (network error, 5xx, etc.) -> retry once
        if attempt == 0:
            time.sleep(2)
            continue
        return "transient-error", body
    return "transient-error", None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--token", required=False, help="Supabase admin access_token")
    ap.add_argument("--dry-run", action="store_true", help="Discover and diff only, don't call the import endpoint")
    ap.add_argument("--force", action="store_true", help="Re-import events already in imported_cache.json")
    ap.add_argument("--force-dead", action="store_true", help="Retry events already in dead_cache.json")
    args = ap.parse_args()

    if not args.dry_run and not args.token:
        print("ERROR: --token is required unless --dry-run is passed", file=sys.stderr)
        sys.exit(1)

    imported_cache = load_cache(IMPORTED_CACHE_PATH)
    dead_cache = load_cache(DEAD_CACHE_PATH)

    print("Discovering DLC events...", file=sys.stderr)
    dlc_events = discover_dlc()
    print(f"  found {len(dlc_events)} total DLC-template events", file=sys.stderr)

    print("Discovering CCQ events...", file=sys.stderr)
    ccq_events = discover_ccq()
    print(f"  found {len(ccq_events)} total name-matched CCQ events", file=sys.stderr)

    all_events = {}
    for e in dlc_events:
        all_events[e["id"]] = ("DLC", e)
    for e in ccq_events:
        # a CCQ template event could theoretically also match the DLC template;
        # DLC label wins if so, since dict insertion order already set it above
        all_events.setdefault(e["id"], ("CCQ", e))

    candidates = []
    skipped_not_complete = 0
    skipped_cached = 0
    skipped_dead = 0
    for eid, (label, e) in all_events.items():
        eid_str = str(eid)
        if e.get("display_status") != "complete":
            skipped_not_complete += 1
            continue
        if not args.force_dead and eid_str in dead_cache:
            skipped_dead += 1
            continue
        if not args.force and eid_str in imported_cache:
            skipped_cached += 1
            continue
        candidates.append((label, eid_str, e.get("name")))

    print(
        f"\n{len(candidates)} candidate(s) to import "
        f"(skipped: {skipped_not_complete} not-yet-complete, {skipped_cached} already-cached, {skipped_dead} known-dead)\n",
        file=sys.stderr,
    )

    results = {"ok": [], "no-standings": [], "transient-error": [], "auth-error": [], "dry-run": []}

    for label, eid, name in candidates:
        outcome, body = try_import(eid, name, args.token, args.dry_run)
        results[outcome].append((label, eid, name, body))
        print(f"[{label}] {eid} {name!r} -> {outcome}" + (f": {body}" if outcome != "ok" else ""))

        if outcome == "ok":
            imported_cache[eid] = {
                "label": label,
                "name": name,
                "imported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "standingsImported": body.get("standingsImported"),
                "matchesImported": body.get("matchesImported"),
            }
        elif outcome == "no-standings":
            dead_cache[eid] = {
                "label": label,
                "name": name,
                "reason": "no completed round with generated standings on Ravensburger Play Hub",
                "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        if outcome == "auth-error":
            print("Auth error — token likely expired or lacks admin tier. Stopping early.", file=sys.stderr)
            break

        if not args.dry_run:
            time.sleep(0.5)

    if not args.dry_run:
        save_cache(IMPORTED_CACHE_PATH, imported_cache)
        save_cache(DEAD_CACHE_PATH, dead_cache)

    print("\n=== SUMMARY ===")
    print(f"Imported OK: {len(results['ok'])}")
    print(f"No standings yet (upstream, will retry next run): {len(results['no-standings'])}")
    print(f"Transient errors (rerun to retry): {len(results['transient-error'])}")
    print(f"Auth errors: {len(results['auth-error'])}")
    if args.dry_run:
        print(f"(dry run — {len(results['dry-run'])} would have been attempted)")


if __name__ == "__main__":
    main()

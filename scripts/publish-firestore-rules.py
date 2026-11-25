#!/usr/bin/env python3
"""Publish firestore.rules with the Firebase Rules API.

Uses the caller access token only. Does not call the Firebase CLI or
serviceusage.googleapis.com, so roles/firebaserules.admin is enough.
"""
import json
import os
import sys
import urllib.error
import urllib.request

PROJECT = os.environ.get("FIREBASE_PROJECT", "sayonara-sales")
RULES_FILE = os.environ.get("RULES_FILE", "firestore.rules")
API = os.environ.get("FIREBASE_RULES_API", "https://firebaserules.googleapis.com").rstrip("/")
TOKEN = os.environ.get("ACCESS_TOKEN", "")
RELEASE_ID = "cloud.firestore"


def die(msg):
    print(msg, file=sys.stderr)
    raise SystemExit(1)


def call(method, url, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode()


def main():
    if not TOKEN:
        die("ACCESS_TOKEN is empty. Workload Identity did not return a token. See docs/rules-deploy.md.")
    rules = open(RULES_FILE, encoding="utf-8").read()
    if "service cloud.firestore" not in rules:
        die(f"{RULES_FILE} is not a Firestore rules file.")

    code, ruleset = call(
        "POST",
        f"{API}/v1/projects/{PROJECT}/rulesets",
        {"source": {"files": [{"name": "firestore.rules", "content": rules}]}},
    )
    if code >= 300 or not isinstance(ruleset, dict) or "name" not in ruleset:
        die(f"Create ruleset failed: HTTP {code}\n{ruleset}")
    ruleset_name = ruleset["name"]
    release_name = f"projects/{PROJECT}/releases/{RELEASE_ID}"

    code, body = call(
        "PATCH",
        f"{API}/v1/{release_name}",
        {
            "release": {"name": release_name, "rulesetName": ruleset_name},
            "updateMask": "rulesetName",
        },
    )
    if code == 404:
        code, body = call(
            "POST",
            f"{API}/v1/projects/{PROJECT}/releases",
            {"name": release_name, "rulesetName": ruleset_name},
        )
    if code >= 300:
        die(f"Point release at ruleset failed: HTTP {code}\n{body}")
    print(f"Released {ruleset_name} to {release_name}")


if __name__ == "__main__":
    main()

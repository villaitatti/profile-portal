#!/usr/bin/env bash
# Assert that the release version is stated identically in every place that
# ships it.
#
# Why this exists: packages/server/tsup.config.ts bakes the ROOT package.json
# version into `__APP_VERSION__`, which is what `/api/health/ready` reports and
# what the DEPLOYMENT.md release gate asks the operator to verify. The release
# tag, on the other hand, is validated against the `VERSION` file. Those two
# sources drifted once (VERSION said 0.17.14 while package.json still said
# 0.17.13), which meant a correctly-tagged production release would have
# reported the wrong version at runtime. This check makes that impossible.
#
# Usage:
#   scripts/check-version-consistency.sh            # check the working tree
#   scripts/check-version-consistency.sh <git-ref>  # check a commit/tag
set -euo pipefail

ref="${1:-}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

read_tracked_file() {
  local path="$1"
  if [[ -n "$ref" ]]; then
    git show "$ref:$path"
  else
    cat "$repo_root/$path"
  fi
}

version_file="$(read_tracked_file VERSION | tr -d '\r\n[:space:]')"

# Portable extraction of the first top-level "version" key. Deliberately avoids
# node/jq/python so this also runs on the self-hosted deploy runners.
package_version="$(read_tracked_file package.json \
  | sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
  | head -n 1)"

changelog_version="$(read_tracked_file CHANGELOG.md \
  | sed -n 's/^##[[:space:]]*\[\([0-9][^]]*\)\].*/\1/p' \
  | head -n 1)"

failed=0

fail() {
  echo "ERROR: $1" >&2
  failed=1
}

if [[ -z "$version_file" ]]; then
  fail "VERSION is empty or unreadable${ref:+ at $ref}."
fi
if [[ -z "$package_version" ]]; then
  fail "Could not read the \"version\" field from root package.json${ref:+ at $ref}."
fi
if [[ -z "$changelog_version" ]]; then
  fail "Could not read the latest '## [x.y.z]' heading from CHANGELOG.md${ref:+ at $ref}."
fi

if [[ -n "$version_file" && ! "$version_file" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  fail "VERSION must be a three-level version such as 0.17.15 (got '$version_file')."
fi

if [[ -n "$version_file" && -n "$package_version" && "$version_file" != "$package_version" ]]; then
  fail "Root package.json version ($package_version) does not match VERSION ($version_file).
       The server bakes package.json's version into /api/health/ready, so this
       drift makes the deployed build report the wrong release. Update both."
fi

if [[ -n "$version_file" && -n "$changelog_version" && "$version_file" != "$changelog_version" ]]; then
  fail "The newest CHANGELOG.md entry ($changelog_version) does not match VERSION ($version_file).
       Add the changelog entry for this release, or correct VERSION."
fi

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo "Version is consistent across VERSION, package.json, and CHANGELOG.md: $version_file"

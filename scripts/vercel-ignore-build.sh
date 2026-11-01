#!/usr/bin/env bash
# Vercel's "Ignored Build Step": exit 0 skips the deployment, exit 1 builds it.
#
# Skips a push only when nothing in it can change the running app: CI
# workflows, docs, tests and test config. Dependabot's GitHub Actions bumps are
# the usual case. Every deployment stores its own copy of the function bundles,
# so a skipped one costs no Function Storage; the last deployment keeps serving.
#
# Builds whenever it can't tell: no previous deployment to compare with, or a
# history too shallow to reach it. Also builds when no file changed at all: an
# empty commit is how to redeploy on purpose, say after changing an
# environment variable.
set -u

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  echo "No earlier deployment to compare with: building."
  exit 1
fi

if git diff --quiet "$base" HEAD; then
  echo "Nothing changed since $base, so this is a deliberate redeploy: building."
  exit 1
fi

if git diff --quiet "$base" HEAD -- . \
  ':(exclude).github/**' \
  ':(exclude)docs/**' \
  ':(exclude)e2e/**' \
  ':(exclude,glob)**/*.md' \
  ':(exclude,glob)**/*.test.ts' \
  ':(exclude,glob)**/*.test.tsx' \
  ':(exclude)services/analytics/tests/**' \
  ':(exclude).env.example' \
  ':(exclude,glob)**/.gitignore' \
  ':(exclude)playwright.config.ts' \
  ':(exclude)vitest.config.ts' \
  ':(exclude)eslint.config.mjs'; then
  echo "Only CI, docs or tests changed since $base: skipping this deployment."
  exit 0
fi

echo "App files changed since $base: building."
exit 1

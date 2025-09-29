#!/bin/bash

# Generate grouped PR Summary (release-please style)
# Usage: ./scripts/generate-pr-summary.sh [base_branch] [head_branch]

BASE_BRANCH=${1:-origin/main}
HEAD_BRANCH=${2:-HEAD}

SUMMARY=$(git log --pretty=format:'%s' "$BASE_BRANCH..$HEAD_BRANCH")

# Initialize categories
FEATURES=""
FIXES=""
DOCS=""
STYLES=""
REFACTOR=""
PERF=""
TESTS=""
BUILD=""
CI=""
CHORES=""
REVERTS=""
OTHERS=""

# Categorize commits
while IFS= read -r line; do
  case "$line" in
    feat*) FEATURES+="- ${line#feat*: }"$'\n' ;;
    fix*)  FIXES+="- ${line#fix*: }"$'\n' ;;
    docs*) DOCS+="- ${line#docs*: }"$'\n' ;;
    style*) STYLES+="- ${line#style*: }"$'\n' ;;
    refactor*) REFACTOR+="- ${line#refactor*: }"$'\n' ;;
    perf*) PERF+="- ${line#perf*: }"$'\n' ;;
    test*) TESTS+="- ${line#test*: }"$'\n' ;;
    build*) BUILD+="- ${line#build*: }"$'\n' ;;
    ci*) CI+="- ${line#ci*: }"$'\n' ;;
    chore*) CHORES+="- ${line#chore*: }"$'\n' ;;
    revert*) REVERTS+="- ${line#revert*: }"$'\n' ;;
    merge*) CHORES+="- ${line#merge*: }"$'\n' ;;
    *) OTHERS+="- ${line}"$'\n' ;;
  esac
done <<< "$SUMMARY"

# Build output
OUT="# PR Summary"$'\n'

[[ -n "$FEATURES" ]] && OUT+=$'\n'"## 🚀 Features"$'\n'"$FEATURES"
[[ -n "$FIXES" ]] && OUT+=$'\n'"## 🐛 Bug Fixes"$'\n'"$FIXES"
[[ -n "$DOCS" ]] && OUT+=$'\n'"## 📚 Documentation"$'\n'"$DOCS"
[[ -n "$STYLES" ]] && OUT+=$'\n'"## 🎨 Styles"$'\n'"$STYLES"
[[ -n "$REFACTOR" ]] && OUT+=$'\n'"## ♻️ Code Refactoring"$'\n'"$REFACTOR"
[[ -n "$PERF" ]] && OUT+=$'\n'"## ⚡ Performance Improvements"$'\n'"$PERF"
[[ -n "$TESTS" ]] && OUT+=$'\n'"## 🧪 Tests"$'\n'"$TESTS"
[[ -n "$BUILD" ]] && OUT+=$'\n'"## 🔧 Build System"$'\n'"$BUILD"
[[ -n "$CI" ]] && OUT+=$'\n'"## 👷 Continuous Integration"$'\n'"$CI"
[[ -n "$CHORES" ]] && OUT+=$'\n'"## 🧹 Chores"$'\n'"$CHORES"
[[ -n "$REVERTS" ]] && OUT+=$'\n'"## ⏪ Reverts"$'\n'"$REVERTS"
[[ -n "$OTHERS" ]] && OUT+=$'\n'"## 🌀 Others"$'\n'"$OTHERS"

echo "$OUT" 
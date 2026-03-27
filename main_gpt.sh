#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

PYTHON_BIN="${PYTHON_BIN:-$SCRIPT_DIR/.venv/bin/python}"
SOURCES=(${DAILY_SOURCES:-github huggingface})
GH_LANGUAGES=(${GH_LANGUAGES:-all})
HF_CONTENT_TYPES=(${HF_CONTENT_TYPES:-papers models})
IDEA_ARGS=()
REPORT_ARGS=()

if [ "${GENERATE_IDEAS:-0}" = "1" ]; then
  IDEA_ARGS+=(
    --generate_ideas
    --researcher_profile "${RESEARCHER_PROFILE:-researcher_profile.md}"
    --idea_min_score "${IDEA_MIN_SCORE:-7}"
    --idea_max_items "${IDEA_MAX_ITEMS:-15}"
    --idea_count "${IDEA_COUNT:-5}"
  )
fi

if [ "${GENERATE_REPORT:-0}" = "1" ]; then
  REPORT_ARGS+=(--generate_report)
  if [ -n "${REPORT_PROFILE_FILE:-}" ]; then
    REPORT_ARGS+=(--report_profile "${REPORT_PROFILE_FILE}")
  fi
  if [ -n "${REPORT_TITLE:-}" ]; then
    REPORT_ARGS+=(--report_title "${REPORT_TITLE}")
  fi
  REPORT_ARGS+=(
    --report_min_score "${REPORT_MIN_SCORE:-4.0}"
    --report_max_items "${REPORT_MAX_ITEMS:-18}"
    --report_theme_count "${REPORT_THEME_COUNT:-4}"
    --report_prediction_count "${REPORT_PREDICTION_COUNT:-4}"
    --report_idea_count "${REPORT_IDEA_COUNT:-4}"
  )
  if [ "${SEND_REPORT_EMAIL:-0}" = "1" ]; then
    REPORT_ARGS+=(--send_report_email)
  fi
fi

"$PYTHON_BIN" main.py \
  --sources "${SOURCES[@]}" \
  --description "${DESCRIPTION_FILE:-description.txt}" \
  --num_workers "${NUM_WORKERS:-8}" \
  --temperature "${TEMPERATURE:-${LLM_TEMPERATURE:-0.5}}" \
  --save \
  --gh_languages "${GH_LANGUAGES[@]}" \
  --gh_since "${GH_SINCE:-daily}" \
  --gh_max_repos "${GH_MAX_REPOS:-30}" \
  --hf_content_type "${HF_CONTENT_TYPES[@]}" \
  --hf_max_papers "${HF_MAX_PAPERS:-30}" \
  --hf_max_models "${HF_MAX_MODELS:-15}" \
  "${REPORT_ARGS[@]}" \
  "${IDEA_ARGS[@]}"

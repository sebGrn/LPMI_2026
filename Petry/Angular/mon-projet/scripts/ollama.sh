#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ollama_bin="$project_dir/.local/ollama/bin/ollama"
if [[ ! -x "$ollama_bin" ]]; then
  if command -v ollama >/dev/null 2>&1; then
    ollama_bin="$(command -v ollama)"
  else
    echo 'Ollama absent. Consultez le README pour son installation.' >&2
    exit 1
  fi
fi
export OLLAMA_HOST=127.0.0.1:11434
export OLLAMA_MODELS="$project_dir/.local/ollama/models"
export OLLAMA_NO_CLOUD=1
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_CONTEXT_LENGTH=8192
exec "$ollama_bin" "$@"

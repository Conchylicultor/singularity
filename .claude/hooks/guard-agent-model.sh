#!/usr/bin/env bash
# PreToolUse guard: refuse Agent tool calls that omit the `model` parameter.
# CLAUDE.md rule: always pass model="sonnet" explicitly — never let it default.
set -euo pipefail

deny() {
  jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

model=$(jq -r '.tool_input.model // empty')
[ -n "$model" ] && exit 0

deny "Agent tool call is missing the required \`model\` parameter. Always pass model explicitly (e.g. model: \"sonnet\"). Default: Sonnet for all research/lookup/synthesis/reporting tasks. Only use Opus for load-bearing complex implementation tasks. See CLAUDE.md: \"Subagents default to Sonnet.\""

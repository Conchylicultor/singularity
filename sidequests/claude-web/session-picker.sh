#!/bin/bash
# session-picker.sh — List and reattach to existing Claude tmux sessions
#
# Bookmark: localhost:8103
# Shows existing sessions with arrow-key navigation, or creates a new one.

WORKDIR="/Users/admin/__A__/dev/singularity"
PREFIX="claude"
TMUX="/opt/homebrew/bin/tmux"
CLAUDE="/Users/admin/.local/bin/claude"

create_new() {
  local name="${PREFIX}-$(date +%s)"
  $TMUX -u new-session -d -s "$name" -c "$WORKDIR" "zsh -l -c '$CLAUDE'"
  exec $TMUX -u attach -t "$name"
}

# Collect existing sessions
existing=$($TMUX list-sessions -F "#{session_name}" -f "#{m:${PREFIX}-*,#{session_name}}" 2>/dev/null)

# No existing sessions — go straight to new
if [[ -z "$existing" ]]; then
  echo "  No existing sessions. Starting a new one..."
  sleep 1
  create_new
fi

# Build session list
declare -a names
declare -a labels
i=0

# "New session" is always first
names[$i]="__new__"
labels[$i]="+ New session"
((i++))

while IFS= read -r s; do
  created=$($TMUX display-message -t "$s" -p "#{t:session_created}" 2>/dev/null)
  preview=$($TMUX capture-pane -t "$s" -p 2>/dev/null | grep -v "^$" | tail -1 | cut -c1-60)
  names[$i]="$s"
  label="$s  [$created]"
  [[ -n "$preview" ]] && label="$label  $preview"
  labels[$i]="$label"
  ((i++))
done <<< "$existing"

total=${#names[@]}
selected=0

# Hide cursor, handle cleanup
tput civis 2>/dev/null
cleanup() { tput cnorm 2>/dev/null; }
trap cleanup EXIT

draw() {
  clear
  echo ""
  echo "  Claude Code Sessions"
  echo "  ===================="
  echo "  (↑/↓ to navigate, Enter to select, q to quit)"
  echo ""

  for j in $(seq 0 $((total - 1))); do
    if [[ $j -eq $selected ]]; then
      echo "  → ${labels[$j]}"
    else
      echo "    ${labels[$j]}"
    fi
  done
}

draw

while true; do
  # Read a single keypress
  IFS= read -rsn1 key

  case "$key" in
    $'\x1b')
      # Read escape sequence byte by byte for ttyd compatibility
      read -rsn1 -t 1 seq1
      read -rsn1 -t 1 seq2
      case "${seq1}${seq2}" in
        '[A'|'OA') # Up arrow
          ((selected--))
          [[ $selected -lt 0 ]] && selected=$((total - 1))
          ;;
        '[B'|'OB') # Down arrow
          ((selected++))
          [[ $selected -ge $total ]] && selected=0
          ;;
      esac
      ;;
    '') # Enter
      chosen="${names[$selected]}"
      if [[ "$chosen" == "__new__" ]]; then
        create_new
      else
        exec $TMUX -u attach -t "$chosen"
      fi
      ;;
    'q'|'Q')
      exit 0
      ;;
    [0-9])
      # Direct number selection (1-indexed for sessions)
      idx=$((key))
      if [[ $idx -ge 0 && $idx -lt $total ]]; then
        selected=$idx
      fi
      ;;
  esac

  draw
done

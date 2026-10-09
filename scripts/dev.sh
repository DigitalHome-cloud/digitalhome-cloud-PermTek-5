#!/usr/bin/env bash
#
# Everything you need running, in one terminal.
#
#   npm run dev                     the sandbox and the site
#   npm run dev -- --web-only       the site alone, against whatever backend
#                                   amplify_outputs.json already points at
#   npm run dev -- --profile work   a different AWS profile
#   npm run dev -- --identifier qa  a second, parallel sandbox
#
# Two long-running processes with an ordering constraint between them, which is
# why this exists rather than two terminals: `ampx sandbox` writes
# amplify_outputs.json, and the site is useless without it. Started in the
# wrong order — or in two terminals where nobody watched — Gatsby boots, finds
# no outputs, and renders the "backend not configured" notice for the rest of
# the session. It looks like a broken build and is only a race.
#
# So: the sandbox goes first, this script waits for the outputs to land, copies
# them into the site, and only then starts Gatsby. It keeps copying, because
# every redeploy rewrites the file and Gatsby needs to see the new one.
#
# Ctrl-C stops both. The sandbox itself is NOT deleted — it is meant to outlive
# a dev session. Delete it deliberately with:
#
#   npm --prefix backend run sandbox:delete
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
SITE="$ROOT/packages/site"
OUTPUTS="$BACKEND/amplify_outputs.json"
SITE_OUTPUTS="$SITE/src/amplify_outputs.json"
LOG="$ROOT/.dev-sandbox.log"

WEB_ONLY=0
PROFILE=""
IDENTIFIER=""

while [ $# -gt 0 ]; do
  case "$1" in
    --web-only)   WEB_ONLY=1; shift ;;
    --profile)    PROFILE="${2:-}"; shift 2 ;;
    --identifier) IDENTIFIER="${2:-}"; shift 2 ;;
    # The header comment IS the help text. Extracted by reading until the
    # first non-comment line rather than by line number, so it cannot drift
    # out of step with the comment it is quoting.
    -h|--help)    awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' \
                    "${BASH_SOURCE[0]}"; exit 0 ;;
    *)            echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

say()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n\n' "$*" >&2; exit 1; }

# -- which AWS account? ------------------------------------------------------
#
# Nothing in this repository names an account, and nothing should: the answer
# differs per developer and per machine, and an account id in a committed file
# is both wrong for everyone else and a thing you then have to redact.
#
# `ampx sandbox` uses the ordinary AWS SDK credential chain, in this order:
#
#   1. AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN
#   2. AWS_PROFILE, or --profile passed here
#   3. the [default] profile in ~/.aws/credentials and ~/.aws/config
#   4. SSO, then the EC2/ECS instance role
#
# Which means the account is whatever your shell is already pointing at. That
# is convenient and it is exactly how someone deploys a sandbox into
# production by accident, so this prints the account and region and makes you
# look at them before anything is created.
preflight_aws() {
  local args=() ident who account region

  [ -n "$PROFILE" ] && args+=(--profile "$PROFILE")

  command -v aws >/dev/null 2>&1 || {
    warn "aws CLI not found — skipping the account check."
    warn "ampx will still resolve credentials on its own; you just will not"
    warn "see which account until it starts deploying."
    return 0
  }

  who="$(aws "${args[@]}" sts get-caller-identity --output json 2>/dev/null)" || die \
"No AWS credentials resolved${PROFILE:+ for profile '$PROFILE'}.

  Configure one of:
    aws configure --profile <name>     then: npm run dev -- --profile <name>
    export AWS_PROFILE=<name>
    aws sso login --profile <name>

  Or run the site alone, with no backend:
    npm run dev -- --web-only"

  account="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).Account))' <<<"$who")"
  region="$(aws "${args[@]}" configure get region 2>/dev/null || true)"
  region="${AWS_REGION:-${AWS_DEFAULT_REGION:-$region}}"
  ident="${IDENTIFIER:-$(id -un)}"

  say "AWS"
  printf '  account     %s\n' "$account"
  printf '  region      %s\n' "${region:-<unset — ampx will refuse to deploy>}"
  printf '  profile     %s\n' "${PROFILE:-${AWS_PROFILE:-default}}"
  printf '  sandbox     %s\n' "$ident"
  printf '\n  Stacks are named amplify-<backend>-%s-<hash>. The identifier is\n' "$ident"
  printf '  your system username unless you pass --identifier, so two people\n'
  printf '  never share a sandbox and one person can run several.\n'

  [ -z "$region" ] && die \
"No region set. ampx cannot deploy without one:
    aws configure set region eu-central-1${PROFILE:+ --profile $PROFILE}"
}

# -- Gatsby's file watchers --------------------------------------------------
#
# Constraint 10. Gatsby exhausts the default inotify allowance and
# dies with ENOSPC, which names neither Gatsby nor inotify in a way that
# suggests the fix. Checked here because the failure arrives ten seconds after
# a successful-looking start, by which point you are reading the wrong output.
preflight_inotify() {
  local watches instances
  [ -r /proc/sys/fs/inotify/max_user_watches ] || return 0
  watches="$(cat /proc/sys/fs/inotify/max_user_watches)"
  instances="$(cat /proc/sys/fs/inotify/max_user_instances)"
  if [ "$watches" -lt 524288 ] || [ "$instances" -lt 1024 ]; then
    warn "inotify limits are low (watches=$watches instances=$instances)."
    warn "Gatsby will likely die with ENOSPC. Raise them with:"
    warn "  sudo sysctl -w fs.inotify.max_user_watches=524288 fs.inotify.max_user_instances=1024"
  fi
}

# -- shutdown ----------------------------------------------------------------
#
# The two children need different treatment, and getting it wrong leaks a
# process that survives Ctrl-C and keeps running until the machine reboots.
#
# The sandbox is started under `setsid`, so it IS its own process-group leader
# and signalling the group reaches ampx and every CDK process it spawned.
# (setsid does not fork here, because a background job in a script with job
# control off is not already a group leader — so the pid we captured is the
# group leader. If anyone adds `set -m` to this script, that stops being true.)
#
# The sync watcher is a plain background subshell. It is NOT a group leader, so
# `kill -- -$pid` fails against it and the loop runs forever — verified, and it
# is exactly the kind of thing that looks fine because the terminal came back.
#
# So: try the group, and fall back to the process and its children.
SANDBOX_PID=""
SYNC_PID=""

stop_tree() {
  local pid="${1:-}"
  [ -n "$pid" ] || return 0
  kill -- -"$pid" 2>/dev/null && return 0   # a process group
  kill "$pid" 2>/dev/null || true           # the loop itself, first
  pkill -P "$pid" 2>/dev/null || true       # then whatever it was waiting on
  return 0
}

cleanup() {
  trap - INT TERM EXIT
  say "stopping"
  stop_tree "$SYNC_PID"
  stop_tree "$SANDBOX_PID"
  wait 2>/dev/null || true
  printf '  The sandbox is still deployed. Remove it with:\n'
  printf '    npm --prefix backend run sandbox:delete\n\n'
}

sync_outputs() {
  cp "$OUTPUTS" "$SITE_OUTPUTS"
}

# -- go ----------------------------------------------------------------------

preflight_inotify

if [ "$WEB_ONLY" -eq 1 ]; then
  if [ -f "$OUTPUTS" ]; then
    sync_outputs
    say "web only — using the existing $(basename "$OUTPUTS")"
  elif [ -f "$SITE_OUTPUTS" ]; then
    say "web only — using the outputs already in the site"
  else
    warn "web only, and there are no outputs anywhere."
    warn "The app will render its 'backend not configured' notice, which is"
    warn "the correct behaviour and worth seeing at least once."
  fi
  cd "$SITE"
  exec npx gatsby develop -H 0.0.0.0
fi

preflight_aws
trap cleanup INT TERM EXIT

# The sandbox is started in its own process group (setsid) so that cleanup can
# take its whole tree down, and detached from this terminal's stdin so it
# cannot swallow the Ctrl-C meant for the script.
say "starting the sandbox — first deploy takes a few minutes"
printf '  log: %s\n' "$LOG"
: > "$LOG"
(
  cd "$BACKEND"
  exec setsid npx ampx sandbox \
    ${PROFILE:+--profile "$PROFILE"} \
    ${IDENTIFIER:+--identifier "$IDENTIFIER"} \
    >>"$LOG" 2>&1 </dev/null
) &
SANDBOX_PID=$!

# Wait for the outputs file, watching the log rather than a fixed sleep: a
# first deploy is minutes and a redeploy is seconds, and any timeout that suits
# one is wrong for the other. A failure in the log ends the wait immediately,
# because otherwise a broken backend.ts looks like a slow deploy for ten
# minutes.
say "waiting for amplify_outputs.json"
before=""
[ -f "$OUTPUTS" ] && before="$(stat -c %Y "$OUTPUTS")"

while :; do
  if [ -f "$OUTPUTS" ]; then
    now="$(stat -c %Y "$OUTPUTS")"
    [ "$now" != "$before" ] && break
  fi
  if ! kill -0 "$SANDBOX_PID" 2>/dev/null; then
    printf '\n'; tail -30 "$LOG"
    die "The sandbox exited before writing outputs. Full log: $LOG"
  fi
  if grep -qiE '❌|Failed to (deploy|instantiate)|CREATE_FAILED|UPDATE_ROLLBACK' "$LOG" 2>/dev/null; then
    printf '\n'; tail -30 "$LOG"
    die "The sandbox deploy failed. Full log: $LOG"
  fi
  sleep 2
done

sync_outputs
say "backend is up — outputs copied into the site"

# Every redeploy rewrites the outputs, and the site imports that file, so it
# has to be re-copied for Gatsby's watcher to pick the change up. Polling on
# mtime rather than inotifywait, which is not installed by default on Ubuntu
# and would be a dependency for one two-second poll.
(
  last="$(stat -c %Y "$OUTPUTS")"
  while :; do
    sleep 2
    [ -f "$OUTPUTS" ] || continue
    now="$(stat -c %Y "$OUTPUTS")"
    if [ "$now" != "$last" ]; then
      last="$now"
      cp "$OUTPUTS" "$SITE_OUTPUTS" && printf '\033[1;36m▸ backend redeployed — outputs re-synced\033[0m\n'
    fi
  done
) &
SYNC_PID=$!

say "starting Gatsby — http://localhost:8000"
cd "$SITE"
npx gatsby develop -H 0.0.0.0

# Helpers for the terminal evidence. Each one is a plain curl request; nothing else.
# Values come from e2e/.results/terminal.env and ui.env, written by setup.ts and the
# Playwright run. Cookies, tokens and keys are only ever referenced by variable name.

# Who is calling: a synthetic User's session cookie, or no session at all ("-").
cookie_for() {
  case "$1" in
    A) printf '%s' "$A_COOKIE" ;;
    B) printf '%s' "$B_COOKIE" ;;
    F) printf '%s' "$F_COOKIE" ;;
    C_OLD) printf '%s' "$UI_C_COOKIE" ;;
    *) printf '' ;;
  esac
}

# Prints the response body (optionally filtered by jq) and the HTTP status.
show() {
  local out=$1 filter=$2
  local code=${out##*$'\n'} body=${out%$'\n'*}
  if [ -n "$body" ]; then
    printf '%s' "$body" | jq -c "$filter" 2>/dev/null || printf '%s\n' "$body" | head -c 400
  fi
  printf -- '-> HTTP %s\n' "$code"
}

# call WHO METHOD PATH [JSON] [JQ_FILTER]  A request to the web app from Monara's own origin.
call() {
  local cookie args out
  cookie=$(cookie_for "$1")
  args=(-s -X "$2" "$WEB$3" -H "Origin: $WEB" -w '\n%{http_code}')
  [ -n "$cookie" ] && args+=(-H "Cookie: $cookie")
  [ -n "${4:-}" ] && args+=(-H "Content-Type: application/json" -d "$4")
  out=$(curl "${args[@]}")
  show "$out" "${5:-.}"
}

# agent none|wrong|real PATH [JSON] [JQ_FILTER]  A request to an Agent-only route.
agent() {
  local args out data=${3:-}
  [ -z "$data" ] && data='{}'
  args=(-s -X POST "$WEB$2" -H "Content-Type: application/json" -d "$data" -w '\n%{http_code}')
  [ "$1" = wrong ] && args+=(-H "Authorization: Bearer wrong-secret")
  [ "$1" = real ] && args+=(-H "Authorization: Bearer $SECRET")
  out=$(curl "${args[@]}")
  show "$out" "${4:-.}"
}

# db_as A PATH [METHOD] [JSON]  PostgREST with the User's own access token (row-level security).
db_as() {
  local args out
  args=(-s -X "${3:-GET}" "$SUPA/rest/v1/$2" -H "apikey: $PUB" -H "Authorization: Bearer $A_TOKEN" -w '\n%{http_code}')
  [ -n "${4:-}" ] && args+=(-H "Content-Type: application/json" -d "$4")
  out=$(curl "${args[@]}")
  show "$out" .
}

# db_admin PATH  A service-role read, used only to verify stored state after a test.
db_admin() {
  local out
  out=$(curl -s "$SUPA/rest/v1/$1" -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -w '\n%{http_code}')
  show "$out" .
}

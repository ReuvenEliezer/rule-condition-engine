#!/usr/bin/env bash
# Seed a demo dataset — persons, cases, and rules with real condition trees — into a running
# Rule Condition Engine instance. Safe to re-run: it skips a person whose national id already
# exists, and skips a case that already holds a rule.
#
#   ./scripts/seed-demo.sh                       # against http://localhost:8080
#   API=http://localhost:9000 ./scripts/seed-demo.sh
set -euo pipefail

API="${API:-http://localhost:8080}/api/v1"

say() { printf '\033[36m%s\033[0m\n' "$*"; }
post() { curl -sS -X POST "$API/$1" -H 'Content-Type: application/json' -d "$2"; }

require() {
  command -v "$1" >/dev/null || { echo "need '$1' on PATH" >&2; exit 1; }
}
require curl
require python3

json() { python3 -c 'import sys,json;print(json.load(sys.stdin)'"$1"')'; }

# ---- persons ---------------------------------------------------------------------------------
say "Persons"

seed_person() {
  local name=$1 age=$2 city=$3 risk=$4 nid=$5
  if curl -sS "$API/persons?size=500" | python3 -c "
import sys,json
rows=json.load(sys.stdin)['content']
sys.exit(0 if any(r['name']=='$name' for r in rows) else 1)
"; then
    echo "  = $name (exists)"
  else
    post persons "{\"name\":\"$name\",\"age\":$age,\"city\":$city,\"risk\":\"$risk\",\"nationalId\":\"$nid\"}" >/dev/null
    echo "  + $name"
  fi
}

seed_person "AVI COHEN"        35 '"Haifa"'      HIGH     100000001
seed_person "AVI LEVI"         41 '"Haifa"'      CRITICAL 100000002
seed_person "DANA GOLDBERG"    29 '"Tel Aviv"'   LOW      100000003
seed_person "YOSSI MIZRAHI"    44 '"Beersheba"'  CRITICAL 100000004
seed_person "MAYA LEVI"        38 '"Haifa"'      MEDIUM   100000005
seed_person "NOA PERETZ"       51 '"Eilat"'      HIGH     100000006
seed_person "EITAN BARAK"      27 '"Netanya"'    LOW      100000007
seed_person "RONIT SHAPIRA"    63 '"Haifa"'      MEDIUM   100000008
seed_person "TAMAR AZULAI"     24 null           MEDIUM   100000009
seed_person "GIL HALEVI"       58 '"Tel Aviv"'   HIGH     100000010

# ---- a case + its rule ----------------------------------------------------------------------
# Creates the case if no case with that title exists, then attaches the rule if the case has none.
seed_rule() {
  local title=$1 status=$2 rule_name=$3 condition=$4

  local case_id
  case_id=$(curl -sS "$API/cases?size=500" | python3 -c "
import sys,json
for c in json.load(sys.stdin)['content']:
    if c['title']=='$title':
        print(c['id']); break
")
  if [ -z "$case_id" ]; then
    case_id=$(post cases "{\"title\":\"$title\",\"status\":\"$status\"}" | json '["id"]')
    echo "  + case '$title'  ($case_id)"
  else
    echo "  = case '$title'  ($case_id)"
  fi

  local rule_id
  rule_id=$(curl -sS "$API/cases/$case_id" | json '.get("ruleId")')
  if [ -n "$rule_id" ] && [ "$rule_id" != "None" ]; then
    echo "    = already has rule $rule_id"
    return
  fi

  local body
  body=$(python3 -c "
import json
print(json.dumps({
  'caseId': '$case_id',
  'name': '$rule_name',
  'enabled': True,
  'condition': $condition,
}))
")
  local out
  out=$(post rules "$body")
  printf '%s' "$out" | python3 -c '
import sys, json
d = json.load(sys.stdin)
if isinstance(d, dict) and d.get("id"):
    print("    + rule " + repr(d["name"]) + "  (" + d["id"] + ")")
else:
    print("    ! rule rejected: " + json.dumps(d))
'
}

say "Cases + rules with conditions"

seed_rule "Operation Northwind" OPEN "High-risk in Haifa" '
{"type":"GROUP","operator":"AND","children":[
  {"type":"CONDITION","field":"city","operator":"EQUALS","value":{"type":"STRING","value":"Haifa"}},
  {"type":"CONDITION","field":"risk","operator":"IN","value":{"type":"LIST","values":["HIGH","CRITICAL"]}}
]}'

seed_rule "Blue Harbor Review" UNDER_REVIEW "Adults aged 30 to 45" '
{"type":"CONDITION","field":"age","operator":"BETWEEN","value":{"type":"RANGE","from":30,"to":45}}'

seed_rule "Coastal Watch" OPEN "Named AVI, not low risk" '
{"type":"GROUP","operator":"AND","children":[
  {"type":"CONDITION","field":"name","operator":"CONTAINS","value":{"type":"STRING","value":"AVI"}},
  {"type":"CONDITION","field":"risk","operator":"NOT_EQUALS","value":{"type":"STRING","value":"LOW"}}
]}'

seed_rule "Night Market" OPEN "Seniors or anyone critical" '
{"type":"GROUP","operator":"OR","children":[
  {"type":"CONDITION","field":"age","operator":"GTE","value":{"type":"NUMBER","value":60}},
  {"type":"CONDITION","field":"risk","operator":"EQUALS","value":{"type":"STRING","value":"CRITICAL"}}
]}'

seed_rule "Silent Partner" UNDER_REVIEW "Subjects with a city on record" '
{"type":"GROUP","operator":"AND","children":[
  {"type":"CONDITION","field":"case.role","operator":"EQUALS","value":{"type":"STRING","value":"SUBJECT"}},
  {"type":"GROUP","operator":"NOT","children":[
    {"type":"UNARY","field":"city","operator":"IS_NULL"}
  ]}
]}'

seed_rule "Desert Route" OPEN "Young witnesses in open cases" '
{"type":"GROUP","operator":"AND","children":[
  {"type":"CONDITION","field":"age","operator":"LT","value":{"type":"NUMBER","value":30}},
  {"type":"CONDITION","field":"case.role","operator":"EQUALS","value":{"type":"STRING","value":"WITNESS"}},
  {"type":"CONDITION","field":"case.status","operator":"EQUALS","value":{"type":"STRING","value":"OPEN"}}
]}'

say "Done."
curl -sS "$API/rules?size=50&sort=name" | python3 -c '
import sys, json
d = json.load(sys.stdin)
print(str(d["totalElements"]) + " rules:")
for r in d["content"]:
    print("  - " + r["name"] + "  (case " + r["caseId"][:8] + ", enabled=" + str(r["enabled"]) + ")")
'

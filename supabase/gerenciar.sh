#!/bin/sh
# Gerencia o projeto Supabase pela API de gerenciamento, com o token de ~/.supabase/access-token
# (o mesmo do `supabase login`; nunca entra no repositório).
#   supabase/gerenciar.sh sql <arquivo.sql>     roda o SQL no banco (use - para ler da entrada)
#   supabase/gerenciar.sh auth '<json>'         altera a configuração do Auth (ex.: '{"jwt_exp":900}')
set -e
PROJETO=xqvybotystsygeorbspd
API=https://api.supabase.com/v1/projects/$PROJETO
TOKEN=${SUPABASE_ACCESS_TOKEN:-$(cat ~/.supabase/access-token)}
case "$1" in
  sql)
    python3 -c "import json,sys; print(json.dumps({'query': open(sys.argv[1]).read() if sys.argv[1] != '-' else sys.stdin.read()}))" "$2" |
      curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @- "$API/database/query"
    echo ;;
  auth)
    curl -sS -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$2" "$API/config/auth" -o /dev/null -w "HTTP %{http_code}\n" ;;
  *)
    echo "uso: $0 sql <arquivo.sql|-> | auth '<json>'" >&2; exit 1 ;;
esac

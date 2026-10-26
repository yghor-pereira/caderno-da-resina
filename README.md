# Caderno da Resina

Gestão financeira e de produção para pequenos produtores de pinus e goma resina: floresta (talhões, ramais, estria e coleta), produção, vendas com preço livre de Funrural, caixa, custo e margem. Funciona no celular, inclusive sem sinal na floresta.

## Usar

Abra o app publicado no GitHub Pages. Para conhecer sem cadastrar, toque em **Entrar como exemplo** (`produtor@exemplo.com` / `resina123`).

## Rodar localmente

```
python3 -m http.server 8000
```

Abra `http://localhost:8000`. Não há build nem dependências.

## Testes

```
npm test
```

Os testes usam o executor nativo do Node (18 ou mais recente).

## Como funciona

- Interface em HTML, CSS e JavaScript puro (módulos ES em `js/`).
- Contas e dados no Supabase, com RLS: cada produtor só vê os próprios registros. Esquema em `supabase/migrations/`.
- Tudo é salvo primeiro no aparelho e sincronizado quando há internet; o service worker (`sw.js`) permite abrir o app sem conexão.

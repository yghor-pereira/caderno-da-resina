# Caderno da Resina

App de gestão financeira e de produção para **pequenos produtores de pinus e resina** (goma resina). Hoje é um protótipo para validar a ideia com produtores reais. Responda e escreva a interface sempre em **português do Brasil**.

## Estado atual

- App estático, sem build e sem dependências: `index.html` (casca) + `css/app.css` + módulos ES em `js/`. Publicado no **GitHub Pages** (branch `main`, raiz); todos os caminhos são relativos.
- **Supabase** (projeto `xqvybotystsygeorbspd`, região `us-east-1`; migrar para São Paulo é uma opção futura): Auth com e-mail e senha (confirmação de e-mail desligada no painel; o app já trata o cadastro sem sessão, com o aviso do link) e PostgreSQL com **RLS** em todas as tabelas (cada usuário só lê e grava as próprias linhas). A chave `anon` fica em `js/config.js`; a `service_role` nunca entra no repositório.
- **Offline**: tudo é gravado primeiro num cache local por usuário (`localStorage`, chave `caderno-resina-v2:<user_id>`) e entra numa fila. `js/nuvem.js` envia a fila e busca o que mudou quando há conexão. O `sw.js` guarda a casca do app e, na instalação, os 8 módulos da biblioteca do Supabase (se falhar, a instalação falha e é refeita na próxima visita). Se o import da biblioteca falhar, `conectar()` tenta de novo com `?r=<hora>`. O primeiro login precisa de internet.
- Exclusão é **lógica** (`deleted_at`); `updated_at` é gravado pelo servidor (`clock_timestamp()`). A busca pagina por chave na ordem `(updated_at, id)`: o cursor por tabela em `local.js` é `{t, id}` (cache antigo com o cursor em texto ainda é aceito). Conflito: vale a gravação mais recente, mas alteração local ainda na fila nunca é sobrescrita pela busca.
- A emissão de NF-e é **simulada**: gera número e chave fictícios. A busca de CNPJ usa BrasilAPI, com Minha Receita como alternativa (precisa de internet).
- As cotações de dólar, euro e goma resina são **fixas** (constante `MERCADO`). No futuro virão de API (Banco Central / CEPEA).
- Conta de exemplo no Supabase: `produtor@exemplo.com` / `resina123`. No primeiro login o app cria as duas fazendas (SC e PR) com `exemplo()`; fazendas `demo` dessa conta com dados de mais de 7 dias são regeradas ao entrar (as datas são relativas a hoje).

## Módulos (`js/`)

| Arquivo | Papel |
|---|---|
| `util.js` | Formatação, `plural()`, datas, `uid()` (UUID), `definirHoje()` para testes |
| `ie.js` | Dígito verificador da Inscrição Estadual das 27 UFs (`ieValida`) |
| `regras.js` | Constantes do negócio e cálculos sobre o `S` da fazenda aberta (`usarDados`) |
| `exemplo.js` | Gera dados de exemplo relativos a hoje |
| `local.js` | Cache por usuário, fila, `gravar`/`excluir`/`mesclar` |
| `mapa.js` | Linhas do banco ⇄ formato `S` das telas (`montarDados`, `linha.*`) |
| `nuvem.js` | Cliente Supabase, login, `enviar`/`buscar`/`sincronizar` |
| `estado.js` | Sessão, estado da tela (`E`), `salvar`/`salvarLote`/`apagar`, agenda da sincronização, conta de exemplo |
| `telas.js`, `nfe.js`, `graficos.js`, `app.js` | Telas, NF-e simulada, gráficos SVG, render e eventos |

As telas leem `S` (formato em memória); **toda gravação passa por `salvar(tabela, linha)`** com os conversores de `mapa.js`. Nunca altere `S` diretamente: ele é remontado do cache a cada mudança.

## Banco e testes

- Esquema em `supabase/migrations/`: `0001_inicial.sql` e `0002_sincronizacao_e_seguranca.sql` (`clock_timestamp()`, índices `(user_id, updated_at, id)`, `search_path` e `revoke` de `criar_perfil`). Mudança de esquema = nova migração numerada.
- `npm test` roda os testes com `node --test` (sem instalar nada). `supabase/teste-rls.mjs` verifica o isolamento entre contas.
- Para rodar localmente: `python3 -m http.server` na raiz e abrir `http://localhost:8000`.

## Próximos passos

1. Aplicar a migração 0002 no Supabase (o app novo funciona antes e depois dela) e ligar no painel a confirmação de e-mail e a proteção contra senha vazada.
2. Cotações reais e NF-e real (certificado digital do produtor e SEFAZ), depois da validação com produtores.
3. Avaliar mover o projeto Supabase para `sa-east-1`.

## Glossário do negócio (fonte: o próprio produtor)

| Termo | Significado |
|---|---|
| **Floresta / fazenda** | Propriedade do produtor. **Uma fazenda = uma Inscrição Estadual (ICMS).** |
| **Talhão** | Divisão da floresta. Uma fazenda tem N talhões. |
| **Ramal** | Conjunto de linhas de plantio com número de árvores **pré-contado**. Um talhão tem N ramais. É a unidade em que o produtor anota estria e coleta. |
| **Painel** | Área ferida na árvore que produz a resina. Na prática, 1 árvore = 1 painel. É a unidade operacional da resinagem. |
| **Estria** | Operação em que o produtor fere a árvore e aplica a **pasta estimulante** para aumentar a produção. Cada árvore estriada conta como 1 estria. |
| **Intervalo de estria** | Dias entre estrias do mesmo ramal. Ideal configurável; o padrão é **14 dias**. |
| **Safra** | De **setembro a agosto** (ex.: safra 26/27 = set/2026 a ago/2027). Produz mais no calor. |
| **Resineiro** | Trabalhador que faz as estrias. |

## Regras e fórmulas

- **Contagem de árvores do ramal** muda com o tempo (mortalidade, árvore quebrada, recontagem). Guardar **histórico** (data, quantidade, motivo); o valor vigente é a contagem mais recente. Contagem com mais de 180 dias gera alerta.
- **Coleta** é anotada para um conjunto de ramais. O kg é **rateado entre os ramais pelo nº de árvores**. (A validar com produtores: alguns podem pesar por ramal.)
- **Indicadores de produtividade:**
  - kg/painel (kg/árvore) = kg produzidos ÷ árvores
  - kg/estria (mostrado em g/estria) = kg ÷ nº de estrias
  - estrias por dia trabalhado (por resineiro) = árvores estriadas ÷ dias trabalhados
- **Preço livre** (o que interessa ao produtor, é o que cai na conta):
  - Contribui com **Funrural** (sobre a comercialização): `PLivre = PV × 0,9837`
  - Contribui pela **folha de pagamento**: `PLivre = PV × 0,998`
  - O regime é definido **por fazenda**. Recebimentos, "a receber", fluxo de caixa, receita, margem e lucro usam o **valor líquido**. A NF-e usa o valor bruto.
- **Fluxo de caixa previsto** = saldo atual + compromissos futuros (entradas e saídas agendadas) + saldo a receber das vendas na data prevista.
- **Margem por kg** = preço livre médio − custo por kg (despesas da safra ÷ kg produzidos).
- **Inscrição Estadual** é única: não pode repetir na mesma conta nem em outra. O dígito verificador é conferido por UF (`ie.js`) só quando o usuário cadastra ou altera a IE; as IEs fictícias da conta de exemplo não passam por ele.
- **Atraso de estria crítico**: acima de `ATRASO_CRITICO` (4 dias, em `regras.js`) alertas, cartões e gráfico ficam vermelhos.
- **Venda editada** não pode ter líquido menor que o já recebido (`abaixoDoRecebido`).

## Funcionalidades (cada usuário liga e desliga em Conta)

| Função | Depende de |
|---|---|
| Caixa e fluxo previsto | — |
| Floresta e operações (talhões, ramais, contagens, apontamento de estria/coleta) | — |
| Produção e produtividade | Floresta |
| Vendas e recebimentos (preço livre, recebimentos parciais) | — |
| Emissão de NF-e | Vendas |
| Custo e margem | — |

Funções desligadas só escondem as telas; nenhum registro é apagado. A Início (mercado, alertas, calendário da safra, dicas) está sempre ligada.

## Contas e fazendas

- O usuário se cadastra sozinho e escolhe as funções.
- Ao entrar, **escolhe a fazenda**. Com mais de uma fazenda, existe a **Visão geral**, que consolida todas: só leitura, com comparativo e saldo projetado.
- Cada usuário vê **somente os próprios registros**.

## Modelo de dados em memória (formato `S` das telas; as tabelas estão na migração)

```
usuario { id, nome, email, modulos{caixa,floresta,producao,vendas,nfe,resultado}, fazendas[] }
fazenda { id, nome, ie, doc, municipio, uf, dados }
dados   { regime: 'funrural'|'folha', saldoInicial, ideal (dias), demo,
          talhoes[ { id, nome, ramais[ { id, cod, hist[ {data, arv, motivo} ] } ] } ],
          estrias[ { id, data, talhao(id), ramais[ids], qtd, resineiro, dias } ],
          producao[ { id, data, talhao(id), ramais[ids], kg } ],
          vendas[ { id, data, comprador, kg, preco, fator, comNota, nf{...}|null, recs[ {id,data,valor,forma} ], venc } ],
          caixa[ { id, data, tipo:'d'|'r', cat, desc, valor } ],   // realizado
          comp[ { id, data, tipo, cat, desc, valor } ],            // compromissos futuros
          compradores{ nome: {doc, dest} } }
```

Cada venda guarda o `fator` do regime da época (Funrural 0,9837 / folha 0,998): trocar o regime da fazenda só vale para vendas novas.

## Interface

- **Mobile first**: o produtor usa no celular, muitas vezes no campo. Barra de abas fixa no rodapé; nada pode rolar para o lado.
- Tema claro e escuro por tokens CSS em `:root` (`--pine` verde-pinho, `--amber` cor de resina, `--good`/`--bad` para estados).
- Fontes: Bricolage Grotesque (títulos) e Atkinson Hyperlegible (texto), pela legibilidade.
- Linguagem simples, do produtor: "árvores", "ramais", "preço livre", "a receber". Nada de jargão de sistema.
- Gráficos em SVG próprio (função `chart`), sem biblioteca.

## Cuidados

- Não quebrar a conta de exemplo nem os dados gerados por `exemplo()`; eles são usados nas demonstrações.
- Mudanças de modelo de dados precisam de migração no Supabase e, se mudar o formato do cache, de nova chave de armazenamento local.
- Ao adicionar um arquivo em `js/` ou mudar o `sw.js`, inclua o arquivo na lista `CASCA` e troque a versão do cache (hoje `caderno-v2` → `v3`).
- Valores em R$ com `toLocaleString('pt-BR')`; datas internas em `AAAA-MM-DD`.

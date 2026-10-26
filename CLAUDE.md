# Caderno da Resina

App de gestão financeira e de produção para **pequenos produtores de pinus e resina** (goma resina). Hoje é um protótipo para validar a ideia com produtores reais. Responda e escreva a interface sempre em **português do Brasil**.

## Estado atual

- Tudo em um único arquivo: `index.html` (HTML + CSS + JS puro, sem build e sem dependências).
- Publicado no **GitHub Pages** (branch `main`, raiz).
- Dados salvos no **localStorage** (`caderno-resina-contas-v1`). Login, senhas e separação entre usuários são **simulados** e só valem no mesmo navegador.
- A emissão de NF-e é **simulada**: gera número e chave fictícios. A busca de CNPJ usa BrasilAPI, com Minha Receita como alternativa.
- As cotações de dólar, euro e goma resina são **fixas** (constante `MERCADO`). No futuro virão de API (Banco Central / CEPEA).
- Usuário de exemplo, criado na primeira abertura: `produtor@exemplo.com` / `resina123`, com duas fazendas (SC e PR).

## Próximo passo planejado

1. Separar o `index.html` em módulos (telas, cálculos, armazenamento, gráficos) sem mudar o comportamento.
2. Integrar com o **Supabase** (projeto na região São Paulo):
   - Supabase Auth para o login (e-mail e senha).
   - PostgreSQL com **RLS**: cada usuário só lê e grava os próprios registros.
   - O app continua estático no GitHub Pages; ele fala direto com o Supabase.
   - A chave `anon` pode ficar no código; quem protege os dados é a RLS.
3. **Modo offline:** o produtor aponta estria e coleta na floresta, muitas vezes sem sinal. Guardar localmente e sincronizar quando a internet voltar.
4. Cotações reais e NF-e real (certificado digital do produtor e SEFAZ) ficam para depois da validação.

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
- **Inscrição Estadual** é única: não pode repetir na mesma conta nem em outra.

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

## Modelo de dados (atual, em JSON; base para as tabelas do Supabase)

```
usuario { id, nome, email, senha(hash fictício), modulos{caixa,floresta,producao,vendas,nfe,resultado}, fazendas[] }
fazenda { id, nome, ie, doc, municipio, uf, dados }
dados   { regime: 'funrural'|'folha', saldoInicial, ideal (dias), demo,
          talhoes[ { id, nome, ramais[ { id, cod, hist[ {data, arv, motivo} ] } ] } ],
          estrias[ { id, data, talhao, ramais[ids], qtd, resineiro, dias } ],
          producao[ { id, data, talhao, ramais[ids], kg } ],
          vendas[ { id, data, comprador, kg, preco, comNota, nf{...}|null, recs[ {id,data,valor,forma} ], venc } ],
          caixa[ { id, data, tipo:'d'|'r', cat, desc, valor } ],   // realizado
          comp[ { id, data, tipo, cat, desc, valor } ],            // compromissos futuros
          compradores{ nome: {doc, dest} } }
```

Ao migrar: `talhao` deve virar chave estrangeira (hoje é o nome), as datas ficam como `date` e os valores como `numeric`.

## Interface

- **Mobile first**: o produtor usa no celular, muitas vezes no campo. Barra de abas fixa no rodapé; nada pode rolar para o lado.
- Tema claro e escuro por tokens CSS em `:root` (`--pine` verde-pinho, `--amber` cor de resina, `--good`/`--bad` para estados).
- Fontes: Bricolage Grotesque (títulos) e Atkinson Hyperlegible (texto), pela legibilidade.
- Linguagem simples, do produtor: "árvores", "ramais", "preço livre", "a receber". Nada de jargão de sistema.
- Gráficos em SVG próprio (função `chart`), sem biblioteca.

## Cuidados

- Não quebrar a conta de exemplo nem os dados gerados por `exemplo()`; eles são usados nas demonstrações.
- Mudanças de modelo de dados precisam de migração ou de nova chave de armazenamento.
- Valores em R$ com `toLocaleString('pt-BR')`; datas internas em `AAAA-MM-DD`.

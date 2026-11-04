# Caderno da Resina

App de gestão financeira e de produção para **pequenos produtores de pinus e resina** (goma resina). Hoje é um protótipo para validar a ideia com produtores reais. Responda e escreva a interface sempre em **português do Brasil**.

## Estado atual

- App estático, sem build e sem dependências: `index.html` (casca) + `css/app.css` + módulos ES em `js/`. Publicado no **GitHub Pages** (branch `main`, raiz); todos os caminhos são relativos.
- **Supabase** (projeto `xqvybotystsygeorbspd`, região `us-east-1`; migrar para São Paulo é uma opção futura): Auth com e-mail e senha (confirmação de e-mail desligada no painel; o app já trata o cadastro sem sessão, com o aviso do link) e PostgreSQL com **RLS** em todas as tabelas (cada usuário só lê e grava as próprias linhas). A chave `anon` fica em `js/config.js`; a `service_role` nunca entra no repositório.
- **Offline**: tudo é gravado primeiro num cache local por usuário (`localStorage`, chave `caderno-resina-v2:<user_id>`) e entra numa fila. `js/nuvem.js` envia a fila e busca o que mudou quando há conexão. O `sw.js` guarda a casca do app e, na instalação, os 8 módulos da biblioteca do Supabase (se falhar, a instalação falha e é refeita na próxima visita). Se o import da biblioteca falhar, `conectar()` tenta de novo com `?r=<hora>`. O primeiro login precisa de internet.
- Exclusão é **lógica** (`deleted_at`); `updated_at` é gravado pelo servidor (`clock_timestamp()`). A busca pagina por chave na ordem `(updated_at, id)`: o cursor por tabela em `local.js` é `{t, id}` (cache antigo com o cursor em texto ainda é aceito). Conflito: vale a gravação mais recente, mas alteração local ainda na fila nunca é sobrescrita pela busca.
- A emissão de NF-e é **simulada**: gera número e chave fictícios. A busca de CNPJ usa BrasilAPI, com Minha Receita como alternativa (precisa de internet).
- As cotações de dólar, euro e goma resina são **fixas** (constante `MERCADO`). No futuro virão de API (Banco Central / CEPEA).
- Conta de exemplo no Supabase: `produtor@exemplo.com` / `resina123`. Depois da primeira sincronização o app monta (`montarExemplo`) **2 fazendas** (Capão Alto/SC e Boa Esperança/PR, com área, NIRF/CIB e CAR), **1 CPF** (João da Silva, 529.982.247-25, IE de SC, conta Sicredi com R$ 14.000) e **1 CNPJ** (Resinas Silva Ltda, 11.222.333/0001-81, IEs de PR e SC, conta Banco do Brasil com R$ 4.000), fictícios com dígito válido. Capão Alto vende pelo CPF e, 1 em cada 3 vendas, pelo CNPJ (1 em cada 4 despesas também); Boa Esperança vende só pelo CNPJ; o contador (R$ 350/mês) é despesa geral do CNPJ, sem fazenda. Fazendas `demo` com dados de mais de 7 dias são regeradas ao entrar, mantendo essa divisão (as datas são relativas a hoje). Se o CPF, o CNPJ ou uma das fazendas de exemplo sumirem, o app monta tudo de novo.

## Módulos (`js/`)

| Arquivo | Papel |
|---|---|
| `util.js` | Formatação, `plural()`, datas, `uid()` (UUID), `definirHoje()` para testes |
| `doc.js` | CPF e CNPJ: `soDig`, `mascaraDoc`, `cpfValido`, `cnpjValido`, `docValido(doc, 'PF'|'PJ')` |
| `ie.js` | Dígito verificador da Inscrição Estadual das 27 UFs (`ieValida`) |
| `regras.js` | Constantes do negócio e cálculos sobre o `S` da fazenda aberta (`usarDados`) |
| `exemplo.js` | Gera dados de exemplo relativos a hoje |
| `relatorios.js` | Relatórios (funções puras): `movimentos` por período e base (competência ou caixa, já com o rateio), `porEntidade`, `porFazenda`, `producaoMensal`, `matrizVendas`, `resina`, `periodo` |
| `local.js` | Cache por usuário, fila, `gravar`/`excluir`/`mesclar` |
| `metricas.js` | Telemetria: `track(evento, props)`, sessões e tempo de uso, fila própria e envio em lote (catálogo em `docs/metricas.md`) |
| `mapa.js` | Linhas do banco ⇄ formato `S` das telas (`montarDados(L, {fazenda, entidade})`, `entidadesDe` com inscrições, contas e saldos, `fazendasDe`, `linha.*`) |
| `nuvem.js` | Cliente Supabase, login, `enviar`/`buscar`/`sincronizar` |
| `estado.js` | Sessão, estado da tela (`E`, com `E.fazSel` = fazenda aberta na aba Fazendas), filtros do topo (`definirFiltro`), sugestões de emitente, inscrição e conta, `salvar`/`salvarLote`/`apagar`, `completarCadastro`, agenda da sincronização, conta de exemplo |
| `telas.js`, `nfe.js`, `graficos.js`, `app.js` | Telas, NF-e simulada, gráficos SVG, render e eventos |
| `admin.js`, `admin-lista.js` | Área administrativa (`admin.html`, página separada): lista, filtros, detalhe e ações. Fora da `CASCA` do `sw.js` de propósito (precisa de internet e não é carregada pelos produtores) |

As telas leem `S` (formato em memória); **toda gravação passa por `salvar(tabela, linha)`** com os conversores de `mapa.js`. Nunca altere `S` diretamente: ele é remontado do cache a cada mudança.

## Banco e testes

- Esquema em `supabase/migrations/`: `0001_inicial.sql` e `0002_sincronizacao_e_seguranca.sql` (`clock_timestamp()`, índices `(user_id, updated_at, id)`, `search_path` e `revoke` de `criar_perfil`). Mudança de esquema = nova migração numerada.
- `0003_admin.sql`: tabela `admins` (papel de admin, só no servidor), `eh_admin()`, `auditoria`, colunas `is_demo`/`bloqueado`/`motivo_bloqueio`/`trocar_senha` em `perfis` (o gatilho `proteger_perfil` impede o usuário de mudá-las) e `encerrar_sessoes()` (só `service_role`).
- Edge Function `supabase/functions/admin-acoes` (bloquear/desbloquear): confere que quem chama está em `admins`, usa a chave de serviço (só no servidor) e grava a `auditoria`. Primeiro admin: `supabase/admin-inicial.sql`. Teste: `supabase/teste-admin.mjs`.
- `0004_metricas.sql`: tabelas `eventos` e `sessoes` (ninguém lê ou grava pela API) e `registrar_uso()`, que grava o lote em nome de quem está logado, marca `is_demo` e valida o formato. Teste: `supabase/teste-metricas.mjs`.
- `0005_admin_usuarios.sql`: `admin_usuarios()` e `admin_usuario()` (só para admins; abrir o detalhe fica na auditoria como `ver_detalhe`), `senha_trocada()`. O gatilho `proteger_perfil` decide pelo papel que executa (`current_user`), então funções do servidor e a chave de serviço mudam as colunas protegidas. A Edge Function também gera senha temporária (devolvida uma vez, nunca gravada); o app obriga a trocar no próximo acesso (tela `senha`).
- `0006_entidades_fiscais.sql`: cadastro **financeiro global**, separado das fazendas. Tabelas `entidades_fiscais` (CPF/CNPJ, com regime tributário e `previdencia` Funrural/folha), `inscricoes_estaduais` (de cada CPF/CNPJ; IE única entre todas as contas), `contas_bancarias` (de cada CPF/CNPJ, com `saldo_inicial`), `perdas` (resina perdida, por fazenda) e `rateios` (modelo pronto). `fazendas` ganha `area_ha`, `nirf_cib`, `car` e a `ie` fica opcional (só fazendas antigas). `lancamentos`/`compromissos`: `fazenda_id` **opcional**, `entidade_id`, `data_competencia`, `tipo_documento`, `numero_documento`, `contraparte_*`, `categoria_irpf`, `conta_bancaria_id`, `anexo_url`. `vendas`: `entidade_id`, `inscricao_id`, `tipo_documento`, `numero_documento`. `recebimentos`: `conta_bancaria_id`. `compradores` globais (`fazenda_id` opcional). Gatilhos: `padrao_unico` (um CPF/CNPJ padrão), `preencher_lancamento` (CPF/CNPJ padrão, competência e categoria do IR para o app antigo), `criar_perfil` (cria também o CPF padrão); `ie_disponivel` passa a olhar as inscrições e só responde sobre outras contas. Dados antigos: CPF padrão por usuário, a IE de cada fazenda vira inscrição dele, uma "Conta principal" com a soma dos saldos iniciais das fazendas, e lançamentos, vendas e recebimentos preenchidos. Idempotente. Teste no banco real, desfeito no fim: `supabase/teste-migracao-0006.sh`. **Aplicar antes de publicar o app novo.**
- `supabase/gerenciar.sh sql <arquivo>` aplica SQL no projeto pela API de gerenciamento.
- Conta suspensa: o bloqueio encerra as sessões, então a renovação volta "sessão não encontrada" e o app pede para entrar de novo (o token já emitido vale até 15 min). O login volta `user_banned`: o app mostra "Conta suspensa, entre em contato." e apaga o cache daquela conta no aparelho (pelo e-mail).
- `npm test` roda os testes com `node --test` (sem instalar nada). `supabase/teste-rls.mjs` verifica o isolamento entre contas.
- Para rodar localmente: `python3 -m http.server` na raiz e abrir `http://localhost:8000`.

## Próximos passos

1. Aplicar a migração 0002 no Supabase (o app novo funciona antes e depois dela) e ligar no painel a confirmação de e-mail e a proteção contra senha vazada.
2. Cotações reais e NF-e real (certificado digital do produtor e SEFAZ), depois da validação com produtores.
3. Avaliar mover o projeto Supabase para `sa-east-1`.

## Glossário do negócio (fonte: o próprio produtor)

| Termo | Significado |
|---|---|
| **Floresta / fazenda** | O imóvel do produtor (área, NIRF/CIB, CAR), com talhões, ramais, produção e perdas. **Cadastro operacional**, separado do financeiro. |
| **CPF/CNPJ (entidade fiscal)** | Quem emite as notas e em nome de quem ficam as contas: produtor rural PF ou empresa PJ (muitas vezes da família). Tem regime tributário, regime previdenciário (Funrural/folha), inscrições estaduais e contas bancárias. Um é o padrão. |
| **Inscrição Estadual** | **É do CPF/CNPJ**, não da fazenda. Um CPF/CNPJ pode ter várias (uma por UF ou estabelecimento). A venda escolhe qual usar. |
| **Perda** | Resina perdida em kg (chuva, saco rasgado, roubo, sujeira, fogo) ou árvore perdida (mortalidade, quebra: vem da recontagem do ramal). |
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
  - O regime é do **CPF/CNPJ que emite a nota** (`previdencia`). Recebimentos, "a receber", fluxo de caixa, receita, margem e lucro usam o **valor líquido**. A NF-e usa o valor bruto.
- **Fluxo de caixa previsto** = saldo atual + compromissos futuros (entradas e saídas agendadas) + saldo a receber das vendas na data prevista.
- **Margem por kg** = preço livre médio − custo por kg (despesas da safra ÷ kg produzidos).
- **Dois cadastros**: o operacional (fazendas: floresta, produção, perdas) e o financeiro (global: CPFs/CNPJs, inscrições, contas, contas a pagar e a receber). Lançamentos e compromissos têm o CPF/CNPJ e a **fazenda opcional** (vazia = despesa ou receita geral, como contador e impostos). A **venda sai de uma fazenda** (obrigatória) e é emitida por um CPF/CNPJ e uma das inscrições dele (sugerida: a da UF da fazenda). Sem CPF/CNPJ gravado, vale o padrão do produtor (`resolverEntidade` no app, `entidade_padrao` no banco).
- **Filtros do topo** nas telas financeiras (Início, Vendas, Financeiro, Resultado): CPF/CNPJ (chips com a cor) e fazenda, guardados em `meta.entidade` e `meta.fazenda` do cache do usuário. Produção, floresta, perdas e estoque não mudam com o filtro de CPF/CNPJ. A soma por CPF/CNPJ fecha com o total; a soma por fazenda mais o "Geral" também.
- **Saldo por conta bancária**: saldo inicial da conta + pagamentos e recebimentos lançados nela. O que entrou ou saiu sem conta aparece como "sem conta informada" do CPF/CNPJ. O saldo global é a soma das contas. Com filtro de fazenda não há saldo de partida: o app mostra só as entradas e saídas dela.
- **Estoque** = coletado − vendido − resina perdida.
- Em `lancamentos`, `data` é a **data do pagamento** (regime de caixa); `data_competencia` é opcional (vazia = a mesma). Ao marcar um compromisso como pago, a competência é a data do compromisso e a conta é a do CPF/CNPJ.
- **Inscrição Estadual** é única: não pode repetir na mesma conta nem em outra. O dígito verificador é conferido por UF (`ie.js`) quando o usuário cadastra a inscrição; as IEs fictícias da conta de exemplo não passam por ele.
- **Atraso de estria crítico**: acima de `ATRASO_CRITICO` (4 dias, em `regras.js`) alertas, cartões e gráfico ficam vermelhos.
- **Venda editada** não pode ter líquido menor que o já recebido (`abaixoDoRecebido`).

## Funcionalidades (cada usuário liga e desliga em Conta)

| Função | Depende de |
|---|---|
| Financeiro e fluxo previsto (contas a pagar e a receber, saldos das contas) | — |
| Floresta e operações (talhões, ramais, contagens, apontamento de estria/coleta, perdas) | — |
| Produção e produtividade | Floresta |
| Vendas e recebimentos (preço livre, recebimentos parciais) | — |
| Emissão de NF-e | Vendas |
| Custo e margem | — |

Funções desligadas só escondem as telas; nenhum registro é apagado. A Início (mercado, alertas, calendário da safra, dicas) está sempre ligada.

## Contas, fazendas e CPFs/CNPJs

- O usuário se cadastra sozinho e escolhe as funções. O servidor cria o CPF padrão dele (nome do cadastro, documento a preencher); depois da primeira sincronização o app garante uma "Conta principal".
- Abas do rodapé: **Início** (global), **Fazendas** (lista; ao abrir uma fazenda: Floresta, Produção, Perdas e Cadastro), **Vendas**, **Financeiro** (pagos e recebidos, a pagar e a receber, saldos das contas) e **Resultado**. Não se escolhe fazenda ao entrar.
- **CPFs, CNPJs e contas** (tela `cadastros`, pela Conta): CPFs/CNPJs com máscara e dígito verificador, regime tributário e previdenciário, inscrições estaduais e contas bancárias com saldo inicial. **Declarações de IR**: só o aviso "em desenvolvimento, será disponibilizado em futuras versões".
- Financeiro e Vendas têm **Selecionar para mover**: move vários registros de uma vez para outro CPF/CNPJ e/ou outra fazenda (a venda que muda de CPF/CNPJ troca também a inscrição).
- **Resultado → Relatórios**: período (as duas últimas safras, os dois últimos anos ou de/até) e base (**competência**: venda pela data da venda, lançamento pela competência; **caixa**: venda pelo recebimento, lançamento pelo pagamento). Mostra o consolidado, **por CPF/CNPJ** (com o total vendido de cada um, para o teto de faturamento), **por fazenda** (com a linha Geral), **produção por mês** por fazenda e a **venda cruzada** fazenda × quem emitiu. Respeita os filtros do topo. As somas por CPF/CNPJ e por fazenda fecham com o consolidado.
- **Rateio**: na edição de um lançamento, "Dividir entre fazendas" (% por fazenda, até 100%; o resto fica na fazenda do lançamento ou em Geral). Os relatórios por fazenda usam a divisão; ao marcar um compromisso como pago, a divisão vai junto.
- **Tela e uso no campo** (Conta; guardado em `meta.letra` e `meta.campo` do cache, por aparelho): tamanho da letra Normal, Grande ou Muito grande (`:root[data-letra]`, tudo em rem acompanha) e **modo campo** (`:root[data-campo]`): botões e campos de no mínimo 48 px e um Início só com atalhos grandes (apontar estria ou coleta, anotar perda, lançar despesa, registrar venda) e os alertas. Os atalhos de estria, coleta e perda pedem a fazenda (`E.intencao`) e abrem direto no formulário. Fora do modo campo, links de texto têm área de toque de 24 px (WCAG 2.5.8). Nada pode rolar para o lado em nenhum dos três tamanhos.
- Cada usuário vê **somente os próprios registros**.

## Modelo de dados em memória (formato `S` das telas; as tabelas estão na migração)

```
usuario { id, nome, email, modulos{caixa,floresta,producao,vendas,nfe,resultado}, entidadeSel, fazendaSel,
          entidades[ {id, tipo:'PF'|'PJ', nome, apelido, cor, documento, regime, previdencia, padrao, ativo,
                      inscricoes[ {id, ie, uf, municipio, descricao, ativo} ],
                      contas[ {id, banco, agencia, conta, apelido, saldoInicial, saldo, ativo} ], semConta} ],
          fazendas[ {id, nome, municipio, uf, area_ha, nirf_cib, car, ideal, demo, demo_gerado_em} ],
          global }                                   // S das telas financeiras, com os filtros do topo
dados   { (S: montarDados(L, {fazenda, entidade}); a aba Fazendas usa dadosFazenda(E.fazSel))
          fazenda, entidade, regime (previdência do CPF/CNPJ filtrado ou do padrão), saldoInicial (das contas), ideal (dias), demo,
          fazendas[ {id, nome, uf, municipio} ],
          talhoes[ { id, nome, fazenda, ramais[ { id, cod, hist[ {data, arv, motivo} ] } ] } ],
          estrias[ { id, data, talhao(id), ramais[ids], qtd, resineiro, dias } ],
          producao[ { id, data, talhao(id), ramais[ids], kg } ],
          perdas[ { id, data, fazenda, talhao|null, kg, motivo, obs } ],
          vendas[ { id, data, comprador, kg, preco, fator, comNota, nf{...}|null, recs[ {id,data,valor,forma,conta} ], venc,
                    fazenda, entidade, inscricao } ],
          caixa[ { id, data (pagamento), tipo:'d'|'r', cat, desc, valor, fazenda|null, entidade, conta, competencia, tipoDoc, numDoc,
                   contraparteNome, contraparteDoc, catIr, anexo } ],   // pagos e recebidos
          comp[ { ...mesmos campos do caixa } ],                        // a pagar e a receber
          todas{ vendas, caixa, comp },                                 // só com o filtro de fazenda (estoque, comparativos)
          compradores{ nome: {doc, dest} },                             // globais
          rateios{ idLançamento: [ {id, fazenda, percentual} ] } }
```

Cada venda guarda o `fator` do regime da época (Funrural 0,9837 / folha 0,998): trocar o regime da fazenda só vale para vendas novas.

## Interface

- **Mobile first**: o produtor usa no celular, muitas vezes no campo. Barra de abas fixa no rodapé; nada pode rolar para o lado.
- Tema claro e escuro por tokens CSS em `:root` (`--pine` verde-pinho, `--amber` cor de resina, `--good`/`--bad` para estados).
- Fontes: Bricolage Grotesque (títulos) e Atkinson Hyperlegible (texto), pela legibilidade.
- Linguagem simples, do produtor: "árvores", "ramais", "preço livre", "a receber". Nada de jargão de sistema.
- Gráficos em SVG próprio (função `chart`), sem biblioteca.

## Cuidados

- **Métricas**: nunca registrar conteúdo (valores, descrições, nomes); só o fato. Evento ou função nova entra no `CATALOGO` de `metricas.js` e em `docs/metricas.md`. Lotes que o produtor não digitou usam `salvarLote(itens, {metrica:false})`.
- Não quebrar a conta de exemplo nem os dados gerados por `exemplo()`; eles são usados nas demonstrações.
- Mudanças de modelo de dados precisam de migração no Supabase e, se mudar o formato do cache, de nova chave de armazenamento local.
- Ao adicionar um arquivo em `js/` ou mudar o `sw.js`, inclua o arquivo na lista `CASCA` e troque a versão do cache (hoje `caderno-v5` → `v6`).
- Valores em R$ com `toLocaleString('pt-BR')`; datas internas em `AAAA-MM-DD`.

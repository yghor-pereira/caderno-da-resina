# Caderno da Resina

App de gestão financeira e de produção para **pequenos produtores de pinus e resina** (goma resina). Hoje é um protótipo para validar a ideia com produtores reais. Responda e escreva a interface sempre em **português do Brasil**.

## Estado atual

- App estático, sem build e sem dependências: `index.html` (casca) + `css/app.css` + módulos ES em `js/`. Publicado no **GitHub Pages** (branch `main`, raiz); todos os caminhos são relativos.
- **Supabase** (projeto `xqvybotystsygeorbspd`, região `us-east-1`; migrar para São Paulo é uma opção futura): Auth com e-mail e senha (confirmação de e-mail desligada no painel; o app já trata o cadastro sem sessão, com o aviso do link) e PostgreSQL com **RLS** em todas as tabelas (cada usuário só lê e grava as próprias linhas). A chave `anon` fica em `js/config.js`; a `service_role` nunca entra no repositório.
- **Offline**: tudo é gravado primeiro num cache local por usuário (`localStorage`, chave `caderno-resina-v2:<user_id>`) e entra numa fila. `js/nuvem.js` envia a fila e busca o que mudou quando há conexão. O `sw.js` guarda a casca do app e, na instalação, os 8 módulos da biblioteca do Supabase (se falhar, a instalação falha e é refeita na próxima visita). Se o import da biblioteca falhar, `conectar()` tenta de novo com `?r=<hora>`. O primeiro login precisa de internet.
- Exclusão é **lógica** (`deleted_at`); `updated_at` é gravado pelo servidor (`clock_timestamp()`). A busca pagina por chave na ordem `(updated_at, id)`: o cursor por tabela em `local.js` é `{t, id}` (cache antigo com o cursor em texto ainda é aceito). Conflito: vale a gravação mais recente, mas alteração local ainda na fila nunca é sobrescrita pela busca.
- A emissão de NF-e é **simulada**: gera número e chave fictícios. A busca de CNPJ usa BrasilAPI, com Minha Receita como alternativa (precisa de internet).
- As cotações de dólar, euro e goma resina são **fixas** (constante `MERCADO`). No futuro virão de API (Banco Central / CEPEA).
- Conta de exemplo no Supabase: `produtor@exemplo.com` / `resina123`. Depois da primeira sincronização o app monta (`montarExemplo`) **2 propriedades** (SC e PR), **1 CPF** (João da Silva, 529.982.247-25) e **1 CNPJ** (Resinas Silva Ltda, 11.222.333/0001-81), ambos fictícios com dígito válido: Capão Alto (SC) fatura pelo CPF (70%, padrão) e pelo CNPJ (30%, parceiro; 1 em cada 3 vendas e 1 em cada 4 despesas); Boa Esperança (PR) é arrendada pelo CNPJ. Inscrições `demo` com dados de mais de 7 dias são regeradas ao entrar, mantendo essa divisão (as datas são relativas a hoje). Se o CPF ou o CNPJ de exemplo sumirem, o app monta tudo de novo.

## Módulos (`js/`)

| Arquivo | Papel |
|---|---|
| `util.js` | Formatação, `plural()`, datas, `uid()` (UUID), `definirHoje()` para testes |
| `doc.js` | CPF e CNPJ: `soDig`, `mascaraDoc`, `cpfValido`, `cnpjValido`, `docValido(doc, 'PF'|'PJ')` |
| `ie.js` | Dígito verificador da Inscrição Estadual das 27 UFs (`ieValida`) |
| `regras.js` | Constantes do negócio e cálculos sobre o `S` da fazenda aberta (`usarDados`) |
| `exemplo.js` | Gera dados de exemplo relativos a hoje |
| `local.js` | Cache por usuário, fila, `gravar`/`excluir`/`mesclar` |
| `metricas.js` | Telemetria: `track(evento, props)`, sessões e tempo de uso, fila própria e envio em lote (catálogo em `docs/metricas.md`) |
| `mapa.js` | Linhas do banco ⇄ formato `S` das telas (`montarDados(L, fids, {entidade})`, `propriedadesDe`, `entidadesDe`, `linha.*`) |
| `nuvem.js` | Cliente Supabase, login, `enviar`/`buscar`/`sincronizar` |
| `estado.js` | Sessão (`SES.pid` = propriedade aberta), estado da tela (`E`), filtro de CPF/CNPJ (`definirEntidade`), "Faturado por" (`opcoesFat`/`fatPadrao`), `salvar`/`salvarLote`/`apagar`, `completarCadastro`, agenda da sincronização, conta de exemplo |
| `telas.js`, `nfe.js`, `graficos.js`, `app.js` | Telas, NF-e simulada, gráficos SVG, render e eventos |
| `admin.js`, `admin-lista.js` | Área administrativa (`admin.html`, página separada): lista, filtros, detalhe e ações. Fora da `CASCA` do `sw.js` de propósito (precisa de internet e não é carregada pelos produtores) |

As telas leem `S` (formato em memória); **toda gravação passa por `salvar(tabela, linha)`** com os conversores de `mapa.js`. Nunca altere `S` diretamente: ele é remontado do cache a cada mudança.

## Banco e testes

- Esquema em `supabase/migrations/`: `0001_inicial.sql` e `0002_sincronizacao_e_seguranca.sql` (`clock_timestamp()`, índices `(user_id, updated_at, id)`, `search_path` e `revoke` de `criar_perfil`). Mudança de esquema = nova migração numerada.
- `0003_admin.sql`: tabela `admins` (papel de admin, só no servidor), `eh_admin()`, `auditoria`, colunas `is_demo`/`bloqueado`/`motivo_bloqueio`/`trocar_senha` em `perfis` (o gatilho `proteger_perfil` impede o usuário de mudá-las) e `encerrar_sessoes()` (só `service_role`).
- Edge Function `supabase/functions/admin-acoes` (bloquear/desbloquear): confere que quem chama está em `admins`, usa a chave de serviço (só no servidor) e grava a `auditoria`. Primeiro admin: `supabase/admin-inicial.sql`. Teste: `supabase/teste-admin.mjs`.
- `0004_metricas.sql`: tabelas `eventos` e `sessoes` (ninguém lê ou grava pela API) e `registrar_uso()`, que grava o lote em nome de quem está logado, marca `is_demo` e valida o formato. Teste: `supabase/teste-metricas.mjs`.
- `0005_admin_usuarios.sql`: `admin_usuarios()` e `admin_usuario()` (só para admins; abrir o detalhe fica na auditoria como `ver_detalhe`), `senha_trocada()`. O gatilho `proteger_perfil` decide pelo papel que executa (`current_user`), então funções do servidor e a chave de serviço mudam as colunas protegidas. A Edge Function também gera senha temporária (devolvida uma vez, nunca gravada); o app obriga a trocar no próximo acesso (tela `senha`).
- `0006_entidades_fiscais.sql`: `propriedades`, `entidades_fiscais` (CPF/CNPJ), `vinculos` (CPF/CNPJ × inscrição), `contas_bancarias`, `rateios` (modelo pronto, uso na fase 2); `fazendas.propriedade_id`; em `lancamentos`/`compromissos`: `entidade_id`, `data_competencia`, `tipo_documento`, `numero_documento`, `contraparte_*`, `categoria_irpf`, `conta_bancaria_id`, `anexo_url`; em `vendas`: `entidade_id`, `tipo_documento`, `numero_documento`; em `recebimentos`: `conta_bancaria_id`. Gatilhos: `padrao_unico` (uma entidade padrão por usuário, um vínculo padrão por inscrição), `preencher_lancamento` (entidade, competência e categoria do IR para aparelhos antigos), `fazenda_com_propriedade` (fazenda sem propriedade ganha uma) e `criar_perfil` (cria também o CPF padrão). Idempotente; preenche os dados antigos. Teste no banco real, desfeito no fim: `supabase/teste-migracao-0006.sh`. **Aplicar antes de publicar o app novo**: sem ela, o app não grava lançamentos (colunas novas) e não monta a conta de exemplo.
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
| **Propriedade** | O imóvel rural (NIRF/CIB, CAR, área). Tem uma ou mais inscrições. É o que o produtor escolhe ao entrar. |
| **Inscrição / fazenda** | **Uma fazenda = uma Inscrição Estadual (ICMS)**, dentro de uma propriedade. Tem os talhões e o regime (Funrural/folha). No código e no banco continua `fazendas`. |
| **CPF/CNPJ (entidade fiscal)** | Quem fatura: produtor rural PF ou empresa PJ. Um é o padrão do produtor. Pode estar vinculado a várias inscrições. |
| **Vínculo** | CPF/CNPJ × inscrição: participação (%), condição (proprietário, arrendatário, parceiro, comodatário, condomínio), vigência e se é o padrão da inscrição. |
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
- **Produção é da propriedade; financeiro é de quem faturou.** Vendas, lançamentos e compromissos guardam a inscrição (`fazenda_id`) e o CPF/CNPJ (`entidade_id`). Sem CPF/CNPJ gravado, vale o vínculo padrão da inscrição; sem vínculo, o CPF/CNPJ padrão do produtor (mesma regra no app, `resolverEntidade`, e no banco, `entidade_padrao`).
- **Seletor do topo** ("Todos" ou um CPF/CNPJ, guardado em `meta.entidade` do cache do usuário): filtra só o financeiro (Início, Caixa, Vendas, Resultado, Visão geral). Produção, floresta e estoque não mudam. O saldo inicial de cada inscrição conta para o CPF/CNPJ padrão dela, então a soma por CPF/CNPJ fecha com o total.
- **Faturado por**: nos formulários de lançamento e venda, vem marcado com o CPF/CNPJ do seletor (se fatura pela propriedade) ou com o padrão da inscrição principal. A venda usa o fator do regime da inscrição escolhida.
- Em `lancamentos`, `data` é a **data do pagamento** (regime de caixa); `data_competencia` é opcional (vazia = a mesma). Ao marcar um compromisso como pago, a competência é a data do compromisso.
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

## Contas, propriedades e CPFs/CNPJs

- O usuário se cadastra sozinho e escolhe as funções. O servidor cria o CPF padrão dele (nome do cadastro, documento a preencher).
- Ao entrar, **escolhe a propriedade**. Com mais de uma, existe a **Visão geral**, que consolida todas: só leitura, com comparativo e saldo projetado.
- **Minhas propriedades e CPFs/CNPJs** (tela `cadastros`, pela Conta ou pela escolha de propriedade): CPFs/CNPJs com máscara e dígito verificador, contas bancárias, propriedades (área, NIRF/CIB, CAR), inscrições e vínculos (aviso quando a soma das participações passa de 100%).
- Caixa e Vendas têm **Selecionar para mover**: move vários registros de uma vez para outra propriedade, inscrição ou CPF/CNPJ.
- Cada usuário vê **somente os próprios registros**.

## Modelo de dados em memória (formato `S` das telas; as tabelas estão na migração)

```
usuario { id, nome, email, modulos{caixa,floresta,producao,vendas,nfe,resultado}, entidadeSel,
          entidades[ {id, tipo:'PF'|'PJ', nome, apelido, cor, documento, regime, padrao, ativo, contas[]} ],
          fazendas[ {id, nome, ie, uf, propriedade_id, regime, vinculos[ {id, entidade, percentual, condicao, padrao, inicio, fim} ]} ],
          propriedades[ {id, nome, municipio, uf, area_ha, nirf_cib, car, virtual?, fazendas[], dados} ] }
dados   { (S: uma propriedade, todas as inscrições dela; com filtro, só o financeiro do CPF/CNPJ `entidade`)
          id, entidade, regime (da inscrição principal), saldoInicial, ideal (dias), demo,
          fazendas[ {id, nome, ie, uf, regime, vinculos[]} ],
          talhoes[ { id, nome, fazenda, ramais[ { id, cod, hist[ {data, arv, motivo} ] } ] } ],
          estrias[ { id, data, talhao(id), ramais[ids], qtd, resineiro, dias } ],
          producao[ { id, data, talhao(id), ramais[ids], kg } ],
          vendas[ { id, data, comprador, kg, preco, fator, comNota, nf{...}|null, recs[ {id,data,valor,forma,conta} ], venc, fazenda, entidade } ],
          caixa[ { id, data (pagamento), tipo:'d'|'r', cat, desc, valor, fazenda, entidade, competencia, tipoDoc, numDoc,
                   contraparteNome, contraparteDoc, catIr, conta, anexo } ],   // realizado
          comp[ { ...mesmos campos do caixa } ],                   // compromissos futuros
          todas{ vendas, caixa, comp },                            // sem o filtro de CPF/CNPJ (estoque, numeração da NF-e)
          compradores{ nome: {doc, dest, fazenda} } }
```
Propriedade **virtual**: fazenda sem propriedade no cache (antes da migração chegar ao aparelho) aparece como propriedade própria, com o id da fazenda; `completarCadastro()` cria a de verdade depois de uma sincronização.

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
- Ao adicionar um arquivo em `js/` ou mudar o `sw.js`, inclua o arquivo na lista `CASCA` e troque a versão do cache (hoje `caderno-v4` → `v5`).
- Valores em R$ com `toLocaleString('pt-BR')`; datas internas em `AAAA-MM-DD`.

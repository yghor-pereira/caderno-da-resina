# Supabase, modo offline e correções · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o Caderno da Resina funcional com contas e dados reais no Supabase, funcionando sem internet, com os problemas conhecidos corrigidos.

**Architecture:** App estático em módulos ES (sem build). As telas continuam lendo o objeto `S` no formato atual, montado a partir de um cache local de linhas normalizadas (`localStorage`). Toda gravação vai para o cache e para uma fila; `nuvem.js` envia a fila e busca mudanças do Supabase quando há conexão. Um service worker guarda a casca do app.

**Tech Stack:** HTML/CSS/JS puro, `@supabase/supabase-js@2.45.4` via jsDelivr ESM, Supabase (Postgres + Auth + RLS, projeto `xqvybotystsygeorbspd`, `us-east-1`), `node --test` para testes.

**Spec:** `docs/superpowers/specs/2026-10-26-supabase-offline-design.md`

## Global Constraints

- Sem build, sem bundler, sem dependências npm. `package.json` só com `{"type":"module","scripts":{"test":"node --test tests/"}}`.
- Todos os caminhos relativos (GitHub Pages em `/caderno-da-resina/`).
- supabase-js: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm`.
- Interface em português do Brasil; aparência atual preservada; valores com `toLocaleString('pt-BR')`; datas internas `AAAA-MM-DD`.
- Chave `anon` pode ir no código; a `service_role` **nunca** entra no repositório.
- IDs novos: `crypto.randomUUID()`.
- Cache local: chave `caderno-resina-v2:<user_id>`; último usuário em `caderno-resina-v2:ultimo`.
- Ordem de envio: `perfis, fazendas, talhoes, ramais, contagens, estrias, coletas, vendas, recebimentos, lancamentos, compromissos, compradores`.
- Fatores: Funrural `0.9837`, folha `0.998`. Intervalo ideal padrão 14. Contagem velha > 180 dias. Exemplo regerado com mais de 7 dias.

## Review Focus

1. Apontamento feito sem sinal e app fechado antes de sincronizar → reaberto, continua lá e na fila (teste em Task 4).
2. Busca traz versão de um registro que está na fila → a versão local vence (teste em Task 4).
3. Envio de fazenda com IE já usada em outra conta (erro `23505`) → sai da fila, fica com `_erro`, o resto da fila segue (teste em Task 5).
4. Sair da conta / sessão expirada → cache e fila daquele usuário continuam no aparelho; outro usuário no mesmo aparelho não vê esses dados (teste em Task 4).
5. Trocar o regime depois de vendas registradas → líquido, a receber e lucro das vendas antigas não mudam (teste em Task 2).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Casca: `<head>`, `#hdr`, `#demo`, `#app`, `nav`, `<script type="module" src="js/app.js">` |
| `css/app.css` | Todo o CSS atual (linhas 13-158 do `index.html` original) + estilos novos (indicador, botões de excluir) |
| `js/util.js` | Utilitários puros atuais (linhas 179-198) + `uid = () => crypto.randomUUID()` |
| `js/regras.js` | Constantes de negócio e cálculos (linhas 200-236, 336-390); dados via `usarDados(d)` / `dados()` |
| `js/exemplo.js` | `exemplo(seed, defs, regime)` |
| `js/graficos.js` | `chart`, `legend`, `delta`, `niceMax` |
| `js/mapa.js` | `montarDados(linhas, fazendaId)` e `dadosParaLinhas(dados, fazendaId)` |
| `js/local.js` | Cache por usuário, fila, `gravar`, `excluir`, `mesclar` |
| `js/nuvem.js` | Cliente Supabase, auth, `enviar`, `buscar`, `sincronizar` |
| `js/config.js` | `SUPABASE_URL`, `SUPABASE_ANON` |
| `js/telas.js` | Objeto `V` com as telas + helpers de formulário (`fazForm`, `modsHtml`) |
| `js/nfe.js` | NF-e simulada e consulta de CNPJ |
| `js/app.js` | Estado de tela, `render`, eventos, ligação com local/nuvem, registro do SW |
| `sw.js`, `manifest.webmanifest`, `icone.svg` | Offline e instalação |
| `supabase/migrations/0001_inicial.sql` | Tabelas, RLS, triggers, `ie_disponivel` |
| `supabase/teste-rls.mjs` | Verificação de isolamento entre dois usuários (roda com Node 18+ e `fetch`) |
| `tests/*.test.js` | Testes `node --test` |

---

### Task 1: Base e separação em módulos (sem mudar comportamento)

**Files:**
- Create: `package.json`, `.gitignore` (`node_modules/`, `.DS_Store`, `supabase/.temp/`), `css/app.css`, `js/util.js`, `js/regras.js`, `js/exemplo.js`, `js/graficos.js`, `js/telas.js`, `js/nfe.js`, `js/app.js`
- Modify: `index.html` (vira só a casca)
- Test: `tests/regras.test.js`

**Interfaces:**
- Produces: `regras.js` exporta `usarDados(d)`, `dados()`, `comFazenda(dadosFazenda, fn)`, `REG`, `fat()`, `liqV`, `totalV`, `recV`, `saldoV`, `statusRec`, `livre`, `arv`, `painT`, `totPaineis`, `tot(y)`, `estoque()`, `saldoAtual()`, `nfPend()`, `fluxo(meses)`, `kgRamal`, `ramStats`, `statusTalhoes()`, além de `MERCADO, DICAS, SAFRA, CATS_D, CATS_R, FORMAS, CORES`. As funções leem o `S` interno do módulo (definido por `usarDados`) exatamente como hoje leem o global.
- Produces: `exemplo.js` exporta `exemplo(seed=11, defs=null)` com a saída atual.

- [ ] **Step 1:** Criar branch `feat/supabase-offline` e fazer commit do estado atual (`index.html`, `CLAUDE.md`, spec, plano) como linha de base: `git commit -m "chore: linha de base do protótipo e design da integração"`.
- [ ] **Step 2: Teste de caracterização** em `tests/regras.test.js`: com `usarDados(exemplo(11))` e data fixa via `hoje` injetável (`util.js` exporta `definirHoje(iso|null)`; `hoje()` usa o valor definido se houver), `2026-10-26`:
  - `tot(2026).kgProd > 0`, `tot(2026).precoLivre` ≈ `tot(2026).precoMedio * 0.9837` (tolerância 0.01)
  - `statusTalhoes()[2].atraso > 0` (Talhão C atrasado)
  - `fluxo(6).length === 6`
  - `saldoAtual()` é número finito
- [ ] **Step 3:** Rodar `npm test` → FAIL (módulos inexistentes).
- [ ] **Step 4:** Mover o código para os módulos conforme o mapa, sem alterar lógica. `app.js` mantém as variáveis de tela e o `render`. `index.html` carrega `css/app.css` e `js/app.js` como módulo.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6:** Abrir `index.html` por um servidor local (`python3 -m http.server 8000`), entrar como exemplo e percorrer as abas; nada no console, telas iguais às de antes.
- [ ] **Step 7:** Commit `refactor: separa o app em módulos ES`.

### Task 2: Correções de regra e de modelo em memória

**Files:**
- Modify: `js/regras.js`, `js/exemplo.js`, `js/telas.js`, `js/app.js`, `js/nfe.js`
- Test: `tests/regras.test.js`, `tests/exemplo.test.js`

**Interfaces:**
- Produces: venda em memória ganha `fator:number`; `liqV(v) = r2(totalV(v) * v.fator)`. `livreV(v) = v.preco * v.fator`. `livre(p)` continua usando o regime atual (só para vendas novas e prévia).
- Produces: estrias e coletas em memória usam `talhao: <id do talhão>`; `regras.js` exporta `talById(id)` e remove o uso de `talByNome` nos cálculos (`kgRamal`, `ramStats`, `porT` comparam por id).
- Produces: `exemplo(seed, defs, regime='funrural')` gera ids com `uid()` (UUID), `fator` em cada venda e `talhao` como id.

- [ ] **Step 1: Testes** em `tests/regras.test.js`:
  - `regime não altera histórico`: dados com uma venda `{kg:100, preco:6, fator:0.9837, recs:[{valor:590.22}]}` e `regime:'folha'` → `liqV(v) === 590.22`, `saldoV(v) === 0`.
  - `venda sem kg não gera NaN`: `{kg:0,preco:6,fator:0.9837,recs:[]}` → `liqV===0`, `saldoV===0`.
  - `estria liga ao talhão por id`: dois talhões com o mesmo nome antigo não se misturam em `ramStats`.
  - Em `tests/exemplo.test.js`: toda venda tem `fator === 0.9837`; todo `talhao` de estria/coleta é id de um talhão existente; todos os ids casam `/^[0-9a-f-]{36}$/`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar. Nas telas: preço livre de cada venda usa `livreV(v)`; registrar venda grava `fator: fat()`; trocar o regime em Vendas mostra nota: "Vale para as próximas vendas. As vendas já registradas mantêm o desconto da época."
- [ ] **Step 4:** Demais correções nas telas:
  - remover o `</section>` sobrando em `producao()`;
  - venda: `vKg min="1"`, `vPreco min="0.01"`; `pct` = `liqV(v) ? … : 0`;
  - talhão com nome já existente → mensagem "Já existe um talhão com esse nome."; ramal com código já existente no talhão → "Já existe um ramal com esse código neste talhão." (elemento `.err` no formulário);
  - KPIs de produtividade da Início sob `mod('producao')`;
  - remover handler `fFlo` e `floresta` do exemplo; NF-e usa `fazAtual().uf` (remove `S.uf` e o select "Sua UF").
- [ ] **Step 5:** `npm test` → PASS; conferir no navegador Vendas, Produção, Floresta e emissão de NF-e.
- [ ] **Step 6:** Commit `fix: fator por venda, talhão por id e correções de tela`.

### Task 3: Banco no Supabase (esquema, RLS, triggers)

**Files:**
- Create: `supabase/migrations/0001_inicial.sql`, `supabase/teste-rls.mjs`

**Interfaces:**
- Produces: tabelas e colunas exatamente como na seção "Modelo no Supabase" do spec; função `public.ie_disponivel(p_ie text, p_ignorar uuid) returns boolean`; trigger `auth.users` → `perfis` lendo `raw_user_meta_data->>'nome'` e `raw_user_meta_data->'modulos'` (padrão: todos `true`).

- [ ] **Step 1:** Escrever a migração: tabelas, FKs, checks, índice único parcial `fazendas(ie) where deleted_at is null`, índices `(user_id, updated_at)`, função/trigger `tocar_updated_at`, RLS habilitada com políticas `select/insert/update` por `user_id = auth.uid()` (em `perfis`, `id = auth.uid()`), sem política de delete. `grant` para `authenticated`.
- [ ] **Step 2:** Aplicar no projeto via Management API (`POST /v1/projects/{ref}/database/query` com o token da CLI). Esperado: 201 sem erro.
- [ ] **Step 3:** Configurar Auth: `mailer_autoconfirm=true` (`PATCH /v1/projects/{ref}/config/auth`). Criar usuários de teste A e B e o `produtor@exemplo.com` (`resina123`, metadados `nome:'José Ferreira (exemplo)'`) pela API admin com a `service_role` lida em tempo de execução (não gravada em arquivo do repo).
- [ ] **Step 4:** `supabase/teste-rls.mjs` (recebe URL/anon/credenciais por variável de ambiente): A cria fazenda; B não a lê (`select` vazio), não consegue `update` nela, e `ie_disponivel(ie de A)` retorna `false` para B. Rodar → todas as verificações OK. Apagar os usuários A e B depois.
- [ ] **Step 5:** Criar `js/config.js` com URL e chave anon do projeto.
- [ ] **Step 6:** Commit `feat: esquema do banco com RLS no Supabase`.

### Task 4: Cache local, fila e mapeamento

**Files:**
- Create: `js/local.js`, `js/mapa.js`
- Test: `tests/local.test.js`, `tests/mapa.test.js`

**Interfaces:**
- Produces `local.js`:
  - `abrir(userId, armazenamento=localStorage)` → objeto `L` com `linhas` (`{tabela:{id:linha}}`), `fila` (`[[tabela,id]]`), `cursor` (`{tabela: iso}`).
  - `gravar(L, tabela, linha)`: põe/mescla linha, adiciona à fila sem duplicar, persiste.
  - `excluir(L, tabela, id)`: `deleted_at = new Date().toISOString()`, enfileira, persiste.
  - `mesclar(L, tabela, linhasRemotas)`: substitui as locais, exceto ids na fila; atualiza `cursor[tabela]` para o maior `updated_at`; persiste.
  - `pendentes(L)` → nº de itens na fila; `tirarDaFila(L, tabela, ids)`; `marcarErro(L, tabela, id, msg)`.
  - `ativas(L, tabela)` → linhas sem `deleted_at`.
  - `ultimoUsuario()` / `definirUltimo(userId)`.
- Produces `mapa.js`:
  - `montarDados(L, fazendaId)` → objeto no formato de `S` (spec, "Modelo em memória"): `regime`, `saldoInicial`, `ideal`, `demo`, `talhoes[{id,nome,ramais[{id,cod,hist[{id,data,arv,motivo}]}]}]` (hist ordenado por data), `estrias`, `producao`, `vendas[{…,fator,comNota,nf,venc,recs[{id,data,valor,forma}]}]`, `caixa`, `comp`, `compradores{nome:{id,doc,dest}}`. Ignora linhas excluídas e filhos de pais excluídos.
  - `dadosParaLinhas(dados, fazendaId)` → `{talhoes:[…], ramais:[…], …}` com os nomes de coluna do banco (`descr`, `com_nota`, `talhao_id`, `fazenda_id`, `arvores`, `venda_id`, `ramal_id`).
  - `linhaFazenda(f)` / `linhaVenda(v, fazendaId)` / … : um conversor por tabela usado pelas telas para gravar.

- [ ] **Step 1: Testes** (`armazenamento` falso em memória):
  - `ida e volta`: `montarDados(L com dadosParaLinhas(exemplo(11)))` reproduz contagens de talhões, ramais, estrias, coletas, vendas, recebimentos, caixa e comp do exemplo, e `tot()` igual nos dois.
  - `persiste antes de sincronizar` (Review Focus 1): `gravar` e depois `abrir` de novo com o mesmo armazenamento → linha e fila presentes.
  - `fila sem duplicar`: gravar o mesmo id duas vezes → fila com 1 item.
  - `local vence busca` (Review Focus 2): id na fila + `mesclar` com versão remota diferente → mantém a local; id fora da fila → recebe a remota; cursor avança.
  - `excluir esconde`: excluir talhão → `montarDados` não traz o talhão, seus ramais, estrias e coletas.
  - `usuários separados` (Review Focus 4): `abrir('A')`, gravar; `abrir('B')` → vazio; `abrir('A')` → dados de A intactos.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar. Filhos de pais excluídos: talhão excluído esconde ramais/estrias/coletas dele; venda excluída esconde recebimentos.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: cache local com fila e mapeamento para tabelas`.

### Task 5: Sincronização com o Supabase

**Files:**
- Create: `js/nuvem.js`
- Test: `tests/nuvem.test.js`

**Interfaces:**
- Consumes: `local.js` (Task 4).
- Produces: `criarNuvem(cliente, L)` → `{ enviar(), buscar(), sincronizar() }`, onde `cliente` tem a interface do supabase-js (`from(t).upsert(rows)`, `from(t).select('*').gt('updated_at',c).order('updated_at').range(a,b)`). `sincronizar()` = `enviar()` e depois `buscar()`; devolve `{ok:boolean, offline:boolean, erros:number}`.
- Produces: `conectar()` → cliente real com `createClient(SUPABASE_URL, SUPABASE_ANON, {auth:{persistSession:true, autoRefreshToken:true}})`; `entrar(email, senha)`, `cadastrar(nome, email, senha, modulos)`, `sair()`, `sessao()`.

- [ ] **Step 1: Testes** com cliente falso:
  - `envia na ordem`: fila com venda, fazenda e recebimento → `upsert` chamado na ordem fazendas, vendas, recebimentos; fila vazia ao final; linhas enviadas sem `updated_at` nem `_erro`.
  - `erro de rede preserva a fila`: `upsert` lança `TypeError('Failed to fetch')` → fila intacta, retorno `{offline:true}`.
  - `IE duplicada` (Review Focus 3): `upsert` de fazendas devolve `{error:{code:'23505'}}` → fazenda sai da fila com `_erro` = "Esta Inscrição Estadual já está cadastrada em outra conta.", as outras tabelas são enviadas. Com envio em lote falhando, reenviar a tabela linha a linha para isolar a culpada.
  - `busca paginada`: cliente devolve 1000 + 3 linhas → `mesclar` recebe as 1003; cursor = maior `updated_at`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: envio e busca de alterações no Supabase`.

### Task 6: App ligado à nuvem (login, gravações, editar e excluir)

**Files:**
- Modify: `js/app.js`, `js/telas.js`, `js/nfe.js`, `css/app.css`
- Test: verificação manual (checklist abaixo); testes existentes continuam passando

**Interfaces:**
- Consumes: `local.js`, `mapa.js`, `nuvem.js`, `exemplo.js`.
- Produces: `app.js` expõe internamente `salvarLinha(tabela, linha)` e `apagarLinha(tabela, id)` (gravam via `local`, remontam `S` com `montarDados`, chamam `render()` e agendam `sincronizar()` em 2 s). Todas as mutações das telas passam por elas; não existe mais `DB`/`salvar()` do protótipo.

- [ ] **Step 1:** Login e cadastro reais: `entrar`/`cadastrar` (nome e módulos vão em `options.data`); mensagens "E-mail ou senha incorretos.", "Já existe uma conta com este e-mail. Use Entrar.", "Sem internet: o primeiro acesso precisa de conexão.". Após login: `abrir(user.id)`, `definirUltimo`, `sincronizar()`, tela de fazendas. Ao abrir o app sem sinal e com último usuário: entra direto no cache dele.
- [ ] **Step 2:** Botão "Entrar como exemplo": entra com `produtor@exemplo.com`; após a busca, se não há fazendas, cria "Fazenda Capão Alto" (IE `254123987`, Itaiópolis/SC, `exemplo(11)`) e "Sítio Boa Esperança" (IE `9012345678`, Rio Negro/PR, `exemplo(23,[['Talhão 1',8,'Pedro'],['Talhão 2',7,'Luís']])`) com `demo=true`, `demo_gerado_em=hoje`; fazenda demo com `demo_gerado_em` há mais de 7 dias é regerada (exclui as linhas antigas da fazenda, grava novas). Conta → fazenda demo: botão "Regerar dados de exemplo".
- [ ] **Step 3:** Fazendas: cadastrar/editar grava `fazendas`; checa `ie_disponivel` quando online; mostra `_erro` da fazenda no topo da tela dela e em Conta. "Apagar registros" e "Apagar dados de exemplo" excluem (lógico) as linhas da fazenda. Módulos gravam `perfis.modulos`; nome grava `perfis.nome`.
- [ ] **Step 4:** Todas as gravações das telas (talhão, ramal, contagem, estria, coleta, lançamento, compromisso, "marcar como pago", venda, recebimento, NF-e, comprador, regime, intervalo ideal) via `salvarLinha`.
- [ ] **Step 5:** Editar/excluir, link `lnk` "editar"/"excluir" no registro, confirmação em duas etapas como o "Apagar registros" atual:
  - lançamento e compromisso: editar (data, valor, categoria, descrição) e excluir;
  - venda: editar (comprador, kg, preço, data, previsão) e excluir (leva recebimentos); recebimento: excluir;
  - estria e coleta (em "Últimos apontamentos"): excluir;
  - contagem: excluir (não aparece quando é a única);
  - ramal: renomear e excluir; talhão: renomear e excluir com texto "Excluir Talhão X apaga N ramais, N estrias e N coletas.".
- [ ] **Step 6:** Indicador de sincronização no cabeçalho (`#sync`): "Sem conexão · N para enviar" / "Enviando…" / "Tudo salvo" / "N com erro · ver" (leva a Conta, que lista os erros). Gatilhos: abertura, `online`, `visibilitychange`, após gravar (2 s), a cada 60 s com aba visível. Sair com fila pendente: "Há N alterações ainda não enviadas. Elas ficam guardadas neste aparelho. Sair mesmo assim?".
- [ ] **Step 7:** Checklist manual (servidor local, projeto real): itens 0 a 9 do critério de pronto do spec; recarregar a página mantém tudo; abrir em uma janela anônima e entrar com a mesma conta mostra os mesmos dados.
- [ ] **Step 8:** `npm test` → PASS. Commit `feat: app usa Supabase com cache local, editar e excluir`.

### Task 7: Offline do app e documentação

**Files:**
- Create: `sw.js`, `manifest.webmanifest`, `icone.svg`
- Modify: `index.html` (link do manifest, `apple-touch-icon`), `js/app.js` (registro do SW), `CLAUDE.md`, `README.md`

- [ ] **Step 1:** `sw.js`: cache versionado `caderno-v1` com `./`, `index.html`, `css/app.css`, todos os `js/*.js`, `manifest.webmanifest`, `icone.svg`. Rede primeiro para mesma origem (atualiza o cache), cache primeiro para `cdn.jsdelivr.net`, `fonts.googleapis.com`, `fonts.gstatic.com`. Requisições para `*.supabase.co`, `brasilapi.com.br`, `minhareceita.org` passam direto. Remove caches antigos no `activate`.
- [ ] **Step 2:** Verificação: com o app carregado uma vez, DevTools → Network → Offline, recarregar → app abre no último usuário; apontar uma estria → indicador "Sem conexão · 1 para enviar"; voltar online → "Tudo salvo" e a estria aparece em outra janela.
- [ ] **Step 3:** Atualizar `CLAUDE.md` (estado atual: módulos, Supabase, offline, como rodar testes, onde fica o esquema; remover "Próximo passo" já feito) e `README.md` (o que é, como rodar localmente, como rodar testes).
- [ ] **Step 4:** Commit `feat: modo offline com service worker` e `docs: atualiza CLAUDE.md e README`.

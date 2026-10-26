# Caderno da Resina: Supabase, modo offline e correções

Data: 2026-10-26 · Autor do pedido: Yghor (testador único desta versão)

## Por que

O protótipo guarda tudo no `localStorage` com login simulado. Para validar com
produtores, o app precisa de contas reais e dados que acompanham o usuário entre
aparelhos, e precisa funcionar na floresta sem sinal. Junto, corrigimos os
problemas achados na leitura do código.

## Objetivo (critério de pronto)

Yghor, testando sozinho, consegue de ponta a ponta, com dados no Supabase:

0. Entrar na conta de exemplo (`produtor@exemplo.com` / `resina123`) e ver as duas fazendas preenchidas.
1. Criar conta (e-mail e senha). 2. Entrar e sair.
3. Cadastrar e editar fazendas. 4. Cadastrar talhões, ramais, contagens; apontar estria e coleta.
5. Lançar caixa realizado e compromissos. 6. Registrar produção (coleta).
7. Registrar vendas, recebimentos e NF-e simulada. 8. Ver Resultado e Visão geral.
9. Ligar e desligar funções (salvo na conta).

Tudo isso também funciona **sem internet** depois do primeiro login, e sincroniza
sozinho quando a conexão volta. Os dados aparecem iguais em outro aparelho.

## Não-objetivos

- Cotações reais, NF-e real (SEFAZ/certificado).
- Migrar os dados do `localStorage` antigo (`caderno-resina-contas-v1`): eram só exemplo.
- Resolução sofisticada de conflitos (há um testador só).

## Anti-objetivos (seria falha mesmo funcionando)

- Perder um apontamento feito sem sinal.
- Um usuário ver dados de outro.
- Introduzir build, bundler ou dependências npm no app (continua estático no GitHub Pages).
- Mudar a aparência ou a linguagem do app além do necessário.

## Restrições

- Estático, GitHub Pages (subcaminho `/caderno-da-resina/`): todos os caminhos relativos.
- Supabase, projeto existente `xqvybotystsygeorbspd` (região `us-east-1`, escolha do Yghor; migrar para `sa-east-1` depois é possível), plano gratuito. Chave `anon` no código; RLS protege.
- `@supabase/supabase-js` por CDN com versão fixa (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm`).
- Interface em português do Brasil, mobile first (regras do `CLAUDE.md`).

## Decisões

### Do Yghor
- Usar o projeto Supabase já existente `xqvybotystsygeorbspd` (o token disponível não cria projetos).
- Modo offline nesta versão.
- Conta de exemplo existe de verdade no Supabase.

### De Claude (pode ser revista)
- **Confirmação de e-mail desligada** no Auth: o SMTP padrão do Supabase limita envios e atrapalha o teste.
- **Separar `index.html` em módulos ES** (`<script type="module">`, sem build): `js/util.js`,
  `js/regras.js` (cálculos puros), `js/exemplo.js`, `js/local.js` (cache + fila), `js/nuvem.js`
  (Supabase: auth, envio, busca), `js/graficos.js`, `js/telas.js`, `js/app.js` (estado, render, eventos),
  `css/app.css`. Comportamento e visual iguais aos atuais.
- **Tabelas normalizadas**, todas com `id uuid` gerado no aparelho, `user_id uuid default auth.uid()`,
  `updated_at timestamptz` (gravado pelo servidor via trigger) e `deleted_at timestamptz` (exclusão lógica).
  RLS em todas: `user_id = auth.uid()` para select, insert, update. Sem delete físico pelo cliente.
- **Último que grava vence.** O cliente envia o registro inteiro (upsert).
- **Cache local em `localStorage`**, uma chave por usuário: `caderno-resina-v2:<user_id>` com
  `{ linhas: {tabela: {id: linha}}, fila: [[tabela,id], ...], cursor }`. Volume esperado: poucos milhares de linhas.
- **Exemplo**: o usuário `produtor@exemplo.com` é criado no Auth durante a configuração do projeto
  (API de administração, chave `service_role` usada só na máquina, nunca no código). Ao entrar na conta de exemplo sem fazendas, o app gera os dados com `exemplo()` e envia.
  Fazenda com `demo=true` e `demo_gerado_em` com mais de 7 dias é regerada ao entrar (as datas são
  relativas a hoje; dado velho deixa de demonstrar atrasos e fluxo). Botão manual "Regerar dados de exemplo" em Conta.
- **Correções**: lista na seção própria abaixo.

## Modelo no Supabase (schema `public`)

Colunas comuns a todas as tabelas de dados: `id uuid pk`, `user_id uuid not null default auth.uid() references auth.users`,
`updated_at timestamptz not null default now()`, `deleted_at timestamptz`.

| Tabela | Colunas próprias |
|---|---|
| `perfis` | `id = auth.uid()` (pk), `nome text`, `modulos jsonb` (sem `user_id`; RLS por `id`) |
| `fazendas` | `nome`, `ie text`, `doc`, `municipio`, `uf char(2)`, `regime text check in ('funrural','folha')`, `saldo_inicial numeric`, `intervalo_ideal int default 14`, `demo bool`, `demo_gerado_em date` |
| `talhoes` | `fazenda_id → fazendas`, `nome` |
| `ramais` | `talhao_id → talhoes`, `cod` |
| `contagens` | `ramal_id → ramais`, `data date`, `arvores int`, `motivo` |
| `estrias` | `fazenda_id`, `talhao_id`, `data date`, `ramais uuid[]`, `qtd int`, `resineiro`, `dias numeric` |
| `coletas` | `fazenda_id`, `talhao_id`, `data date`, `ramais uuid[]`, `kg numeric` |
| `vendas` | `fazenda_id`, `data date`, `comprador`, `kg numeric`, `preco numeric`, `fator numeric not null`, `com_nota bool`, `nf jsonb`, `venc date` |
| `recebimentos` | `venda_id → vendas`, `data date`, `valor numeric`, `forma` |
| `lancamentos` | `fazenda_id`, `data date`, `tipo char(1) check in ('d','r')`, `cat`, `descr`, `valor numeric` (caixa realizado) |
| `compromissos` | mesmas colunas de `lancamentos` (futuros) |
| `compradores` | `fazenda_id`, `nome`, `doc`, `dest jsonb` |

- `ie` única entre **todas** as contas: índice único parcial `where deleted_at is null`.
  Como a RLS esconde fazendas alheias, uma função `ie_disponivel(ie text, ignorar uuid) returns bool`
  (`security definer`) responde quando há conexão. Sem conexão, o cadastro segue e, se o envio
  falhar por violação de unicidade, a fazenda fica marcada com erro visível e o usuário corrige a IE.
- Trigger `before insert or update` em todas as tabelas: `updated_at = now()`.
- Trigger em `auth.users` cria a linha em `perfis` com nome vindo dos metadados do cadastro e todos os módulos ligados
  (o cadastro manda os módulos escolhidos e o nome em `options.data`).
- Índice em `(user_id, updated_at)` em cada tabela.

## Sincronização

- **Gravar**: toda alteração passa por `local.gravar(tabela, linha)` / `local.excluir(tabela, id)`
  (que preenche `deleted_at`). Atualiza o cache, põe `[tabela,id]` na fila (sem duplicar), salva e redesenha.
- **Enviar** (quando online e com sessão): percorre a fila por ordem de dependência
  (`perfis, fazendas, talhoes, ramais, contagens, estrias, coletas, vendas, recebimentos, lancamentos, compromissos, compradores`),
  faz `upsert` em lote por tabela com a linha atual do cache (sem `updated_at`, que é do servidor).
  Sucesso remove da fila. Erro de rede: para e tenta depois. Erro de dado (ex.: IE duplicada):
  tira da fila, guarda o erro na linha local (`_erro`) e mostra.
- **Buscar**: para cada tabela, `select * where updated_at > cursor[tabela]` ordenado por `updated_at`,
  em páginas de 1000 (limite padrão da API). Linha recebida substitui a local, **exceto** se está na fila
  (alteração local ainda não enviada vence). Cursor por tabela = maior `updated_at` recebido.
- **Quando**: ao abrir o app, ao voltar a conexão (`online`), ao voltar para a aba (`visibilitychange`),
  depois de cada gravação (com espera de ~2 s para agrupar) e a cada 60 s com a aba visível.
- **Indicador** no cabeçalho: "Sem conexão · N para enviar", "Enviando…", "Tudo salvo", ou erro com link "ver".

## Offline do app

- `sw.js` (service worker) guarda a casca do app: `index.html`, `css/`, `js/`, o módulo do supabase-js e as fontes.
  Estratégia: rede primeiro para os arquivos do app (pega versão nova quando há sinal), cache como reserva;
  cache primeiro para CDN e fontes. Chamadas ao Supabase e às APIs de CNPJ nunca passam pelo cache.
- `manifest.webmanifest` para instalar na tela inicial (ícone simples em SVG).
- Login exige internet. Sessão salva pelo supabase-js; sem sinal, o app usa o último usuário logado e o cache dele.
  Se ao voltar a conexão a sessão não puder ser renovada, pede login de novo **sem apagar a fila**.
- Sair da conta com fila pendente: avisa e pede confirmação (a fila do usuário fica guardada no aparelho).

## Modelo em memória

As telas continuam lendo o formato atual (`S.talhoes[].ramais[].hist`, `S.estrias`, `S.producao`, `S.vendas[].recs`, …),
montado a partir das linhas do cache por `montarDados(fazendaId)`. Diferenças:
- `talhao` passa a ser o **id** do talhão (não o nome) em estrias e coletas; as telas usam `talById`.
- Cada venda tem `fator`; `liqV(v)` usa `v.fator`. O regime da fazenda só define o fator de vendas novas.
  Ao gerar exemplos, `fator` = fator do regime da fazenda.
- `S.uf` sai; a NF-e usa a UF da fazenda. `S.floresta` e o handler `fFlo` saem.

## Correções incluídas

1. Fator gravado em cada venda (troca de regime não altera histórico). Tela de vendas explica isso ao trocar.
2. **Excluir** (com confirmação): lançamento, compromisso, estria, coleta, venda (e seus recebimentos), recebimento,
   contagem (exceto a única do ramal), ramal, talhão (leva ramais, contagens, estrias e coletas dele, informando quantos).
   **Editar**: lançamento e compromisso (data, valor, categoria, descrição), venda (comprador, kg, preço, data, previsão),
   nome do talhão, código do ramal. Estria e coleta: excluir e apontar de novo.
3. `</section>` sobrando em `producao()`.
4. Venda exige kg ≥ 1 e preço > 0; barra de recebimento protegida contra divisão por zero.
5. Talhão com nome repetido e ramal com código repetido no mesmo talhão: mensagem de erro em vez de silêncio.
6. KPIs de produtividade da Início dependem de `mod('producao')`.
7. Remover `fFlo`/`S.floresta`; trocar `S.uf` pela UF da fazenda.

## Testes

- `node --test` (sem dependências) para módulos puros: `regras.js` (preço livre com fator por venda, `tot`, `fluxo`,
  rateio, `ramStats`), `local.js` (fila, exclusão lógica, mesclagem da busca respeitando a fila), `exemplo.js`
  (gera dados consistentes, ids uuid, fator preenchido).
- Teste de ponta a ponta manual no navegador seguindo o critério de pronto, incluindo modo avião.
- Script `supabase/teste-rls.sql` ou verificação via API: usuário A não lê nem grava linhas do B.

## Deixado para quem implementar

Nomes internos, layout exato dos botões de editar/excluir (seguir o padrão `lnk` existente), mensagens de erro,
detalhes do service worker, ordem dos commits.

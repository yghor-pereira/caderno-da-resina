# Métricas de uso

O app registra **que** o produtor usou uma tela ou função, para saber o que é usado e o que é ignorado. Nunca registra conteúdo: valores em reais, descrições, nomes de fazenda, talhão ou comprador.

## Como funciona

- Todas as chamadas passam por `track(evento, props)` em `js/metricas.js`. Não chame o servidor de outro lugar.
- Os eventos vão para uma fila no aparelho (`localStorage`, chave `caderno-resina-metricas:<user_id>`), separada do cache de dados. A fila tem no máximo 1.000 eventos; os mais antigos saem primeiro.
- A fila segue em lotes de até 300 eventos pela função `registrar_uso()` do banco, logo depois de cada sincronização bem-sucedida. Sem sinal, espera. Qualquer falha é ignorada: a métrica nunca atrasa nem quebra o app.
- `registrar_uso()` grava sempre em nome de quem está logado e marca `is_demo` a partir do perfil (a conta de exemplo). Descarta eventos fora do formato, limita horas futuras ao agora e recusa lotes com mais de 500 eventos.
- Ninguém lê `eventos` nem `sessoes` pela API. O painel de admin lê só agregados.

### Propriedades permitidas

`limpar()` só deixa passar chaves em minúsculas e valores que são:
- verdadeiro/falso;
- inteiros (ex.: quantidade de registros num lote);
- textos curtos sem espaço (até 40 caracteres: nomes de tela, tabela, função).

Texto livre e números com casas decimais são descartados, então um valor em reais passado por engano não chega ao servidor.

### Sessões e tempo de uso

- Uma sessão começa ao entrar ou abrir o app, e outra começa na primeira atividade depois de 30 minutos parado.
- O tempo de uso só conta com a aba visível **e** com toque, tecla ou rolagem nos últimos 2 minutos. O app soma o tempo a cada 15 segundos (no máximo 60 s por intervalo).
- O tempo de uso sem sinal também conta e vai para o servidor depois. O servidor limita o tempo ativo à duração da sessão + 60 s.
- `dispositivo` guarda só o tipo: `Android · Chrome · app`, `iPhone · Safari · navegador` etc.

## Catálogo de eventos

| Evento | Quando | Propriedades |
|---|---|---|
| `app_open` | o app abre com um usuário já logado (inclusive sem sinal) | `online` |
| `login` | entrou | `modo`: `senha`, `exemplo` ou `cadastro` |
| `logout` | tocou em Sair | — |
| `page_view` | trocou de tela ou de aba interna | `tela` (coluna), `modo` em Caixa (`real`, `comp`) e Floresta (`ramais`, `apontar`, `estrias`) |
| `record_created` | criou um registro | `tabela`, `qtd` quando foi mais de um no mesmo lote |
| `record_updated` | alterou um registro | `tabela`, `qtd` |
| `record_deleted` | excluiu um registro | `tabela`, `qtd` |
| `feature_used` | usou uma função que não é só gravar | `funcao` (abaixo); `modulo` em `funcao_ligada`/`funcao_desligada` |
| `export` | reservado: o app ainda não exporta nada | — |

**Telas** (`tela` ou `tela:modo`): `fazendas`, `geral`, `conta`, `inicio`, `caixa:real`, `caixa:comp`, `floresta:ramais`, `floresta:apontar`, `floresta:estrias`, `producao`, `vendas`, `resultado`.

**Tabelas** (`record_*`): `perfis`, `fazendas`, `talhoes`, `ramais`, `contagens`, `estrias`, `coletas`, `vendas`, `recebimentos`, `lancamentos`, `compromissos`, `compradores`.

**Funções** (`feature_used`):

| `funcao` | O que o produtor fez |
|---|---|
| `dados_exemplo` | cadastrou fazenda começando com dados de exemplo |
| `regerar_exemplo` | regerou os dados de exemplo em Conta |
| `limpar_fazenda` | apagou os registros de uma fazenda |
| `compromisso_pago` | marcou um compromisso futuro como pago |
| `regime_alterado` | trocou Funrural/folha |
| `intervalo_alterado` | mudou o intervalo ideal de estria |
| `funcao_ligada` / `funcao_desligada` | ligou ou desligou uma função em Conta (`modulo`) |
| `safra_trocada` | escolheu outra safra nos gráficos |
| `nfe_emitida` | emitiu a NF-e simulada |
| `cnpj_consultado` | consultou o CNPJ do comprador |
| `sincronizar_manual` | tocou no indicador de sincronização |

Os dados de exemplo e a limpeza de fazenda **não** geram `record_*` (seriam centenas de registros que o produtor não digitou); geram só o `feature_used` correspondente.

## Como adicionar um evento ou função

1. Chame `track('feature_used', {funcao:'nome_novo'})` (ou outro evento do catálogo) no ponto do app onde a ação acontece. O nome é em minúsculas com `_`.
2. Inclua o nome em `CATALOGO` em `js/metricas.js`. O painel usa essa lista para mostrar também o que teve zero uso.
3. Atualize as tabelas deste arquivo.
4. Evento novo (não só função nova) precisa seguir o formato `^[a-z_]{1,40}$`, senão o servidor descarta.
5. Nunca passe valores, descrições ou nomes nas propriedades. `limpar()` barra a maioria, mas não conte com isso.

## Testes

- `npm test`: `tests/metricas.test.js` (fila, tempo de uso, envio, limites) e `tests/estado.test.js` (gravações viram métricas sem conteúdo).
- `supabase/teste-metricas.mjs`: no servidor, com uma conta comum. Ela não lê nem grava direto nas tabelas, reenviar não duplica, o formato é validado e o lote tem limite.

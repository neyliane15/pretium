# Registro de alterações de contrato

Append-only. Formato e regras em `docs/DIVISAO_TRABALHO.md` §6.
Contratos: `docs/ARQUITETURA.md`, `docs/DESIGN.md`, `src/types/*`, `src/lib/calc.ts`, APIs de `src/components/ui`.

## 2026-11-18 — PROJETO — versão inicial do contrato
- O quê: modelo de dados, RPCs, regras de cálculo, design system, roteamento e divisão de trabalho.
- Status: aplicado (agente de projeto)

## 2026-11-18 — FRONTEND-1 — componentes de prioridade 1 entregues
- O quê: `Drawer`, `Combobox`, `DropdownMenu`, `Tooltip`, `Alert`, `Pagination`, `DateInput`, `FileDrop`,
  `Progress`, `Avatar`, `Kbd` exportados em `src/components/ui/index.ts` com as assinaturas de
  DIVISAO §4. Props **aditivas** (opcionais) além do contrato:
  - `Combobox`: `id`, `aria-label`, `aria-describedby`, `aria-invalid` (compatível com `<Field>`), `disabled`,
    `className`, `listHeader`, `maxListHeight` (320), `clearOnSelect` (limpa o texto após escolher —
    útil para "adicionar item" em sequência). Limpar o texto chama `onChange(null)`.
  - `Drawer`: `eyebrow`, `actions` (cabeçalho), `dismissable`, `className`.
  - `DropdownMenu`: item aceita `hint`; menu aceita `header`, `minWidth`, `aria-label`. Tipos
    `DropdownMenuItem`/`DropdownMenuEntry` exportados.
  - `Tooltip`: `delay` (350 ms), `className`. Não funciona em elemento `disabled` (envolva num `<span tabIndex={0}>`).
  - `Alert`: `icon` (`null` remove), `onDismiss`.
  - `Pagination`: `itemLabel`, `className`; helper `paginas()` exportado.
  - `Progress`: `valueText`, `variant` (brand · success · danger), `striped`, `className`.
  - `FileDrop`: `label`, `file`, `className`.
- Também: `Modal` e `Drawer` compartilham trap de foco com **pilha** (Esc fecha só o diálogo do topo;
  Drawer + ConfirmDialog por cima funciona) e o efeito não reexecuta quando `onClose` é inline
  (antes o foco "pulava" para o 1º campo a cada render). Foco inicial: `[data-autofocus]` → 1º
  focável do corpo → 1º focável. Tokens novos `tooltip`, `tooltip-fg`, `tooltip-border` e animações
  `animate-drawer-in`, `animate-progress`.
- Impacto: FRONTEND-2 pode consumir via `@/components/ui`. Nenhuma API existente mudou.
- Status: aplicado (FRONTEND-1)

## 2026-11-18 — BACKEND-1 — helpers entregues (0001–0005) e notas para o BACKEND-2
- O quê: `0001`–`0005` publicadas com as assinaturas exatas de §6.2 / DIVISAO §2.2
  (`set_updated_at()`, `fn_auditoria_trigger()`, `registrar_auditoria(text,text,text,jsonb,uuid)`,
  `is_active_user()`, `is_admin()`, `org_papel(uuid)`, `is_org_member(uuid)`, `can_edit_org(uuid)`,
  `is_org_owner(uuid)`, `assert_pode_editar(uuid)`, `assert_admin()`).
  1. **Extensões no schema `extensions`** (padrão Supabase): use `extensions.unaccent('extensions.unaccent', x)`
     (ou `extensions.unaccent(x)`), `extensions.gin_trgm_ops`, `extensions.citext`,
     `extensions.similarity(...)`, operador `operator(extensions.%)` quando o `search_path` da função for vazio.
  2. **`registrar_auditoria(...)` não tem `execute` para `anon`/`authenticated`** (impede forjar auditoria).
     Chame-a somente de funções `security definer` (dono `postgres`) ou de triggers.
  3. Funções `security definer` do núcleo usam `set search_path = ''` com nomes qualificados
     (mais estrito que `public`; compatível com o contrato).
  4. Utilitários extras (não contratuais, podem ser usados): `fn_define_created_by()` (trigger
     BEFORE INSERT OR UPDATE que fixa `created_by = auth.uid()` e impede alterá-lo), `try_uuid(text)`.
- Por quê: segurança e convenção do Supabase.
- Impacto: BACKEND-2 (migrações 0010+).
- Status: aplicado (BACKEND-1)

## 2026-11-18 — BACKEND-1 — núcleo completo (0006–0009) e desvios/endurecimentos
- O quê:
  1. **Primeiro admin endurecido**: se `configuracoes.admin_emails` **não estiver vazio**, somente os
     e-mails listados viram admin no cadastro; a regra "primeiro usuário vira admin" só vale com a
     lista vazia. (Contrato dizia "OU"; com "OU", um estranho que se cadastrasse primeiro viraria
     admin mesmo com a lista definida.) Cadastros simultâneos serializados por advisory lock.
  2. **`cadastro_aberto = false` é aplicado no banco**: `handle_new_user` rejeita o cadastro
     (`P0001` "Cadastro fechado. Solicite um convite ao administrador.") exceto para e-mails de
     `admin_emails`, o primeiro admin e quem tem convite pendente não expirado.
  3. **`anon` lê `configuracoes` com `publica = true`** (tela de cadastro precisa de `cadastro_aberto`,
     faixa `aviso_global`). Demais tabelas do núcleo: nenhum privilégio para `anon`.
  4. Helpers booleanos **nunca retornam null** (`coalesce(..., false)`), seguros em `if not ...`.
  5. `obter_convite` devolve `status = 'expired'` para convite `pending` já vencido.
  6. `fn_profiles_protege_campos` também impede `organizacao_ativa_id` apontar para org da qual o
     usuário não é membro; o bloqueio é ignorado em contexto privilegiado (JWT `service_role` ou
     conexão direta sem JWT — migrações, SQL editor, GoTrue). `fn_organizacoes_protege_campos`: só
     admin altera `organizacoes.status`.
  7. Normalização por trigger: `organizacoes.cnpj`/`clientes.documento` → só dígitos; e-mail vazio
     → null; UF em maiúsculas. Check `clientes.documento`: PF ⇒ 11 dígitos, PJ ⇒ 14.
     `obras.cliente_id` precisa ser cliente da mesma organização (`P0001`).
  8. `created_by` em `organizacoes`/`clientes`/`obras` é forçado para `auth.uid()` e imutável.
  9. Auditoria: RPCs admin gravam a ação semântica (`aprovar_usuario`, `bloquear_usuario`,
     `alterar_papel`, `config`) **e** o trigger genérico grava o `update` correspondente.
     Cadastro grava `acao = 'cadastro'`.
  10. `profiles.email` sincronizado quando `auth.users.email` muda (trigger `on_auth_user_email_changed`).
  11. Convidado vê os próprios convites (qualquer status) via RLS; owner/editor veem os da org.
  12. Funções internas extras (sem `execute` para `anon`): `fn_config`, `fn_contexto_privilegiado`,
      `fn_email_usuario_atual`, `compartilha_organizacao`, `try_uuid`, `fn_exige_ativo`,
      `fn_garante_outro_owner`, triggers `fn_*`.
  13. Testes do núcleo em `supabase/tests/core/` (prefixo `core_`): `core_stub_supabase.sql`
      (stub de auth/storage/roles, reutilizável pelo B2/TESTES), `core_helpers.sql`, `core_run.mjs`,
      `core_01_rls_rpc.test.sql`. Rodar: `PGLITE_DIR=<dir>/node_modules node supabase/tests/core/core_run.mjs`
      (requer `npm i @electric-sql/pglite` fora do projeto; `PRETIUM_MIGRATIONS=all` aplica 0001..N).
- Pendente para o dono do README (FRONTEND-1/REVISOR): documentar que, **antes de abrir o cadastro em
  produção**, deve-se rodar no SQL editor
  `update public.configuracoes set valor = '["voce@empresa.com"]' where chave = 'admin_emails';`
  (ou manter `cadastro_aberto = false` até o admin se cadastrar), e recomendar
  `enable_confirmations = true` no Auth (aceite de convite confia no e-mail da conta).
- Impacto: `src/types/db-core.ts` **sem mudança** (tipos já compatíveis). Front: tratar o erro de
  cadastro fechado; `obter_convite` pode retornar `expired`.
- Status: aplicado (BACKEND-1)

## 2026-11-18 — BACKEND-2 — migrações 0010–0022, seed e testes entregues; desvios e esclarecimentos
- O quê (entregue): `0010`–`0022` (faixa 0023–0029 livre), `supabase/seed.sql`, testes em
  `supabase/tests/orcamento/` (`orc_run.mjs`, `orc_helpers.sql`, `orc_*.test.sql`; reutilizam
  `tests/core/core_stub_supabase.sql` e `tests/core/core_helpers.sql` do B1). Todas as RPCs de §7.2 com as
  assinaturas exatas. Nenhuma mudança necessária em `src/types/db-orcamento.ts`.
- Desvios / esclarecimentos (todos compatíveis com os tipos atuais):
  1. **FKs `on delete restrict` → `on delete no action deferrable initially deferred`** em
     `composicao_itens.insumo_id/subcomposicao_id` e `orcamento_itens.composicao_id/insumo_id`. Com `restrict`
     a exclusão de uma organização falhava no meio da cascata (insumo próprio apagado antes do item que o
     usa). Excluir um insumo/composição referenciado continua proibido (erro 23503 no commit da requisição).
  2. **`orcamento_bdis.bdi`**: mesma fórmula, com `nullif(1 − I/100, 0)` no divisor para o check
     `pis+cofins+iss+cprb < 100` responder (23514) em vez de "division by zero". Resultados idênticos.
  3. **RLS `datas_base` (select)**: além de `publicada` (e admin), o usuário vê a data-base usada por algum
     orçamento da sua organização (ex.: data-base arquivada depois). `insumo_precos`/`composicao_precos`:
     leitura para qualquer usuário ativo (sem filtrar status da data-base).
  4. **Bloqueio por status** (aprovado/arquivado ⇒ etapas, itens, BDIs, cotações e memórias somente
     leitura, exceto admin): não se aplica a contexto sem `auth.uid()` (migração/seed/service_role).
     `fn_orcamento_recalcular` em orçamento aprovado/arquivado **devolve a linha sem alterar** (sem erro);
     `fn_orcamento_trocar_data_base` nesses status ⇒ erro P0001. Exclusão do próprio orçamento continua livre.
     Medições `fechada/aprovada` ⇒ `medicao_itens` somente leitura (exceto admin).
  5. **`sem_preco`**: composição marca `sem_preco` se o custo é nulo **ou** algum componente (recursivo) não
     tem preço (o custo parcial fica no item); custo oficial ⇒ `false`; itens `livre`/`custo_manual` ⇒
     `sem_preco = (custo_unitario = 0)`.
  6. **Trigger de itens**: além de §8.3, aplica `bdi_percentual` do BDI (`bdi_id` ou o padrão) no INSERT e
     quando `bdi_id` muda; valida etapa/BDI do mesmo orçamento e referência SINAPI ou da mesma org.
     `fn_herda_organizacao` também impede mover um registro para outra organização via UPDATE.
  7. **`fn_orcamento_criar`**: `versao = 1`; preenche `encargos_sociais_id` com a tabela global mais recente
     da mesma UF/regime da data-base (se houver). Chaves ausentes em `p_bdi_padrao` ⇒ 0 (PIS 0,65 / COFINS 3).
  8. **`fn_orcamento_adicionar_item`**: `p_custo_unitario` informado para composição/insumo ⇒
     `custo_manual = true`; item livre exige `p_descricao`, unidade padrão `UN`, `fonte = 'PRÓPRIA'`
     (próprias também `'PRÓPRIA'`; SINAPI `'SINAPI'`). Renumera e atualiza totais de etapas/orçamento
     (sem recalcular custos). `fn_orcamento_mover`: `p_nova_ordem` = **posição 1-based** entre os irmãos
     de destino (≤1 ⇒ primeiro, >n ⇒ último); renumera e totaliza.
  9. **`fn_orcamento_duplicar`**: nova versão mantém o nome (sem `p_nome`); cópia sem nova versão recebe
     " (cópia)" e mantém `versao`; status `rascunho`, `data_orcamento = hoje`.
  10. **Explosão (§8.4)** para ABC de insumos e horas de MO: itens com `custo_manual` entram como
      pseudo-insumo com o custo do item (como os livres); itens com quantidade 0 são ignorados; composição
      com custo oficial também é explodida pelo analítico quando ele existe.
  11. **`fn_buscar_referencias`**: SINAPI "com preço" = insumo com `insumo_precos` / composição com
      `composicao_precos` na data-base; composições próprias retornam o custo calculado; termo vazio lista
      por código; termo numérico também casa descrição; `p_limite` limitado a 200; só `ativo = true`.
  12. **`fn_dashboard_resumo`**: `valor_orcado_total` exclui arquivados; `medido_total` = Σ medições;
      `data_base_mais_recente` = publicada da `uf_padrao` da org, preferindo oficial a demo.
  13. **Importação**: normaliza de novo no banco (código sem zeros à esquerda/".0", unidade maiúscula,
      números pt-BR em texto aceitos). Se o upsert do lote falhar, reprocessa linha a linha (erro de uma
      linha nunca aborta o lote). Insumo/composição oficial importada com o mesmo código de um registro do
      seed passa a `is_demo = false` (catálogo é único). `tipo` do insumo só é sobrescrito quando informado.
      `fn_sinapi_finalizar_importacao`: status `erro` se nenhuma linha ok e houve erros; só publica se
      `concluida`. `fn_sinapi_iniciar_importacao` acumula `datas_base.fonte_arquivo`.
  14. Utilitários públicos (imutáveis, sem dados): `f_unaccent`, `fn_codigo_ordem`, `fn_numero_br`,
      `fn_sinapi_normalizar_codigo`, `fn_honorario_valor_disciplina`, `fn_honorario_total`,
      `fn_cronograma_inicio_periodo`. Internos sem `execute` para clientes: `fn_custos_composicoes`,
      `fn_preco_insumo_interno`, `fn_orcamento_totalizar`, `fn_orcamento_explosao`, `fn_orc_assert_*`,
      `fn_sinapi_*` auxiliares.
  15. **Seed**: códigos/descrições no padrão SINAPI, coeficientes aproximados, preços fictícios; o custo
      "publicado" demo de cada composição = custo calculado pela própria estrutura; duas tabelas de encargos
      demo (não desonerado e desonerado). Conferir códigos antes de qualquer uso real.
- Impacto: FRONTEND-2 (semântica de `p_nova_ordem`, `sem_preco`, recálculo em aprovado), FRONTEND-1
  (importador), TESTES/REVISOR (aplicar ao ARQUITETURA §5.3/§5.4/§7.2).
- Status: aplicado (BACKEND-2)

## 2026-11-18 — FRONTEND-1 — refinamentos do design system e camada de dados do núcleo
- O quê:
  - `Table`: prop aditiva `inset` (dentro de `Card flush`: sem borda/raio próprios e 1ª/última coluna com 16px, alinhadas ao cabeçalho do card). Substitui `containerClassName="rounded-none border-0"`.
  - `Select`: `<select>` casa com `:read-only` no Chromium e aparecia com fundo `sunken`; agora mantém fundo `surface` (desabilitado continua `sunken`). Sem mudança de API.
  - `.hazard-stripe`: listra escura usa `--c-accent-fg` (antes `--c-graphite`, que fica claro no tema escuro).
  - `qkCore`: chaves aditivas `obrasDoCliente`, `meusConvites`, `convite`, `arquivoUrl`, `dataBaseRecente`, `admin.datasBase/configuracoes/membrosOrg`.
  - Hooks do núcleo em `src/api/core/{auth,perfil,organizacao,clientes,configuracoes,admin,sinapi,arquivos,util}.ts`
    (F2 pode usar `useDataBaseMaisRecente`, `useConfiguracoesPublicas`, `useArquivoUrl(BUCKETS.logos, org.logo_path)` para o cabeçalho dos relatórios).
  - Parser SINAPI em `src/lib/sinapi/parser.ts` (puro, testado) + `src/lib/sinapi/planilha.ts` (SheetJS sob demanda). Lotes de `SINAPI_LOTE_MAX` (1000).
    No analítico, as linhas-cabeçalho de composição (sem TIPO ITEM) são enviadas opcionalmente via `fn_sinapi_importar_composicoes` na mesma importação, antes dos itens.
  - Rótulos do domínio admin/SINAPI em `src/components/admin/rotulos.ts` (em vez de editar `labels.ts`).
  - Sem `VITE_SUPABASE_URL`/`ANON_KEY` o `App` mostra `ConfiguracaoNecessaria` (não quebra) e o `AuthProvider` não chama o Supabase.
- Impacto: nenhum breaking change. F2: preferir `<Table inset>` dentro de `Card flush`.
- Status: aplicado (FRONTEND-1)

## 2026-11-18 — FRONTEND-2 — telas de obras/orçamento/referências/honorários/relatórios e notas de integração
- O quê:
  1. Camada de dados em `src/api/orcamento/{util,referencias,orcamentos,analises}.ts` e `src/api/core/obras.ts`
     (único arquivo de `api/core` do F2). Chaves aditivas usadas sob os prefixos existentes de `qkOrc`
     (ex.: `['orc', id, 'cotacoes']`, `['orc', id, 'memorias']`, `['orc', id, 'analiticas', …]`,
     `['ref','composicao-preco',…]`) para que `invalidateQueries(['orc', id])` alcance tudo do orçamento.
  2. `useClientesOpcoes()` em `api/core/obras.ts` lê só `clientes(id, nome)` ativos para o seletor do
     formulário de obra (sem duplicar os hooks completos de clientes do F1).
  3. Escritas sem RPC dedicada no contrato, feitas por tabela (RLS) seguidas de `fn_orcamento_recalcular`:
     memória de cálculo (substitui as linhas do item e liga `usa_memoria`), cotações (`upsert` em
     `orcamento_insumo_precos` por `orcamento_id,insumo_id`), BDIs (update/insert), etapas (insert +
     `fn_orcamento_renumerar`), itens (update de quantidade/custo/BDI/descrição com atualização otimista via
     `calcularItem`; recálculo consolidado com debounce de 600 ms). Medição: `upsert` em `medicao_itens`
     (`medicao_id,item_id`) e `delete` quando a quantidade é 0.
  4. **Composição própria**: salva cabeçalho e **substitui** `composicao_itens` (delete + insert) — não é
     atômico. Proposta (BACKEND-2/REVISOR): RPC `fn_composicao_propria_salvar(p_id uuid, p_cabecalho jsonb,
     p_itens jsonb) returns uuid` em transação; o front troca a implementação em
     `useSalvarComposicaoPropria` sem mudar a tela.
  5. `fn_orcamento_mover` usado com `p_nova_ordem` 1-based (conforme nota 8 do BACKEND-2).
  6. Rótulos novos do domínio em `src/lib/labels-orcamento.ts` (badges de medição/honorário, grupos de
     encargos, cores ABC, siglas de tipo de insumo). `labels.ts` intocado.
  7. Impressão: CSS próprio em `src/components/relatorios/impressao.css` (importado só pela rota
     `/imprimir/...`): A4 retrato, `@page paisagem` para o cronograma, numeração “Página X de Y”, cabeçalho
     com logo da organização (`useArquivoUrl`) + Pretium, carimbo técnico e rodapé com data-base/regime;
     `styles/index.css` (F1) não foi alterado.
  8. Exportação: `src/lib/export/{tabela,csv,xlsx,relatorios}.ts` (CSV `;`, vírgula decimal, BOM, CRLF;
     XLSX com números nativos e formatos `#,##0.00` etc.).
  9. Lógica pura testada: `src/components/orcamento/eap.ts` (árvore/numeração/totais via `calc.ts`) e
     `src/components/orcamento/cronograma.ts` (totais por período, distribuição linear).
- Impacto: BACKEND-2 (proposta do item 4), REVISOR (registrar em ARQUITETURA §12 a pasta de impressão).
- Status: aplicado (FRONTEND-2); item 4 proposto.

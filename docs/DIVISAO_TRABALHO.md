# Pretium — Divisão de trabalho

Seis agentes trabalham em seguida ao agente de projeto: **BACKEND-1**, **BACKEND-2**,
**FRONTEND-1** e **FRONTEND-2** em paralelo; depois **TESTES** e **REVISOR**.
Este documento define **quem é dono de cada arquivo**. Regra de ouro:

> **Só edite arquivos que você possui.** Precisa de mudança em arquivo de outro agente ou no
> contrato? Registre em `docs/CONTRATO_ALTERACOES.md` (append-only) e, se for bloqueante,
> implemente localmente no seu domínio de forma compatível até o dono absorver.

Contratos que todos seguem à risca: `docs/ARQUITETURA.md` (dados, RPC, cálculo) e
`docs/DESIGN.md` (visual). Ambos estão **congelados**: alteração só via `CONTRATO_ALTERACOES.md`
e aplicação pelo REVISOR.

---

## 1. Estado entregue pelo agente de projeto

- Projeto Vite + React + TS strict compilando (`npm run build`, `typecheck`, `test`, `lint`).
- Tokens de design (`src/styles/index.css`, `tailwind.config.ts`), logomarca (`public/*.svg`,
  `src/components/brand/Logo.tsx`).
- Componentes base funcionais em `src/components/ui/*` (API estável em `index.ts`).
- Layout (`AppShell`, `Sidebar`, `Topbar`), guardas de rota, contextos (`Auth`, `Organizacao`,
  `Theme`) já funcionais em versão inicial; `LoginPage` e `CriarOrganizacaoPage` funcionais.
- Roteamento completo em `src/App.tsx` com páginas placeholder **nos nomes finais**.
- Tipos do banco (`src/types/*`) coerentes com a ARQUITETURA, verificados contra o supabase-js
  (`src/types/contrato.typecheck.ts`).
- `src/lib/calc.ts` (regras de cálculo) e `src/lib/format.ts` com testes.
- `supabase/config.toml`, `supabase/seed.sql` (cabeçalho), pasta `supabase/migrations/` vazia.

## 2. Backend

### 2.1 Numeração de migrações (sem colisão)

| Faixa | Dono | Conteúdo previsto |
|---|---|---|
| `0001`–`0009` | BACKEND-1 | núcleo |
| `0010`–`0029` | BACKEND-2 | SINAPI + orçamento |
| `0030`–`0039` | TESTES / REVISOR | correções pós-integração |
| `0040`+ | futuro | — |

Nome: `supabase/migrations/NNNN_descricao_snake.sql` (ex.: `0004_organizacoes_membros_convites.sql`).
Cada arquivo roda limpo sobre os anteriores, em uma transação implícita do CLI. Sem `drop` de
objetos de outra faixa.

### 2.2 BACKEND-1 — núcleo

**Arquivos**: `supabase/migrations/0001_*.sql` … `0009_*.sql`, `supabase/tests/core/**` (SQL/pgTAP
opcional). Não toca `seed.sql`.

Sugestão de fatiamento:

| Arquivo | Conteúdo |
|---|---|
| `0001_extensoes_enums.sql` | extensões (`pgcrypto`, `citext`, `pg_trgm`, `unaccent`); enums `app_role`, `user_status`, `org_role`, `org_status`, `invite_status`, `pessoa_tipo`, `obra_status`, **`regime_desoneracao`** |
| `0002_funcoes_utilitarias.sql` | `set_updated_at()`; tabela `auditoria_logs`; `fn_auditoria_trigger()`, `registrar_auditoria(...)` |
| `0003_profiles_configuracoes.sql` | `profiles`, `configuracoes` (+ linhas padrão), `handle_new_user()` + trigger em `auth.users`, `fn_profiles_protege_campos()` |
| `0004_organizacoes_membros_convites.sql` | `organizacoes`, `organizacao_membros`, `convites`; FK `profiles.organizacao_ativa_id` |
| `0005_helpers_permissao.sql` | `is_active_user`, `is_admin`, `org_papel`, `is_org_member`, `can_edit_org`, `is_org_owner`, `assert_pode_editar`, `assert_admin` (§6.2) |
| `0006_clientes_obras.sql` | `clientes`, `obras` + índices + triggers `updated_at` e auditoria |
| `0007_rls_core.sql` | RLS e políticas de todas as tabelas do núcleo (§6.3) |
| `0008_storage.sql` | buckets `logos`, `avatares`, `sinapi-arquivos` + políticas em `storage.objects` (§11) |
| `0009_rpc_core.sql` | todas as RPCs de §7.1 + `grant execute ... to authenticated` |

Requisitos específicos:
- **Primeiro admin**: `handle_new_user()` promove a admin/ativo se não houver admin, ou se o e-mail
  estiver em `configuracoes.admin_emails` (§7.1). Documentar no README como definir
  `admin_emails` em produção **antes** de abrir cadastro.
- Funções `security definer` com `set search_path = public` (e `extensions` quando usar
  `unaccent`/`citext`); `revoke execute ... from public, anon` e `grant ... to authenticated`.
- `admin_estatisticas()` lê tabelas do B2 apenas via SQL dinâmico protegido por
  `to_regclass('public.orcamentos') is not null`.
- Triggers de auditoria em: `organizacoes`, `organizacao_membros`, `convites`, `clientes`,
  `obras`, `configuracoes`, `profiles` (só mudanças de `status`/`papel_global`).

**O que o B2 pode referenciar do B1** (estável, nomes exatos):
`organizacoes(id)`, `obras(id, organizacao_id)`, `auth.users(id)`, enum `regime_desoneracao`,
`set_updated_at()`, `fn_auditoria_trigger()`, `registrar_auditoria(...)`, `is_active_user()`,
`is_admin()`, `is_org_member(uuid)`, `can_edit_org(uuid)`, `is_org_owner(uuid)`,
`assert_pode_editar(uuid)`, `assert_admin()`.
**B1 nunca referencia objetos do B2** (exceto o SQL dinâmico citado).

### 2.3 BACKEND-2 — SINAPI e orçamento

**Arquivos**: `supabase/migrations/0010_*.sql` … `0029_*.sql`, `supabase/seed.sql`,
`supabase/tests/orcamento/**`.

Sugestão de fatiamento:

| Arquivo | Conteúdo |
|---|---|
| `0010_sinapi_enums_util.sql` | enums B2 (§5.1); `f_unaccent(text)` immutable; `fn_herda_organizacao()` (trigger genérico que copia `organizacao_id` do pai — parametrizado por `TG_ARGV`: tabela-pai, coluna FK) |
| `0011_referencias.sql` | `datas_base`, `insumos`, `insumo_precos`, `composicoes`, `composicao_itens`, `composicao_precos`, `sinapi_importacoes` + índices (GIN tsvector/trigram) + `fn_composicao_itens_valida` |
| `0012_referencias_rls.sql` | RLS das referências (§6.3, padrão "referências mistas") |
| `0013_sinapi_importacao.sql` | RPCs `fn_sinapi_*` |
| `0014_orcamento_tabelas.sql` | `orcamentos`, `orcamento_bdis`, `orcamento_etapas`, `orcamento_itens`, `orcamento_insumo_precos`, `orcamento_item_memorias` |
| `0015_orcamento_triggers.sql` | `fn_orcamento_itens_calc`, memória → quantidade, bloqueio por status, herança de org, `updated_at`, auditoria |
| `0016_encargos_mao_obra.sql` | `encargos_sociais`, `encargos_sociais_itens`, `orcamento_equipes`, `orcamento_equipe_membros` + triggers de totais |
| `0017_cronograma_medicoes.sql` | `cronogramas`, `cronograma_distribuicoes`, `medicoes`, `medicao_itens` + triggers |
| `0018_honorarios.sql` | `honorarios`, `honorario_disciplinas` + trigger de valor |
| `0019_orcamento_rls.sql` | RLS de todas as tabelas do orçamento (padrão de org) |
| `0020_rpc_custos.sql` | `fn_custo_insumo`, `fn_custo_composicao`, `fn_composicao_analitica`, `fn_buscar_referencias` |
| `0021_rpc_orcamento.sql` | `fn_orcamento_criar/recalcular/renumerar/duplicar/trocar_data_base/mover/adicionar_item/resumo` |
| `0022_rpc_abc_cronograma_medicao.sql` | curvas ABC, cronograma, medições, mão de obra, honorários, encargos, dashboard |

Requisitos específicos:
- Todas as regras de §8 **idênticas** a `src/lib/calc.ts` (arredondamento `round(x, 2)` por item,
  BDI coluna gerada, ABC pelo acumulado anterior, períodos do cronograma §8.9). Criar casos de
  teste SQL espelhando `src/lib/calc.test.ts`.
- `fn_custo_composicao` recursivo com proteção de profundidade (máx. 10) e cache por chamada
  (tabela temporária ou CTE recursiva) — orçamentos com 1.000+ itens devem recalcular em < 3 s.
- Importação: lotes de até 2000 linhas por chamada, upsert com `on conflict`, erros por linha
  acumulados em `sinapi_importacoes.erros` (máx. 500), nunca abortar o lote inteiro por uma linha.
- **Seed** (§10): somente dados `is_demo = true`, com aviso explícito; nenhum preço apresentado
  como oficial. Seed idempotente (`on conflict do nothing`).
- Grants: `grant execute` das RPCs para `authenticated`; RPCs `fn_sinapi_*` chamam `assert_admin()`.

### 2.4 Desenvolvimento em paralelo

B2 depende de objetos do B1. Até o B1 entregar, o B2 escreve contra o contrato (§2.2) e, para
testar localmente, pode criar um **stub não versionado** (ex.: `supabase/.temp/stub_core.sql`,
ignorado pelo git) com as tabelas/funções mínimas. Na integração, `supabase db reset` deve
rodar 0001→0029 + seed sem erro.

## 3. Frontend

### 3.1 Propriedade de arquivos

| Caminho | Dono |
|---|---|
| `src/components/ui/**` (design system) | **FRONTEND-1** |
| `src/components/layout/**`, `src/components/brand/**`, `src/components/auth/**` | FRONTEND-1 |
| `src/components/admin/**`, `src/components/clientes/**`, `src/components/organizacao/**` | FRONTEND-1 |
| `src/contexts/**` | FRONTEND-1 |
| `src/api/core/**` (hooks react-query do núcleo, inclusive **obras**) | FRONTEND-1 |
| `src/lib/sinapi/**` (parser do importador) | FRONTEND-1 |
| `src/lib/supabase.ts`, `src/lib/format.ts`, `src/lib/cn.ts`, `src/lib/queryClient.ts` | FRONTEND-1 |
| `src/schemas/core.ts` | FRONTEND-1 |
| `src/pages/auth/**`, `onboarding/**`, `clientes/**`, `organizacao/**`, `perfil/**`, `admin/**`, `NotFoundPage.tsx`, `_shared/**` | FRONTEND-1 |
| `src/App.tsx`, `src/main.tsx`, `src/routes.ts`, `src/styles/index.css`, `tailwind.config.ts`, `index.html` | FRONTEND-1 |
| `src/types/db-core.ts`, `src/types/sinapi-import.ts` | FRONTEND-1 |
| `src/components/orcamento/**`, `referencias/**`, `obras/**`, `honorarios/**`, `charts/**`, `relatorios/**`, `dashboard/**` | **FRONTEND-2** |
| `src/api/orcamento/**` | FRONTEND-2 |
| `src/hooks/orcamento/**` | FRONTEND-2 |
| `src/lib/calc.ts`, `src/lib/calc.test.ts` | FRONTEND-2 (espelho do SQL do B2) |
| `src/lib/export/**` (CSV/XLSX) | FRONTEND-2 |
| `src/schemas/orcamento.ts` | FRONTEND-2 |
| `src/pages/dashboard/**`, `obras/**`, `orcamentos/**`, `referencias/**`, `honorarios/**`, `relatorios/**` | FRONTEND-2 |
| `src/types/db-orcamento.ts` | FRONTEND-2 |
| `src/types/database.ts`, `src/types/helpers.ts`, `src/types/contrato.typecheck.ts`, `src/lib/labels.ts` | congelados (REVISOR) |
| `tsconfig*.json`, `vite.config.ts`, `eslint.config.js`, `postcss.config.js`, `.env.example` | FRONTEND-1 |
| `src/test/**` (setup do vitest) | TESTES (FRONTEND-1 até a fase de testes) |
| `public/**` (logos, favicon) | FRONTEND-1 |
| `package.json`, `package-lock.json` | ver §3.4 |

Observações:
- **Obras**: tabela do B1, telas do F2. Os hooks de obras (`useObras`, `useObra`, `useSalvarObra`,
  `useExcluirObra`) ficam em `src/api/core/obras.ts`, **escritos pelo FRONTEND-2** (exceção
  pontual: F2 é dono desse único arquivo). Chaves em `qkCore.obras/obra`.
- Tela de importação SINAPI (`pages/admin/AdminSinapi*`) é do F1, mas chama as RPCs do B2 com os
  tipos de `src/types/sinapi-import.ts`.
- Rótulos de enums novos: cada frontend cria `src/lib/labels-<dominio>.ts` no seu domínio em vez
  de editar `labels.ts`.

### 3.2 FRONTEND-1 — escopo

1. **Prioridade 1 (destrava o F2 — entregar primeiro)**: `Drawer`, `Combobox`, `DropdownMenu`,
   `Tooltip`, `Alert`, `Pagination`, `DateInput` em `src/components/ui/` e exportados no `index.ts`
   com as assinaturas de §4.
2. Refinar componentes existentes **sem quebrar a API** (props só aditivas e opcionais).
3. Autenticação: cadastro (nome, e-mail, senha ≥ 8, confirmação), recuperar/redefinir senha
   (`resetPasswordForEmail` com `redirectTo = ${origin}/redefinir-senha`), telas
   aguardando-aprovação/bloqueado (com botão sair e motivo), aceitar convite (`obter_convite` →
   `aceitar_convite`), onboarding com convites pendentes (`meus_convites`).
4. Sessão/organização: contextos já criados; adicionar seletor de organização refinado na
   Topbar, faixa `aviso_global` (configuração pública) e faixa de "dados de exemplo" quando a
   data-base mais recente for demo.
5. Admin: painel (estatísticas), usuários (aprovar/bloquear/papel global, busca, filtros,
   paginação), organizações (status, membros, adicionar membro), SINAPI (datas-base: publicar/
   arquivar; histórico de importações; **importador** com parser em `src/lib/sinapi/parser.ts`
   seguindo §9 da ARQUITETURA, pré-visualização, mapeamento de colunas, envio em lotes com
   progresso e relatório de erros), auditoria (filtros por período, usuário, entidade, ação;
   visualização do diff `dados_antes`/`dados_depois`), configurações (chaves de §5.2).
6. Perfil (nome, telefone, CREA/CAU, avatar no bucket `avatares`, troca de senha, tema).
7. Clientes (lista com busca/filtro, formulário PF/PJ com validação de CPF/CNPJ via
   `documentoValido`, detalhe com obras do cliente) e organização (dados, logo no bucket `logos`,
   padrões UF/regime; membros: listar, convidar, alterar papel, remover, revogar convite).
8. Testes de componentes do design system (`*.test.tsx` ao lado do componente).

### 3.3 FRONTEND-2 — escopo

1. Dashboard (`fn_dashboard_resumo`): KPIs com `Stat`, obras por status, últimos orçamentos,
   data-base vigente (com `DemoBadge` se demo).
2. Obras: lista, formulário (cliente, endereço, área, RT, status), detalhe com orçamentos e
   honorários.
3. Orçamento: criação (`fn_orcamento_criar` com escolha de data-base e preset de BDI TCU),
   **editor analítico** (planilha densa §5.1 do DESIGN: EAP com etapas/subetapas, adicionar item
   por busca SINAPI/próprias com `Combobox` + `fn_buscar_referencias`, item livre, edição inline,
   mover/reordenar com `fn_orcamento_mover`, recálculo com debounce, memória de cálculo em
   `Drawer` com `avaliarExpressao`, composição analítica em `Drawer`, cotações
   `orcamento_insumo_precos`), sintético, BDI (formulário TCU com faixas e alerta, BDIs
   diferenciados), dados/versões (`fn_orcamento_duplicar`, troca de data-base, status, encargos).
4. Referências: consulta SINAPI (busca, filtro por tipo, preço na data-base), detalhe de
   composição, composições próprias (editor com itens SINAPI/próprios e coeficientes, custo ao
   vivo com `custoComposicao`), insumos próprios, encargos sociais (tabelas globais somente
   leitura + cópia para a org com `fn_encargos_duplicar`, edição dos grupos A–D).
5. Cronograma físico-financeiro (grade etapa × período editável, `gerarPeriodos`,
   `fn_cronograma_salvar`, gráfico de barras + curva S acumulada com recharts).
6. Curva ABC (serviços e insumos, tabela + gráfico de Pareto, cores A/B/C do DESIGN §1.3).
7. Mão de obra (equipes/membros, custo-hora, horas de MO implícitas nas composições).
8. Medições (lista, criar, boletim com quantidades atuais e acumulados via `fn_medicao_resumo`,
   fechar/aprovar).
9. Honorários de projeto (proposta por obra, disciplinas, métodos, totais com `totalHonorarios`).
10. Relatórios: páginas de impressão A4 (`/imprimir/...`, §12) e exportação CSV/XLSX
    (`src/lib/export/`), botões na aba Relatórios e nas tabelas.

### 3.4 Dependências (package.json)

Dependências já instaladas cobrem o escopo. Se **indispensável** adicionar uma: instale com versão
exata (`npm install pacote@x.y.z`), registre em `CONTRATO_ALTERACOES.md` e, em conflito de
`package-lock.json`, resolva aceitando ambos os lados e rodando `npm install`. Proibido trocar
versões existentes.

### 3.5 Padrões obrigatórios de código (ambos)

- Importar UI **somente** de `@/components/ui` (barrel). Não criar botões/inputs "locais".
- Dados via hooks em `src/api/**` com react-query; nada de `supabase.from` dentro de páginas.
- Erros: `toast.error('Não foi possível salvar', mensagemErro(error))`.
- Números/datas: somente `src/lib/format.ts`; cálculo: somente `src/lib/calc.ts`.
- Links: somente `rotas.*` de `src/routes.ts`.
- Permissões de UI: `useOrganizacao().podeEditar` esconde/desabilita ações; `isOwner` para
  gestão de membros; `useAuth().isAdmin` para admin. A RLS é a proteção real.
- Formulários: react-hook-form + zod (`src/schemas/*`), mensagens pt-BR.
- Sem `any`; sem `// @ts-ignore` (usar `@ts-expect-error` com justificativa, se inevitável).
- Toda página nova: `PageHeader` + estados de carregamento (`LoadingBlock`/`Skeleton`), vazio
  (`EmptyState`) e erro.

## 4. Assinaturas dos componentes a criar (FRONTEND-1, prioridade 1)

```ts
// Drawer — painel lateral direito
interface DrawerProps { open: boolean; onClose: () => void; title?: ReactNode; description?: ReactNode;
  footer?: ReactNode; width?: number /* px, padrão 480 */; children?: ReactNode }

// Combobox — busca assíncrona com teclado (↑ ↓ Enter Esc)
interface ComboboxProps<T> { value: T | null; onChange: (item: T | null) => void;
  onSearch: (termo: string) => void; items: readonly T[]; loading?: boolean;
  getKey: (item: T) => string; renderItem: (item: T, ativo: boolean) => ReactNode;
  getLabel: (item: T) => string; placeholder?: string; emptyText?: string;
  debounceMs?: number /* 250 */; autoFocus?: boolean; size?: 'sm' | 'md' }

// DropdownMenu
interface DropdownMenuProps { trigger: ReactElement; align?: 'start' | 'end';
  items: readonly ({ label: ReactNode; icon?: ReactNode; onSelect: () => void; danger?: boolean;
  disabled?: boolean } | 'separator')[] }

// Tooltip
interface TooltipProps { content: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; children: ReactElement }

// Alert — faixa inline
interface AlertProps { variant?: 'info' | 'success' | 'warning' | 'danger' | 'demo'; title?: ReactNode;
  children?: ReactNode; action?: ReactNode; className?: string }

// Pagination
interface PaginationProps { page: number /* 1-based */; pageSize: number; total: number; onChange: (page: number) => void }

// DateInput — valor ISO 'YYYY-MM-DD'
interface DateInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> { value: string | null; onChange: (v: string | null) => void }

// FileDrop
interface FileDropProps { accept?: string; onFile: (file: File) => void; hint?: ReactNode; disabled?: boolean }

// Progress
interface ProgressProps { value: number /* 0–100 */; label?: ReactNode }
```

## 5. Fases seguintes

**TESTES**: `src/**/*.test.ts(x)` (vitest + Testing Library) para cálculos, parser SINAPI,
formulários e componentes; `supabase/tests/**` (SQL/pgTAP) para RLS por papel (admin, owner,
editor, viewer, pending, blocked, não-membro) e paridade cálculo SQL × `calc.ts`. Correções de
schema em `0030`–`0039`.

**REVISOR**: verifica aderência a ARQUITETURA/DESIGN/esta divisão, segurança (RLS, `security
definer`, grants), consistência de tipos (`src/types` × migrações), acessibilidade e aplica
`CONTRATO_ALTERACOES.md` aos documentos.

## 6. Mudanças de contrato

`docs/CONTRATO_ALTERACOES.md` é **append-only**: cada agente acrescenta entradas no formato

```
## AAAA-MM-DD — <AGENTE> — <título curto>
- O quê: …
- Por quê: …
- Impacto: arquivos/agentes afetados …
- Status: proposto | aplicado (por quem)
```

Commits: cada agente commita apenas os arquivos que possui, mensagem em português no formato
`<area>: <descrição>` (ex.: `backend-2: tabelas de orçamento e RLS`).

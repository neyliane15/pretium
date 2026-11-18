# Pretium — Arquitetura

> Documento-contrato. Backend e frontend seguem **à risca** os nomes de tabelas, colunas, enums e
> assinaturas de RPC definidos aqui. Qualquer desvio precisa ser registrado em
> `docs/CONTRATO_ALTERACOES.md` (ver `docs/DIVISAO_TRABALHO.md` §6) **e** refletido em `src/types/`.

Sumário

1. Visão geral
2. Módulos
3. Fluxo de dados e camadas
4. Convenções
5. Modelo de dados completo
6. Papéis e matriz de permissões (RLS)
7. Funções RPC (assinaturas exatas)
8. Regras de cálculo
9. Importação SINAPI (formato da planilha)
10. Dados de demonstração
11. Storage
12. Relatórios e exportação

---

## 1. Visão geral

Pretium é um SPA (Vite + React 18 + TypeScript strict) que conversa **diretamente** com o Supabase
(PostgREST + RPC + Auth + Storage) via `@supabase/supabase-js` v2. Não há servidor de aplicação
próprio: toda regra de autorização mora no Postgres (RLS + funções `security definer`), e toda regra
de cálculo existe em **dois lugares idênticos**:

- `supabase/migrations/*` — funções SQL que **persistem** valores (snapshots de custo, totais,
  curva ABC, cronograma). São a fonte de verdade dos valores gravados e impressos.
- `src/lib/calc.ts` — funções puras TypeScript que reproduzem as mesmas regras para **feedback
  instantâneo** no editor (antes do round-trip). Testadas com vitest contra os mesmos casos.

```
┌──────────────────────────── Navegador ────────────────────────────┐
│ React Router ─ páginas (src/pages)                                │
│   │                                                               │
│   ├─ componentes (src/components/ui | layout | orcamento …)      │
│   ├─ hooks de dados (src/api/**  → @tanstack/react-query)         │
│   ├─ cálculo instantâneo (src/lib/calc.ts)                        │
│   └─ import/export XLSX/CSV (src/lib/sinapi, src/lib/export)      │
└──────────────┬────────────────────────────────────────────────────┘
               │ supabase-js (JWT do usuário)
┌──────────────▼──────────────────── Supabase ──────────────────────┐
│ Auth (e-mail/senha, recuperação) → trigger handle_new_user        │
│ PostgREST: tabelas com RLS │ RPC: funções SQL (security definer   │
│ só onde necessário, sempre checando permissão internamente)       │
│ Storage: buckets logos, avatares, sinapi-arquivos                 │
└───────────────────────────────────────────────────────────────────┘
```

## 2. Módulos

| Módulo | Descrição | Backend | Frontend |
|---|---|---|---|
| Autenticação | login, cadastro, recuperação, aprovação, bloqueio | B1 | F1 |
| Organizações | escritórios, membros, convites, papéis, dados/logo | B1 | F1 |
| Administração | usuários, aprovações, bloqueio, papéis, orgs, auditoria, configurações | B1 | F1 |
| Importação SINAPI | carga das tabelas mensais oficiais (Caixa) | B2 | F1 (tela admin) |
| Clientes | cadastro PF/PJ | B1 | F1 |
| Obras/Projetos | obras com endereço, área, RT, status | B1 | F2 |
| Referências | consulta SINAPI, insumos e composições próprias | B2 | F2 |
| Orçamento | analítico/sintético, EAP, itens, BDI, memória de cálculo, versões | B2 | F2 |
| Encargos sociais | tabelas de encargos (horista/mensalista) | B2 | F2 |
| Mão de obra | equipes, horas, custo | B2 | F2 |
| Cronograma | físico-financeiro por etapa e período | B2 | F2 |
| Curva ABC | de serviços e de insumos | B2 | F2 |
| Medições | boletins de medição acumulados | B2 | F2 |
| Honorários de projeto | disciplinas, métodos de cálculo | B2 | F2 |
| Relatórios | impressão/PDF, CSV, XLSX | — | F2 |
| Dashboard | KPIs da organização | B2 (RPC) | F2 |

## 3. Fluxo de dados e camadas

### 3.1 Frontend

- **Leitura**: hooks em `src/api/<dominio>/*.ts` usando react-query. Chaves de query padronizadas
  em `src/api/keys.ts` (`qk.orcamento(id)`, `qk.itens(orcamentoId)` …). Nunca chamar
  `supabase.from()` diretamente dentro de componentes de página.
- **Escrita**: `useMutation` + invalidação das chaves afetadas. Após alterar itens/BDI/data-base
  chamar `rpc('fn_orcamento_recalcular')` (o editor faz isso com *debounce* de 600 ms) e
  invalidar `qk.orcamento(id)` e `qk.itens(id)`.
- **Organização ativa**: `useOrganizacao()` (F1) expõe `{ organizacao, papel, podeEditar, isAdmin }`.
  Toda query de dados de organização filtra por `organizacao_id = organizacao.id` (a RLS garante a
  segurança; o filtro evita misturar dados de várias orgs que o usuário participa).
- **Validação**: esquemas zod em `src/schemas/*` (um arquivo por domínio), usados por
  react-hook-form via `@hookform/resolvers/zod`.
- **Números**: o banco devolve `numeric` como `number` JSON. Exibição sempre via `src/lib/format.ts`.
  Entrada numérica com vírgula decimal via `parseNumeroBR()`.

### 3.2 Backend

- Tabelas em `public`. Toda tabela de dados de organização tem `organizacao_id uuid not null`
  (inclusive tabelas-filhas, desnormalizado e preenchido por trigger) → RLS simples e indexável.
- Escritas complexas (multi-tabela, validação de papel, cálculo) via RPC. CRUD simples direto em
  tabela, protegido por RLS.
- Funções `security definer` sempre com `set search_path = public` e checagem explícita de
  permissão no corpo (`perform assert_pode_editar(org)` etc.).
- Auditoria por trigger genérico `fn_auditoria_trigger()` nas tabelas relevantes.

## 4. Convenções

- Identificadores SQL em português, `snake_case`, sem acento. Tabelas no plural.
- PK `id uuid primary key default gen_random_uuid()` (exceto tabelas de junção e logs).
- `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
  com trigger `set_updated_at()`.
- `created_by uuid references auth.users(id) on delete set null default auth.uid()`.
- Valores monetários: `numeric(16,2)` para totais, `numeric(14,2)` para preços unitários
  orçados, `numeric(14,4)` para preços de referência de insumo (SINAPI publica 2 casas; 4 casas dão
  margem a cotações). Coeficientes: `numeric(18,7)`. Quantidades: `numeric(18,4)`. Percentuais:
  `numeric(9,4)` **em pontos percentuais** (22,12% → `22.1200`).
- Texto livre `text`; e-mail `citext`; UF `char(2)` com check `~ '^[A-Z]{2}$'`.
- Enums Postgres para domínios fechados (lista em §5.1). No TS, os mesmos literais.
- Nomes de FK: padrão do Postgres `<tabela>_<coluna>_fkey` (o supabase-js usa esses nomes nos
  tipos de `Relationships`). Exceção: `organizacao_membros.user_id` tem **duas** FKs —
  `organizacao_membros_user_id_fkey` → `auth.users(id)` e
  `organizacao_membros_user_id_profiles_fkey` → `profiles(id)` (para o embed `profiles(*)`).
- Migrações: `supabase/migrations/NNNN_descricao.sql`, idempotência não é exigida (rodam uma vez),
  mas cada arquivo deve rodar limpo sobre os anteriores. Numeração em `DIVISAO_TRABALHO.md`.

## 5. Modelo de dados completo

Extensões (B1, `0001`): `pgcrypto`, `citext`, `pg_trgm`, `unaccent`.

### 5.1 Enums

| Enum | Valores | Dono |
|---|---|---|
| `app_role` | `admin`, `user` | B1 |
| `user_status` | `pending`, `active`, `blocked` | B1 |
| `org_role` | `owner`, `editor`, `viewer` | B1 |
| `org_status` | `ativa`, `bloqueada` | B1 |
| `invite_status` | `pending`, `accepted`, `revoked`, `expired` | B1 |
| `pessoa_tipo` | `PF`, `PJ` | B1 |
| `obra_status` | `planejamento`, `orcamento`, `em_execucao`, `paralisada`, `concluida`, `cancelada` | B1 |
| `regime_desoneracao` | `nao_desonerado`, `desonerado` | B1 (usado por B2; criado em 0001 porque `organizacoes.regime_padrao` usa) |
| `fonte_referencia` | `sinapi`, `propria` | B2 |
| `insumo_tipo` | `material`, `mao_de_obra`, `equipamento`, `servico`, `taxa`, `outro` | B2 |
| `data_base_status` | `rascunho`, `publicada`, `arquivada` | B2 |
| `importacao_tipo` | `insumos`, `composicoes`, `analitico` | B2 |
| `importacao_status` | `pendente`, `processando`, `concluida`, `erro`, `cancelada` | B2 |
| `orcamento_status` | `rascunho`, `em_revisao`, `aprovado`, `arquivado` | B2 |
| `item_referencia_tipo` | `composicao`, `insumo`, `livre` | B2 |
| `composicao_item_tipo` | `insumo`, `composicao` | B2 |
| `cronograma_periodicidade` | `semanal`, `quinzenal`, `mensal` | B2 |
| `medicao_status` | `aberta`, `fechada`, `aprovada` | B2 |
| `encargo_grupo` | `A`, `B`, `C`, `D` | B2 |
| `honorario_metodo` | `area`, `percentual_obra`, `horas`, `fixo` | B2 |
| `disciplina_projeto` | `arquitetonico`, `interiores`, `paisagismo`, `estrutural`, `fundacoes`, `hidrossanitario`, `eletrico`, `spda`, `cabeamento`, `climatizacao`, `incendio`, `gas`, `luminotecnico`, `orcamento`, `coordenacao`, `aprovacao_legal`, `outro` | B2 |
| `honorario_status` | `rascunho`, `enviado`, `aprovado`, `recusado` | B2 |

### 5.2 Núcleo (BACKEND-1)

#### `profiles`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | FK `auth.users(id)` on delete cascade |
| email | citext not null unique | copiado de auth.users |
| nome | text not null default '' | |
| telefone | text null | |
| crea_cau | text null | registro profissional |
| avatar_path | text null | caminho no bucket `avatares` |
| papel_global | app_role not null default 'user' | só admin altera (trigger `fn_profiles_protege_campos`) |
| status | user_status not null default 'pending' | só admin altera |
| motivo_bloqueio | text null | |
| organizacao_ativa_id | uuid null FK organizacoes(id) on delete set null | |
| tema | text not null default 'system' check in ('light','dark','system') | |
| ultimo_acesso_em | timestamptz null | |
| aprovado_por | uuid null FK auth.users | |
| aprovado_em | timestamptz null | |
| created_at, updated_at | timestamptz | |

Índices: `(status)`, `(papel_global)`.

#### `configuracoes` (chave-valor global)
| coluna | tipo | regras |
|---|---|---|
| chave | text PK | |
| valor | jsonb not null | |
| descricao | text null | |
| publica | boolean not null default false | se `true`, visível a qualquer usuário autenticado |
| updated_by | uuid null FK auth.users | |
| updated_at | timestamptz | |

Linhas inseridas pela migração B1 (valores padrão):

| chave | valor padrão | publica |
|---|---|---|
| `admin_emails` | `[]` (array de e-mails que viram admin ao se cadastrar) | false |
| `aprovacao_obrigatoria` | `true` (novos usuários entram `pending`) | true |
| `cadastro_aberto` | `true` | true |
| `uf_padrao` | `"RJ"` | true |
| `aviso_global` | `null` (string exibida em faixa no topo) | true |
| `convite_validade_dias` | `7` | false |

#### `organizacoes`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| nome | text not null | nome curto/fantasia |
| razao_social | text null | |
| cnpj | text null | só dígitos, check `~ '^\d{14}$'` |
| email | citext null | |
| telefone | text null | |
| site | text null | |
| cep, logradouro, numero, complemento, bairro, municipio | text null | |
| uf | char(2) null | |
| logo_path | text null | bucket `logos`, `"{organizacao_id}/logo.{ext}"` |
| uf_padrao | char(2) not null default 'RJ' | |
| regime_padrao | regime_desoneracao not null default 'nao_desonerado' | |
| responsavel_tecnico | text null | |
| crea_cau | text null | |
| status | org_status not null default 'ativa' | só admin altera |
| created_by | uuid | |
| created_at, updated_at | timestamptz | |

#### `organizacao_membros`
| coluna | tipo | regras |
|---|---|---|
| organizacao_id | uuid FK organizacoes on delete cascade | PK composta |
| user_id | uuid FK auth.users on delete cascade (e FK `profiles(id)` p/ join) | PK composta |
| papel | org_role not null default 'viewer' | |
| convidado_por | uuid null | |
| created_at | timestamptz | |

Índices: `(user_id)`. Invariante: toda organização tem ≥ 1 `owner` (garantido nas RPCs).

#### `convites`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid FK on delete cascade | |
| email | citext not null | |
| papel | org_role not null default 'editor' | |
| token | uuid not null unique default gen_random_uuid() | link `/convite/:token` |
| status | invite_status not null default 'pending' | |
| convidado_por | uuid FK auth.users | |
| expira_em | timestamptz not null default now() + 7 days | |
| aceito_por | uuid null | |
| aceito_em | timestamptz null | |
| created_at | timestamptz | |

Único parcial: `(organizacao_id, email) where status = 'pending'`.

#### `auditoria_logs`
| coluna | tipo | regras |
|---|---|---|
| id | bigint generated always as identity PK | |
| created_at | timestamptz not null default now() | |
| user_id | uuid null | `auth.uid()` |
| user_email | citext null | snapshot |
| organizacao_id | uuid null | extraído de `new/old.organizacao_id` quando existir |
| acao | text not null | `insert`, `update`, `delete`, `login`, `aprovar_usuario`, `bloquear_usuario`, `alterar_papel`, `importar_sinapi`, `config`, … |
| entidade | text not null | nome da tabela ou domínio |
| entidade_id | text null | |
| dados_antes | jsonb null | |
| dados_depois | jsonb null | |
| detalhes | jsonb null | |

Índices: `(created_at desc)`, `(organizacao_id, created_at desc)`, `(entidade, entidade_id)`, `(user_id)`.
Sem UPDATE/DELETE para ninguém (nem admin, via RLS); inserção só por funções `security definer`.

#### `clientes`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid not null FK on delete cascade | |
| tipo | pessoa_tipo not null default 'PJ' | |
| nome | text not null | nome ou razão social |
| nome_fantasia | text null | |
| documento | text null | CPF (11) ou CNPJ (14), só dígitos |
| inscricao_estadual | text null | |
| email | citext null | |
| telefone | text null | |
| contato_nome | text null | |
| cep, logradouro, numero, complemento, bairro, municipio | text null | |
| uf | char(2) null | |
| observacoes | text null | |
| ativo | boolean not null default true | |
| created_by, created_at, updated_at | | |

Índices: `(organizacao_id, nome)`, trigram em `nome`. Único parcial `(organizacao_id, documento) where documento is not null`.

#### `obras`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid not null FK on delete cascade | |
| cliente_id | uuid null FK clientes on delete set null | |
| codigo | text null | código interno (ex. `OB-2026-014`) |
| nome | text not null | |
| descricao | text null | |
| tipo_obra | text null | livre: "Residencial unifamiliar", "Reforma comercial"… |
| status | obra_status not null default 'planejamento' | |
| cep, logradouro, numero, complemento, bairro, municipio | text null | |
| uf | char(2) not null default 'RJ' | |
| area_construida_m2 | numeric(14,2) null | |
| area_terreno_m2 | numeric(14,2) null | |
| data_inicio_prevista | date null | |
| data_fim_prevista | date null | |
| responsavel_tecnico | text null | |
| crea_cau | text null | |
| art_rrt | text null | |
| observacoes | text null | |
| created_by, created_at, updated_at | | |

Índices: `(organizacao_id, status)`, `(cliente_id)`, trigram em `nome`. Único parcial `(organizacao_id, codigo) where codigo is not null`.

### 5.3 Referências SINAPI e próprias (BACKEND-2)

Princípio: **insumos e composições SINAPI e próprios vivem nas mesmas tabelas**.
`organizacao_id is null` ⇔ `fonte = 'sinapi'` (catálogo global, só admin escreve);
`organizacao_id is not null` ⇔ `fonte = 'propria'` (check constraint).

#### `datas_base`
Uma "data-base" = conjunto de preços de uma UF, mês/ano e regime.
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| uf | char(2) not null | |
| ano | smallint not null | check 2000..2100 |
| mes | smallint not null | check 1..12 |
| regime | regime_desoneracao not null | |
| status | data_base_status not null default 'rascunho' | só `publicada` aparece para usuários comuns |
| is_demo | boolean not null default false | **true = dados de exemplo, não oficiais** |
| descricao | text null | ex. "SINAPI RJ 09/2026 – Não desonerado" |
| fonte_arquivo | text null | nome do(s) arquivo(s) de origem |
| publicada_em | timestamptz null | |
| created_by, created_at, updated_at | | |

Único `(uf, ano, mes, regime, is_demo)`. Índice `(uf, regime, ano desc, mes desc)`.

#### `insumos`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid null FK organizacoes on delete cascade | null = SINAPI |
| fonte | fonte_referencia not null | |
| codigo | text not null | SINAPI: código numérico como texto ("00370"→ normalizado sem zeros à esquerda: "370") |
| descricao | text not null | |
| unidade | text not null | normalizada maiúscula ("M3", "KG", "H", "UN") |
| tipo | insumo_tipo not null default 'material' | |
| classificacao | text null | grupo/classe SINAPI |
| preco_proprio | numeric(14,4) null | só para `fonte='propria'` |
| preco_proprio_data | date null | |
| is_demo | boolean not null default false | |
| ativo | boolean not null default true | |
| busca | tsvector generated always as (to_tsvector('portuguese', f_unaccent(codigo || ' ' || descricao))) stored | |
| created_by, created_at, updated_at | | |

Únicos parciais: `(codigo) where organizacao_id is null`; `(organizacao_id, codigo) where organizacao_id is not null`.
Índices: GIN `(busca)`, GIN trigram `(f_unaccent(descricao) gin_trgm_ops)`, `(organizacao_id)`.
`f_unaccent(text)` = wrapper `immutable` de `unaccent` (criado por B2 em 0010).

#### `insumo_precos`
| coluna | tipo | regras |
|---|---|---|
| data_base_id | uuid FK datas_base on delete cascade | PK composta |
| insumo_id | uuid FK insumos on delete cascade | PK composta |
| preco | numeric(14,4) not null check ≥ 0 | |
| origem_preco | text null | SINAPI: `C` (coletado), `CR` (coef. representatividade), `AS` (atribuído SP) |
| importacao_id | uuid null FK sinapi_importacoes on delete set null | |

Índice `(insumo_id)`.

#### `composicoes`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid null FK on delete cascade | null = SINAPI |
| fonte | fonte_referencia not null | |
| codigo | text not null | |
| descricao | text not null | |
| unidade | text not null | |
| grupo | text null | classe/tipo SINAPI ("ALVENARIA DE VEDAÇÃO") |
| observacao | text null | |
| is_demo | boolean not null default false | |
| ativo | boolean not null default true | |
| busca | tsvector generated (igual a insumos) | |
| created_by, created_at, updated_at | | |

Únicos e índices análogos a `insumos`.

#### `composicao_itens`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| composicao_id | uuid not null FK composicoes on delete cascade | |
| organizacao_id | uuid null | = `composicoes.organizacao_id` (trigger) |
| tipo_item | composicao_item_tipo not null | |
| insumo_id | uuid null FK insumos on delete restrict | |
| subcomposicao_id | uuid null FK composicoes on delete restrict | |
| coeficiente | numeric(18,7) not null check > 0 | |
| ordem | integer not null default 0 | |
| importacao_id | uuid null FK sinapi_importacoes on delete set null | |

Checks: exatamente um de `insumo_id`/`subcomposicao_id` conforme `tipo_item`; `subcomposicao_id <> composicao_id`.
Trigger `fn_composicao_itens_valida` (B2): impede ciclo (busca recursiva), impede composição SINAPI
referenciar item próprio, e item próprio referenciar item próprio de **outra** organização.
Único `(composicao_id, tipo_item, coalesce(insumo_id, subcomposicao_id))`.

#### `composicao_precos` (custo oficial publicado pela Caixa)
| coluna | tipo | regras |
|---|---|---|
| data_base_id | uuid FK on delete cascade | PK composta |
| composicao_id | uuid FK on delete cascade | PK composta |
| custo | numeric(14,4) not null | custo unitário total publicado |
| custo_mao_obra | numeric(14,4) null | |
| custo_material | numeric(14,4) null | |
| custo_equipamento | numeric(14,4) null | |
| custo_servicos | numeric(14,4) null | serviços terceiros/outros |
| perc_mao_obra | numeric(9,4) null | |
| importacao_id | uuid null | |

#### `sinapi_importacoes`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| data_base_id | uuid not null FK datas_base on delete cascade | |
| tipo | importacao_tipo not null | |
| status | importacao_status not null default 'pendente' | |
| arquivo_nome | text null | |
| arquivo_path | text null | bucket `sinapi-arquivos` (opcional) |
| total_linhas | integer not null default 0 | acumulado pelos lotes |
| linhas_ok | integer not null default 0 | |
| linhas_erro | integer not null default 0 | |
| erros | jsonb not null default '[]' | até 500 `{linha, codigo, mensagem}` |
| iniciado_em | timestamptz not null default now() | |
| finalizado_em | timestamptz null | |
| created_by | uuid | |

### 5.4 Orçamento (BACKEND-2)

Todas as tabelas abaixo têm `organizacao_id uuid not null` (copiado do pai por trigger
`fn_herda_organizacao()` e validado: o pai precisa ter a mesma organização).

#### `orcamentos`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid not null FK organizacoes on delete cascade | |
| obra_id | uuid not null FK obras on delete cascade | |
| codigo | text null | "ORC-2026-031" |
| nome | text not null | |
| descricao | text null | |
| versao | integer not null default 1 | |
| orcamento_origem_id | uuid null FK orcamentos on delete set null | versão de onde foi duplicado |
| status | orcamento_status not null default 'rascunho' | |
| data_base_id | uuid not null FK datas_base on delete restrict | define UF, mês/ano e regime |
| encargos_sociais_id | uuid null FK encargos_sociais on delete set null | |
| data_orcamento | date not null default current_date | |
| validade_dias | integer not null default 30 | |
| total_sem_bdi | numeric(16,2) not null default 0 | snapshot (fn_orcamento_recalcular) |
| total_bdi | numeric(16,2) not null default 0 | = total − total_sem_bdi |
| total | numeric(16,2) not null default 0 | com BDI |
| itens_sem_preco | integer not null default 0 | itens com custo 0 / referência sem preço |
| recalculado_em | timestamptz null | |
| observacoes | text null | texto livre p/ relatório |
| created_by, created_at, updated_at | | |

Índices: `(organizacao_id, updated_at desc)`, `(obra_id)`. Status `aprovado`/`arquivado` ⇒ itens
somente leitura (trigger em itens/etapas bloqueia alteração, exceto admin).

#### `orcamento_bdis`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid not null | |
| orcamento_id | uuid not null FK on delete cascade | |
| nome | text not null default 'BDI Serviços' | |
| is_padrao | boolean not null default false | único parcial `(orcamento_id) where is_padrao` |
| ac | numeric(9,4) not null default 0 | Administração central (%) |
| s | numeric(9,4) not null default 0 | Seguros (%) |
| r | numeric(9,4) not null default 0 | Riscos (%) |
| g | numeric(9,4) not null default 0 | Garantias (%) |
| df | numeric(9,4) not null default 0 | Despesas financeiras (%) |
| l | numeric(9,4) not null default 0 | Lucro (%) |
| pis | numeric(9,4) not null default 0.65 | |
| cofins | numeric(9,4) not null default 3.00 | |
| iss | numeric(9,4) not null default 0 | alíquota efetiva sobre o preço |
| cprb | numeric(9,4) not null default 0 | só desonerado (configurável) |
| i_total | numeric(9,4) generated always as (pis + cofins + iss + cprb) stored | |
| bdi | numeric(9,4) generated always as (round(((((1 + (ac+s+r+g)/100) * (1 + df/100) * (1 + l/100)) / (1 - (pis+cofins+iss+cprb)/100)) - 1) * 100, 2)) stored | **regra §8.1** |
| created_at, updated_at | | |

Check: `pis+cofins+iss+cprb < 100`. Toda criação de orçamento cria um BDI padrão (RPC
`fn_orcamento_criar`).

#### `orcamento_etapas` (EAP)
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid not null | |
| orcamento_id | uuid not null FK on delete cascade | |
| parent_id | uuid null FK orcamento_etapas on delete cascade | null = etapa de 1º nível |
| ordem | integer not null default 0 | ordem entre irmãos |
| codigo | text not null default '' | "1", "1.2" — mantido por `fn_orcamento_renumerar` |
| nome | text not null | |
| total_sem_bdi | numeric(16,2) not null default 0 | snapshot (inclui subetapas) |
| total | numeric(16,2) not null default 0 | snapshot com BDI |
| created_at, updated_at | | |

Profundidade máxima 3 níveis (check no trigger). Índice `(orcamento_id, parent_id, ordem)`.

#### `orcamento_itens`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid not null | |
| orcamento_id | uuid not null FK on delete cascade | |
| etapa_id | uuid not null FK orcamento_etapas on delete cascade | |
| ordem | integer not null default 0 | |
| codigo | text not null default '' | número do item "1.2.3" (renumerar) |
| referencia_tipo | item_referencia_tipo not null | |
| composicao_id | uuid null FK composicoes on delete restrict | |
| insumo_id | uuid null FK insumos on delete restrict | |
| fonte | text not null default 'SINAPI' | rótulo exibido: "SINAPI", "PRÓPRIA", "COTAÇÃO" |
| referencia_codigo | text null | snapshot do código da referência |
| descricao | text not null | snapshot editável |
| unidade | text not null | |
| quantidade | numeric(18,4) not null default 0 check ≥ 0 | |
| usa_memoria | boolean not null default false | se true, quantidade = Σ memórias (trigger) |
| custo_unitario | numeric(14,2) not null default 0 | sem BDI; snapshot de `fn_custo_*` |
| custo_manual | boolean not null default false | se true, recálculo não sobrescreve custo |
| bdi_id | uuid null FK orcamento_bdis on delete set null | null = BDI padrão |
| bdi_percentual | numeric(9,4) not null default 0 | snapshot do BDI aplicado |
| preco_unitario | numeric(14,2) not null default 0 | **trigger**: round(custo × (1+bdi/100), 2) |
| total_sem_bdi | numeric(16,2) not null default 0 | **trigger**: round(qtd × custo, 2) |
| total | numeric(16,2) not null default 0 | **trigger**: round(qtd × preço, 2) |
| sem_preco | boolean not null default false | referência sem preço na data-base |
| observacao | text null | |
| created_at, updated_at | | |

Checks: `referencia_tipo='composicao' ⇒ composicao_id not null and insumo_id null`;
`'insumo' ⇒ insumo_id not null and composicao_id null`; `'livre' ⇒ ambos null`.
Trigger BEFORE INSERT/UPDATE `fn_orcamento_itens_calc` calcula `preco_unitario`, `total_sem_bdi`,
`total` a partir de `custo_unitario`, `quantidade`, `bdi_percentual` (regras §8.3).
Índices: `(orcamento_id, etapa_id, ordem)`, `(composicao_id)`, `(insumo_id)`.

#### `orcamento_insumo_precos` (cotação/ajuste de preço de insumo no orçamento)
| coluna | tipo | regras |
|---|---|---|
| orcamento_id | uuid FK on delete cascade | PK composta |
| insumo_id | uuid FK on delete cascade | PK composta |
| organizacao_id | uuid not null | |
| preco | numeric(14,4) not null check ≥ 0 | sobrepõe o preço da data-base em TODAS as composições do orçamento |
| fonte | text null | "Cotação Loja X 12/11/2026" |
| updated_at | timestamptz | |

#### `orcamento_item_memorias` (memória de cálculo de quantitativos)
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid not null | |
| item_id | uuid not null FK orcamento_itens on delete cascade | |
| ordem | integer not null default 0 | |
| descricao | text not null default '' | "Parede eixo A – térreo" |
| expressao | text not null | expressão aritmética pt-BR, ex. `2*(3,50+4,20)*2,80 - 1,20*2,10` |
| resultado | numeric(18,4) not null default 0 | avaliado no front (`avaliarExpressao`) e gravado |
| created_at, updated_at | | |

Trigger AFTER INSERT/UPDATE/DELETE: se o item tem `usa_memoria`, `quantidade = round(Σ resultado, 4)`.
A expressão é validada no front; o banco apenas confia em `resultado` (texto é documental).

#### `cronogramas`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid not null | |
| orcamento_id | uuid not null unique FK on delete cascade | 1:1 |
| data_inicio | date not null | |
| periodicidade | cronograma_periodicidade not null default 'mensal' | |
| num_periodos | smallint not null check 1..120 | |
| created_at, updated_at | | |

#### `cronograma_distribuicoes`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid not null | |
| cronograma_id | uuid not null FK on delete cascade | |
| etapa_id | uuid not null FK orcamento_etapas on delete cascade | só etapas de 1º nível |
| periodo | smallint not null check ≥ 1 | 1..num_periodos |
| percentual | numeric(9,4) not null check 0..100 | % físico da etapa no período |

Único `(cronograma_id, etapa_id, periodo)`. Trigger: Σ percentual por etapa ≤ 100,0001.

#### `medicoes`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid not null | |
| orcamento_id | uuid not null FK on delete cascade | |
| numero | integer not null | sequencial por orçamento (único) |
| periodo_inicio | date not null | |
| periodo_fim | date not null | check ≥ inicio |
| data_medicao | date not null default current_date | |
| status | medicao_status not null default 'aberta' | `fechada/aprovada` ⇒ itens só leitura |
| observacoes | text null | |
| total | numeric(16,2) not null default 0 | snapshot Σ medicao_itens.valor |
| created_by, created_at, updated_at | | |

#### `medicao_itens`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid not null | |
| medicao_id | uuid not null FK on delete cascade | |
| item_id | uuid not null FK orcamento_itens on delete cascade | |
| quantidade | numeric(18,4) not null default 0 check ≥ 0 | medida no período |
| valor | numeric(16,2) not null default 0 | trigger: round(qtd × item.preco_unitario, 2) |
| observacao | text null | |

Único `(medicao_id, item_id)`. Trigger valida: acumulado (todas as medições) ≤ quantidade orçada × 1,0 (permitir excesso só com flag futura — por ora bloquear com erro `P0001 'Quantidade medida excede o orçado'`).

#### `encargos_sociais`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid null FK on delete cascade | null = tabela de referência global (admin) |
| nome | text not null | "SINAPI RJ – Não desonerado – 2026" |
| uf | char(2) null | |
| regime | regime_desoneracao not null | |
| vigencia | date null | |
| is_demo | boolean not null default false | |
| total_horista | numeric(9,4) not null default 0 | trigger = Σ itens.horista |
| total_mensalista | numeric(9,4) not null default 0 | trigger = Σ itens.mensalista |
| created_by, created_at, updated_at | | |

#### `encargos_sociais_itens`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| encargos_sociais_id | uuid not null FK on delete cascade | |
| organizacao_id | uuid null | herdado |
| grupo | encargo_grupo not null | |
| codigo | text not null | "A1", "B3", "D1" |
| descricao | text not null | "INSS", "FGTS", "Férias"… |
| horista | numeric(9,4) not null default 0 | % |
| mensalista | numeric(9,4) not null default 0 | % |
| ordem | integer not null default 0 | |

Único `(encargos_sociais_id, codigo)`.

#### `orcamento_equipes` / `orcamento_equipe_membros` (mão de obra)
`orcamento_equipes`: `id`, `organizacao_id`, `orcamento_id` FK cascade, `nome text not null`,
`descricao text null`, `ordem int`, `created_at`, `updated_at`.

`orcamento_equipe_membros`:
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid not null | |
| equipe_id | uuid not null FK on delete cascade | |
| funcao | text not null | "Pedreiro", "Servente" |
| insumo_id | uuid null FK insumos on delete set null | insumo SINAPI de MO (preço/h já com encargos) |
| salario_hora | numeric(14,4) null | usado se `insumo_id` nulo (sem encargos) |
| aplicar_encargos | boolean not null default true | aplica `encargos_sociais.total_horista` do orçamento sobre `salario_hora` |
| quantidade | numeric(10,2) not null default 1 | nº de profissionais |
| horas_dia | numeric(6,2) not null default 8 | |
| dias | numeric(8,2) not null default 0 | dias trabalhados |
| ordem | integer not null default 0 | |

Regra de custo: §8.6.

#### `honorarios` / `honorario_disciplinas` (projeto)
`honorarios`:
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid not null FK cascade | |
| obra_id | uuid not null FK obras on delete cascade | |
| orcamento_id | uuid null FK orcamentos on delete set null | base p/ método `percentual_obra` |
| nome | text not null | "Proposta de projeto – Residência Silva" |
| status | honorario_status not null default 'rascunho' | |
| area_m2 | numeric(14,2) null | área de projeto (padrão p/ disciplinas) |
| impostos_percentual | numeric(9,4) not null default 0 | aplicado "por dentro" (§8.7) |
| desconto_percentual | numeric(9,4) not null default 0 | |
| subtotal | numeric(16,2) not null default 0 | snapshot Σ disciplinas |
| total | numeric(16,2) not null default 0 | snapshot |
| validade_dias | integer not null default 30 | |
| condicoes_pagamento | text null | |
| observacoes | text null | |
| created_by, created_at, updated_at | | |

`honorario_disciplinas`:
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| organizacao_id | uuid not null | |
| honorario_id | uuid not null FK cascade | |
| disciplina | disciplina_projeto not null | |
| descricao | text null | |
| metodo | honorario_metodo not null | |
| area_m2 | numeric(14,2) null | método `area` |
| valor_m2 | numeric(14,2) null | método `area` |
| valor_obra | numeric(16,2) null | método `percentual_obra` (se nulo usa `orcamentos.total`) |
| percentual | numeric(9,4) null | método `percentual_obra` |
| horas | numeric(10,2) null | método `horas` |
| valor_hora | numeric(14,2) null | método `horas` |
| valor_fixo | numeric(16,2) null | método `fixo` |
| valor | numeric(16,2) not null default 0 | trigger (§8.7) |
| prazo_dias | integer null | |
| ordem | integer not null default 0 | |

### 5.5 Diagrama de relacionamentos (resumo)

```
auth.users 1─1 profiles ─┐
organizacoes 1─* organizacao_membros *─1 profiles
organizacoes 1─* convites
organizacoes 1─* clientes 1─* obras 1─* orcamentos ─* orcamento_bdis
                                     │            ├─* orcamento_etapas (árvore) 1─* orcamento_itens 1─* orcamento_item_memorias
                                     │            ├─* orcamento_insumo_precos
                                     │            ├─1 cronogramas 1─* cronograma_distribuicoes (→ etapas nível 1)
                                     │            ├─* medicoes 1─* medicao_itens (→ itens)
                                     │            └─* orcamento_equipes 1─* orcamento_equipe_membros
                                     └─* honorarios 1─* honorario_disciplinas
datas_base 1─* insumo_precos *─1 insumos
datas_base 1─* composicao_precos *─1 composicoes 1─* composicao_itens → insumos | composicoes
datas_base 1─* sinapi_importacoes
encargos_sociais 1─* encargos_sociais_itens
```

## 6. Papéis e matriz de permissões

### 6.1 Papéis

- **admin** (`profiles.papel_global = 'admin'`): super admin global. Vê e altera **tudo**, inclusive
  dados de qualquer organização; aprova/bloqueia usuários; altera papéis; importa SINAPI;
  publica datas-base; edita configurações; lê auditoria completa.
- **user**: usuário comum. Precisa `status = 'active'` para acessar qualquer dado.
- Dentro de uma organização (`organizacao_membros.papel`):
  - **owner**: tudo na organização + gerenciar membros/convites + dados/logo + excluir registros.
  - **editor**: cria/edita/exclui dados (clientes, obras, orçamentos, composições próprias…).
  - **viewer**: somente leitura e exportação/impressão.
- Usuário `pending` ou `blocked`: autentica, mas RLS nega tudo além do próprio `profiles` e das
  `configuracoes` públicas. Front redireciona para `/aguardando-aprovacao` ou `/bloqueado`.
- Organização `bloqueada`: membros não-admin têm leitura apenas (helpers retornam `false` para edição).

### 6.2 Funções auxiliares (B1, `0005`) — usadas por todas as políticas

```sql
-- todas: language sql|plpgsql, stable, security definer, set search_path = ''  (B1; as funções de B2 usam
--        search_path = public, pg_temp desde a migração 0031 — ver §7.3)
is_active_user() returns boolean            -- profile do auth.uid() com status 'active'
is_admin() returns boolean                  -- is_active_user() and papel_global = 'admin'
org_papel(p_organizacao_id uuid) returns org_role   -- null se não membro
is_org_member(p_organizacao_id uuid) returns boolean      -- admin ⇒ true; senão ativo e membro
can_edit_org(p_organizacao_id uuid) returns boolean       -- admin ⇒ true; senão ativo, org 'ativa', papel in (owner, editor)
is_org_owner(p_organizacao_id uuid) returns boolean       -- admin ⇒ true; senão ativo, org 'ativa', papel = owner
assert_pode_editar(p_organizacao_id uuid) returns void    -- raise exception '42501' 'Sem permissão de edição' se not can_edit_org
assert_admin() returns void                                -- raise '42501' 'Acesso restrito ao administrador'
set_updated_at() returns trigger
fn_auditoria_trigger() returns trigger      -- genérico: grava auditoria_logs (acao = lower(TG_OP))
registrar_auditoria(p_acao text, p_entidade text, p_entidade_id text default null,
                    p_detalhes jsonb default null, p_organizacao_id uuid default null) returns void
```

### 6.3 Matriz

Legenda: S = select, I = insert, U = update, D = delete. "—" = negado. "RPC" = somente via função.

| Tabela | admin | owner | editor | viewer | ativo s/ org | pending/blocked |
|---|---|---|---|---|---|---|
| profiles | SIUD | S (membros da org) · U próprio | S membros · U próprio | S membros · U próprio | S/U próprio | S próprio |
| configuracoes | SIUD | S públicas | S públicas | S públicas | S públicas | S públicas |
| organizacoes | SIUD | S U | S | S | I via RPC `criar_organizacao` | — |
| organizacao_membros | SIUD | S · RPC | S | S | — | — |
| convites | SIUD | S · RPC | S | — | S (próprio e-mail) | — |
| auditoria_logs | S | S (da org) | — | — | — | — |
| clientes, obras | SIUD | SIUD | SIUD | S | — | — |
| datas_base | SIUD | S (publicadas) | S (publicadas) | S (publicadas) | S (publicadas) | — |
| insumos/composicoes/composicao_itens SINAPI | SIUD | S | S | S | S | — |
| insumos/composicoes/composicao_itens próprios | SIUD | SIUD | SIUD | S | — | — |
| insumo_precos, composicao_precos | SIUD | S | S | S | S | — |
| sinapi_importacoes | SIUD | — | — | — | — | — |
| orcamentos e todas as filhas (§5.4) | SIUD | SIUD | SIUD | S | — | — |
| encargos_sociais globais (org null) | SIUD | S | S | S | S | — |
| encargos_sociais da org | SIUD | SIUD | SIUD | S | — | — |
| honorarios, honorario_disciplinas | SIUD | SIUD | SIUD | S | — | — |

Padrão de política para tabela de organização (B1 e B2 seguem exatamente):

```sql
alter table X enable row level security;
create policy x_select on X for select to authenticated using (is_org_member(organizacao_id));
create policy x_insert on X for insert to authenticated with check (can_edit_org(organizacao_id));
create policy x_update on X for update to authenticated using (can_edit_org(organizacao_id)) with check (can_edit_org(organizacao_id));
create policy x_delete on X for delete to authenticated using (can_edit_org(organizacao_id));
```

Referências mistas (insumos, composicoes, composicao_itens, encargos_sociais[_itens]):

```sql
using ( (organizacao_id is null and is_active_user()) or is_org_member(organizacao_id) )      -- select
with check ( (organizacao_id is null and is_admin()) or (organizacao_id is not null and can_edit_org(organizacao_id)) )
```

## 7. Funções RPC (assinaturas exatas)

Todas em `public`, chamadas por `supabase.rpc('<nome>', { p_...: ... })`. Erros de negócio:
`raise exception '<mensagem pt-BR>' using errcode = 'P0001'` (permissão: `42501`). O front exibe
`error.message` diretamente no Toast — **mensagens em português, curtas, sem jargão**.

### 7.1 BACKEND-1

| Função | Parâmetros | Retorno | Regras |
|---|---|---|---|
| `registrar_acesso` | — | `void` | atualiza `profiles.ultimo_acesso_em`; grava auditoria `login` (no máx. 1 por hora) |
| `criar_organizacao` | `p_nome text, p_cnpj text default null` | `uuid` | usuário ativo; cria org, membro `owner`, define `organizacao_ativa_id` |
| `definir_organizacao_ativa` | `p_organizacao_id uuid` | `void` | precisa ser membro (ou admin) |
| `convidar_membro` | `p_organizacao_id uuid, p_email text, p_papel org_role` | `uuid` (id do convite) | owner; se já existe pendente, renova `expira_em` e retorna o mesmo id |
| `aceitar_convite` | `p_token uuid` | `uuid` (organizacao_id) | e-mail do usuário = e-mail do convite; não expirado; cria/atualiza membro; marca `accepted` |
| `revogar_convite` | `p_convite_id uuid` | `void` | owner |
| `meus_convites` | — | `setof convites` | convites `pending` não expirados do e-mail do usuário (inclui `organizacao_nome` via view? **não** — o front busca o nome por `obter_convite`) |
| `obter_convite` | `p_token uuid` | `table(id uuid, organizacao_id uuid, organizacao_nome text, email citext, papel org_role, status invite_status, expira_em timestamptz)` | público p/ `authenticated` (a tela de convite precisa ler antes de aceitar) |
| `alterar_papel_membro` | `p_organizacao_id uuid, p_user_id uuid, p_papel org_role` | `void` | owner; não pode deixar a org sem owner |
| `remover_membro` | `p_organizacao_id uuid, p_user_id uuid` | `void` | owner (ou o próprio usuário saindo); não pode remover o último owner |
| `listar_membros` | `p_organizacao_id uuid` | `table(user_id uuid, nome text, email citext, papel org_role, avatar_path text, created_at timestamptz, ultimo_acesso_em timestamptz)` | membro |
| `admin_listar_usuarios` | `p_busca text default null, p_status user_status default null, p_limite int default 50, p_offset int default 0` | `table(id uuid, email citext, nome text, papel_global app_role, status user_status, motivo_bloqueio text, created_at timestamptz, ultimo_acesso_em timestamptz, organizacoes jsonb, total_count bigint)` | admin; `organizacoes` = `[{id, nome, papel}]` |
| `admin_definir_status_usuario` | `p_user_id uuid, p_status user_status, p_motivo text default null` | `void` | admin; não pode bloquear a si mesmo; grava `aprovado_por/em` ao ativar; auditoria |
| `admin_definir_papel_global` | `p_user_id uuid, p_papel app_role` | `void` | admin; não pode rebaixar o último admin |
| `admin_definir_status_organizacao` | `p_organizacao_id uuid, p_status org_status` | `void` | admin |
| `admin_adicionar_membro` | `p_organizacao_id uuid, p_user_id uuid, p_papel org_role` | `void` | admin (upsert) |
| `admin_definir_configuracao` | `p_chave text, p_valor jsonb` | `void` | admin; upsert; auditoria `config` |
| `admin_estatisticas` | — | `jsonb` | admin; `{usuarios_total, usuarios_pendentes, usuarios_bloqueados, organizacoes_total, obras_total, orcamentos_total, ultima_data_base}` (as duas últimas leem tabelas B2 via `to_regclass` p/ não quebrar se ausentes) |

Trigger `handle_new_user()` (after insert on `auth.users`, security definer):
1. insere `profiles(id, email, nome = raw_user_meta_data->>'nome')`;
2. se **não existe nenhum admin** OU `lower(email)` ∈ `configuracoes.admin_emails` ⇒ `papel_global='admin', status='active'`;
3. senão `status = case when aprovacao_obrigatoria then 'pending' else 'active' end`;
4. aceita automaticamente convites pendentes do e-mail? **Não** — o usuário aceita pela tela.

Trigger `fn_profiles_protege_campos()` (before update on profiles): se `not is_admin()` e mudou
`papel_global`, `status`, `motivo_bloqueio`, `aprovado_por`, `aprovado_em` ou `email` ⇒ erro 42501.

### 7.2 BACKEND-2

#### Orçamento

| Função | Parâmetros | Retorno | Regras |
|---|---|---|---|
| `fn_orcamento_criar` | `p_obra_id uuid, p_nome text, p_data_base_id uuid, p_bdi_padrao jsonb default null` | `uuid` | editor; cria orçamento + BDI padrão (`p_bdi_padrao` = `{ac,s,r,g,df,l,pis,cofins,iss,cprb}`; nulo ⇒ zeros + PIS/COFINS padrão) + etapa "1 – Serviços preliminares" |
| `fn_orcamento_recalcular` | `p_orcamento_id uuid` | `orcamentos` (linha) | editor (viewer: erro). Para cada item não-manual: recalcula `custo_unitario` (§8.2), `sem_preco`, `bdi_percentual`; o trigger recalcula preço/total; atualiza totais das etapas (recursivo) e do orçamento; `recalculado_em = now()` |
| `fn_orcamento_renumerar` | `p_orcamento_id uuid` | `void` | atribui `codigo` hierárquico às etapas ("1", "1.1") e itens ("1.1.1") pela `ordem` |
| `fn_orcamento_duplicar` | `p_orcamento_id uuid, p_nome text default null, p_nova_versao boolean default true` | `uuid` | copia tudo (BDIs, etapas, itens, memórias, cotações, cronograma, equipes; **não** copia medições); `versao = max+1` da obra se `p_nova_versao`; `orcamento_origem_id` |
| `fn_orcamento_trocar_data_base` | `p_orcamento_id uuid, p_data_base_id uuid` | `orcamentos` | atualiza e chama recalcular |
| `fn_orcamento_mover` | `p_tipo text ('etapa'\|'item'), p_id uuid, p_novo_pai_id uuid, p_nova_ordem integer` | `void` | move etapa (novo pai = etapa ou null) ou item (novo pai = etapa); reordena irmãos; renumera |
| `fn_orcamento_adicionar_item` | `p_etapa_id uuid, p_referencia_tipo item_referencia_tipo, p_referencia_id uuid default null, p_quantidade numeric default 0, p_descricao text default null, p_unidade text default null, p_custo_unitario numeric default null` | `orcamento_itens` | preenche snapshots (código, descrição, unidade, fonte, custo pela data-base); `ordem` = último + 1; renumera |
| `fn_orcamento_resumo` | `p_orcamento_id uuid` | `table(etapa_id uuid, parent_id uuid, codigo text, nome text, nivel integer, ordem_path text, total_sem_bdi numeric, total numeric, percentual numeric)` | sintético; `percentual` = total/total orçamento × 100; `ordem_path` p/ ordenar |
| `fn_custo_insumo` | `p_insumo_id uuid, p_data_base_id uuid, p_orcamento_id uuid default null` | `numeric` | §8.2 (prioridade de preço); null se sem preço |
| `fn_custo_composicao` | `p_composicao_id uuid, p_data_base_id uuid, p_orcamento_id uuid default null` | `numeric` | §8.2; arredondado 2 casas; null se nenhum componente tem preço |
| `fn_composicao_analitica` | `p_composicao_id uuid, p_data_base_id uuid, p_orcamento_id uuid default null` | `table(item_id uuid, tipo_item composicao_item_tipo, referencia_id uuid, fonte fonte_referencia, codigo text, descricao text, unidade text, insumo_tipo insumo_tipo, coeficiente numeric, preco_unitario numeric, custo_parcial numeric, sem_preco boolean)` | um nível (subcomposição aparece como linha com seu custo); `custo_parcial = coeficiente × preco_unitario` sem arredondar |
| `fn_buscar_referencias` | `p_termo text, p_data_base_id uuid, p_organizacao_id uuid default null, p_tipo text default null, p_limite integer default 50` | `table(tipo text, id uuid, fonte fonte_referencia, codigo text, descricao text, unidade text, insumo_tipo insumo_tipo, preco numeric, is_demo boolean, rank real)` | `p_tipo` ∈ `'insumo'`,`'composicao'`, null=ambos. Termo numérico ⇒ prioriza código exato/prefixo; texto ⇒ `websearch_to_tsquery('portuguese', f_unaccent(termo))` + trigram. Inclui próprios da org. Só SINAPI com preço na data-base **ou** próprios |
| `fn_curva_abc_servicos` | `p_orcamento_id uuid` | `table(posicao integer, item_id uuid, codigo text, referencia_codigo text, descricao text, unidade text, quantidade numeric, preco_unitario numeric, total numeric, percentual numeric, percentual_acumulado numeric, classe char(1))` | §8.5, base = `total` (com BDI) |
| `fn_curva_abc_insumos` | `p_orcamento_id uuid` | `table(posicao integer, insumo_id uuid, fonte fonte_referencia, codigo text, descricao text, unidade text, insumo_tipo insumo_tipo, quantidade numeric, preco_unitario numeric, total numeric, percentual numeric, percentual_acumulado numeric, classe char(1))` | explode composições recursivamente (§8.4); base = custo sem BDI |
| `fn_cronograma_fisico_financeiro` | `p_orcamento_id uuid` | `table(etapa_id uuid, etapa_codigo text, etapa_nome text, etapa_total numeric, periodo integer, data_inicio date, data_fim date, percentual numeric, valor numeric, percentual_acumulado numeric, valor_acumulado numeric)` | uma linha por etapa × período (inclui zeros); `valor = round(etapa_total × pct/100, 2)` |
| `fn_cronograma_salvar` | `p_orcamento_id uuid, p_data_inicio date, p_periodicidade cronograma_periodicidade, p_num_periodos smallint, p_distribuicoes jsonb` | `uuid` (cronograma_id) | upsert do cabeçalho; substitui distribuições; `p_distribuicoes = [{etapa_id, periodo, percentual}]`; remove períodos > num_periodos |
| `fn_medicao_criar` | `p_orcamento_id uuid, p_periodo_inicio date, p_periodo_fim date` | `uuid` | `numero = max+1`; exige orçamento `aprovado` ou `em_revisao` |
| `fn_medicao_resumo` | `p_medicao_id uuid` | `table(item_id uuid, etapa_id uuid, codigo text, descricao text, unidade text, preco_unitario numeric, quantidade_orcada numeric, valor_orcado numeric, quantidade_anterior numeric, quantidade_atual numeric, quantidade_acumulada numeric, quantidade_saldo numeric, valor_anterior numeric, valor_atual numeric, valor_acumulado numeric, valor_saldo numeric, percentual_acumulado numeric)` | "anterior" = medições de `numero` menor |
| `fn_mao_obra_resumo` | `p_orcamento_id uuid` | `table(equipe_id uuid, equipe_nome text, membro_id uuid, funcao text, quantidade numeric, horas_dia numeric, dias numeric, horas_totais numeric, custo_hora numeric, custo_total numeric)` | §8.6 |
| `fn_mao_obra_horas_orcamento` | `p_orcamento_id uuid` | `table(insumo_id uuid, codigo text, descricao text, unidade text, horas numeric, custo numeric)` | horas de MO implícitas nas composições (insumos `mao_de_obra` da explosão §8.4) |
| `fn_honorario_recalcular` | `p_honorario_id uuid` | `honorarios` | recalcula disciplinas e totais (§8.7) |
| `fn_dashboard_resumo` | `p_organizacao_id uuid` | `jsonb` | `{obras_por_status: {status: n}, orcamentos_total, valor_orcado_total, valor_aprovado_total, medido_total, ultimos_orcamentos: [{id, nome, obra_nome, total, status, updated_at}] (5), data_base_mais_recente: {id, uf, ano, mes, regime, is_demo}}` |

#### Referências próprias

| Função | Parâmetros | Retorno | Regras |
|---|---|---|---|
| `fn_composicao_propria_salvar` (migração `0030`) | `p_id uuid, p_cabecalho jsonb, p_itens jsonb default '[]'` | `uuid` (id da composição) | `p_id = null` cria (exige `p_cabecalho.organizacao_id`), senão atualiza a composição própria `p_id`. `p_cabecalho = {codigo, descricao, unidade, grupo?, observacao?, ativo?, organizacao_id?}`; `p_itens = [{tipo_item: 'insumo'\|'composicao', referencia_id (ou insumo_id/subcomposicao_id), coeficiente}]`, `ordem` = posição, a lista **substitui** os itens. `security invoker` (RLS vale) + `assert_pode_editar`; tudo numa transação (erro em qualquer item desfaz cabeçalho e itens). Erros `P0001` (validação), `42501` (SINAPI/sem permissão), `23505` (código duplicado). Usada por `useSalvarComposicaoPropria` |

#### Encargos

| Função | Parâmetros | Retorno |
|---|---|---|
| `fn_encargos_duplicar` | `p_encargos_id uuid, p_organizacao_id uuid, p_nome text` | `uuid` — copia tabela (global ou da org) para a org |

#### Importação SINAPI (admin)

| Função | Parâmetros | Retorno | Regras |
|---|---|---|---|
| `fn_sinapi_iniciar_importacao` | `p_uf char(2), p_ano integer, p_mes integer, p_regime regime_desoneracao, p_tipo importacao_tipo, p_arquivo_nome text default null` | `uuid` (importacao_id) | admin; cria (ou reutiliza) `datas_base(is_demo=false)` em `rascunho` se não existir; status `processando` |
| `fn_sinapi_importar_insumos` | `p_importacao_id uuid, p_linhas jsonb` | `integer` (linhas ok no lote) | lote ≤ 2000. Cada linha: `{codigo text, descricao text, unidade text, preco numeric, origem_preco text?, tipo insumo_tipo?, classificacao text?, linha integer?}`. Upsert em `insumos` (fonte sinapi, atualiza descrição/unidade) e `insumo_precos`. Linhas inválidas vão para `erros` |
| `fn_sinapi_importar_composicoes` | `p_importacao_id uuid, p_linhas jsonb` | `integer` | `{codigo, descricao, unidade, grupo?, custo numeric, custo_mao_obra?, custo_material?, custo_equipamento?, custo_servicos?, perc_mao_obra?, linha?}` → `composicoes` + `composicao_precos` |
| `fn_sinapi_importar_composicao_itens` | `p_importacao_id uuid, p_linhas jsonb` | `integer` | `{composicao_codigo text, tipo_item 'INSUMO'\|'COMPOSICAO', item_codigo text, coeficiente numeric, descricao?, unidade?, linha?}`. Cria composição/insumo "esqueleto" se ainda não existir (descrição da linha). Upsert em `composicao_itens` com `importacao_id` |
| `fn_sinapi_finalizar_importacao` | `p_importacao_id uuid, p_publicar boolean default false` | `sinapi_importacoes` | para `analitico`: remove itens de composições SINAPI tocadas nesta importação cujo `importacao_id` ≠ atual; status `concluida`; se `p_publicar`, `datas_base.status='publicada', publicada_em=now()`; auditoria `importar_sinapi` |
| `fn_sinapi_cancelar_importacao` | `p_importacao_id uuid` | `void` | status `cancelada` (dados já gravados permanecem; data-base continua `rascunho`) |
| `fn_sinapi_publicar_data_base` | `p_data_base_id uuid, p_status data_base_status` | `datas_base` | admin |

### 7.2.1 Busca automática da SINAPI (`0032`, `api/sinapi/*`)

- Função de servidor (Vercel, Node) `POST /api/sinapi/sincronizar` — corpo `{ uf, ano?, mes?, forcar? }`
  (usuário ativo) ou `{ ufs: [...] | 'em_uso' | 'todas' }` (admin). Autentica pelo token da sessão,
  baixa `SINAPI-AAAA-MM-formato-xlsx.zip` da Caixa, lê a planilha de referência
  (`src/lib/sinapi/nacional.ts`) e grava com a chave service_role pelas RPCs de importação (§7.2):
  por UF e regime, insumos → (analítico, uma vez por mês) → composições com publicação.
- `GET /api/sinapi/cron` (diário, `CRON_SECRET`): UFs de `fn_sinapi_ufs_em_uso()` que não têm o mês
  mais recente; o que não couber em ~4 min fica para o dia seguinte.
- `assert_admin()` aceita `auth.role() = 'service_role'`.
- Tabela `sinapi_sincronizacoes` (histórico/trava; leitura para usuários ativos, escrita só service_role),
  `fn_sinapi_ufs_em_uso() → text[]`, `fn_sinapi_disponibilidade(p_uf text) → table(ano, mes, regime, status, data_base_id)`.

### 7.3 Endurecimento e convenções de segurança (revisão final, `0031`)

- Toda função do schema `public` tem `search_path` fixo: `''` (B1, nomes totalmente qualificados) ou
  `public, pg_temp` (B2 e funções puras; `pg_temp` por último impede que uma tabela temporária
  "sombreie" uma tabela dentro de função `security definer`). O `supabase db lint` não aponta nada.
- `EXECUTE` é revogado de `anon`/`PUBLIC` em todas as funções; `authenticated`/`service_role` mantêm
  exatamente o acesso anterior. Os privilégios padrão do schema também deixam de conceder `EXECUTE`
  a `anon` em funções futuras — **toda RPC nova precisa de `grant execute ... to authenticated`**.
- `anon` só lê `configuracoes` públicas (tabela). Nenhuma RPC funciona sem login.
- `CREATE` no schema `public` negado a `anon`/`authenticated`.

### 7.4 Paginação das leituras (front)

O PostgREST corta cada resposta em `max_rows` (`supabase/config.toml`: 5000; padrão do Supabase
Cloud: 1000). Leituras que podem crescer com o orçamento — itens, etapas, curva ABC, cronograma
físico-financeiro e distribuições, resumo e itens de medição, mão de obra e as exportações — usam
`buscarTodas()` (`src/api/orcamento/util.ts`), que pagina por `range` em lotes de 1000 até receber
um lote incompleto, com ordenação total (`ordem`, `id`). Por isso `max_rows` **não pode** ser menor
que 1000.

## 8. Regras de cálculo

Fonte única no front: `src/lib/calc.ts`. As funções SQL **devem** produzir o mesmo resultado.

### 8.1 BDI — fórmula TCU (Acórdão 2622/2013-Plenário)

```
BDI = [ (1 + AC + S + R + G) × (1 + DF) × (1 + L) / (1 − I) ] − 1
I   = PIS + COFINS + ISS + CPRB
```
Todos os termos como fração (o banco guarda em %, dividir por 100). Resultado exibido e aplicado
em **% com 2 casas** (arredondamento comercial, meio para longe do zero): `round(BDI×100, 2)`.

Faixas de referência do acórdão (1º quartil / médio / 3º quartil), usadas como presets e para o
alerta "fora da faixa" (valores em %; conferir com o texto do acórdão antes de uso contratual):

| Tipo de obra | AC | S+G | R | DF | L | BDI |
|---|---|---|---|---|---|---|
| Construção de edifícios | 3,00 / 4,00 / 5,50 | 0,80 / 0,80 / 1,00 | 0,97 / 1,27 / 1,27 | 0,59 / 1,23 / 1,39 | 6,16 / 7,40 / 8,96 | 20,34 / 22,12 / 25,00 |
| Fornecimento de materiais e equipamentos | 1,50 / 3,45 / 4,49 | 0,30 / 0,48 / 0,82 | 0,56 / 0,85 / 0,89 | 0,85 / 0,85 / 1,11 | 3,50 / 5,11 / 6,22 | 11,10 / 14,02 / 16,80 |

Tributos padrão: PIS 0,65%, COFINS 3,00%, ISS = alíquota municipal × % de mão de obra na base
(campo livre), CPRB só no regime desonerado (valor configurável — a alíquota mudou com a
reoneração gradual da Lei 14.973/2024; **não fixar no código**).

### 8.2 Custo unitário (sem BDI)

**Preço de insumo** em um orçamento (primeiro que existir):
1. `orcamento_insumo_precos.preco` (cotação do orçamento);
2. `insumo_precos.preco` na `data_base_id` do orçamento;
3. `insumos.preco_proprio` (somente insumos próprios);
4. sem preço ⇒ `null` (tratado como 0 e item marcado `sem_preco = true`).

**Custo de composição** `C(comp)`:
1. Se `fonte='sinapi'` **e** existe `composicao_precos` na data-base **e** o orçamento **não** tem
   nenhuma cotação (`orcamento_insumo_precos`) afetando a árvore ⇒ usa o custo oficial
   `round(composicao_precos.custo, 2)` (garante bater com o relatório da Caixa).
2. Caso contrário: `C = round( Σ (coeficiente × P(item)) , 2)` onde `P(item)` = preço do insumo
   (sem arredondar) ou `C(subcomposição)` (já arredondado a 2 casas). Parciais **não** são
   arredondados individualmente.
3. Sem itens e sem custo oficial ⇒ `null`.

**Item do orçamento**: `custo_unitario = round(C ou P, 2)`; `livre`/`custo_manual` ⇒ valor digitado.

### 8.3 Preço com BDI e totais (arredondamento a 2 casas por item)

```
preco_unitario = round2( custo_unitario × (1 + bdi_percentual/100) )
total_sem_bdi  = round2( quantidade × custo_unitario )
total          = round2( quantidade × preco_unitario )
total_etapa    = Σ total dos itens da etapa e de suas subetapas      (sem novo arredondamento)
total_orcamento= Σ total das etapas de 1º nível
total_bdi      = total_orcamento − total_sem_bdi_orcamento
```
`round2` = arredondamento comercial (half away from zero). Em SQL: `round(x::numeric, 2)`.
Em TS: `round2()` de `calc.ts` (usa notação exponencial para evitar erro de ponto flutuante).

### 8.4 Explosão de insumos (curva ABC de insumos / horas de MO)

Para cada item `composicao` do orçamento: quantidade do insumo =
`item.quantidade × Π coeficientes` ao longo do caminho até o insumo (recursivo, qualquer
profundidade). Itens `insumo` entram direto. Itens `livre` entram como pseudo-insumo
(`insumo_id null`, código = código do item). Composição sem itens analíticos entra como
pseudo-insumo com o custo da composição. Agrupar por `insumo_id`; `total = round2(Σqtd × preço)`.

### 8.5 Curva ABC

1. Ordenar por `total` desc (desempate: `codigo` asc, `id` asc). Excluir totais = 0.
2. `percentual = total / Σtotal × 100` (sem arredondar no cálculo; exibir com 2 casas).
3. `percentual_acumulado` = soma corrente.
4. Classe pelo acumulado **anterior** ao item (`acum_ant = acumulado − percentual`):
   `A` se `acum_ant < 80`; `B` se `acum_ant < 95`; senão `C`. (O item que cruza a fronteira fica na
   classe de cima; o 1º item é sempre A.) Faixas: A = 80%, B = 15%, C = 5%.

### 8.6 Encargos e mão de obra

- Total de encargos = Σ itens do grupo A + B + C + D (horista e mensalista separados). O grupo D
  (reincidências) é digitado já calculado; `calc.ts` oferece `reincidencia(A, B) = A×B/100`
  como auxiliar para a UI.
- Custo-hora de membro de equipe:
  - com `insumo_id`: preço do insumo na data-base (SINAPI de MO já inclui encargos);
  - senão: `salario_hora × (1 + (aplicar_encargos ? encargos.total_horista : 0)/100)`.
- `horas_totais = quantidade × horas_dia × dias`; `custo_total = round2(horas_totais × custo_hora)`.

### 8.7 Honorários de projeto

| método | valor |
|---|---|
| `area` | `round2(area_m2 × valor_m2)` (area nula ⇒ `honorarios.area_m2`) |
| `percentual_obra` | `round2(coalesce(valor_obra, orcamento.total) × percentual / 100)` |
| `horas` | `round2(horas × valor_hora)` |
| `fixo` | `round2(valor_fixo)` |

`subtotal = Σ valor`; `com_desconto = subtotal × (1 − desconto%/100)`;
`total = round2(com_desconto / (1 − impostos%/100))` (impostos "por dentro").

### 8.8 Memória de cálculo

Expressões aceitas: números pt-BR (`3,5` ou `3.5`; separador de milhar **não** aceito),
`+ − * / ^`, parênteses, `x`/`×` como multiplicação. Avaliador próprio (`avaliarExpressao` em
`calc.ts`, sem `eval`). Resultado arredondado a 4 casas.

### 8.9 Numeração da EAP e períodos do cronograma

- **Numeração** (`fn_orcamento_renumerar` ≡ `numerarEap` em `calc.ts`): irmãos ordenados por
  (`ordem`, `id`). Etapas de 1º nível: "1", "2"… Dentro de uma etapa, **primeiro as subetapas,
  depois os itens**, numa única sequência: etapa "2" com subetapa e 1 item ⇒ "2.1" (subetapa) e
  "2.2" (item); item da subetapa ⇒ "2.1.1".
- **Períodos** (`gerarPeriodos` em `calc.ts`): período *k* (1-based) começa em
  `data_inicio + (k−1)·passo`; `semanal` = 7 dias, `quinzenal` = 15 dias, `mensal` =
  `data_inicio + (k−1) months` (aritmética do Postgres, que ajusta para o último dia do mês:
  31/01 + 1 mês = 28/02). Fim do período = início do próximo − 1 dia.

## 9. Importação SINAPI (formato da planilha)

O parser roda **no navegador** (`src/lib/sinapi/parser.ts`, SheetJS) e envia lotes de 1000 linhas
normalizadas às RPCs de §7.2. Nenhuma edge function é necessária. Fluxo na tela
`/admin/sinapi/importar`:

1. Admin escolhe UF (padrão RJ), mês/ano, regime e o arquivo (`.xlsx`, `.xls`, `.csv`).
2. Parser detecta a **linha de cabeçalho** (primeira linha nas 40 primeiras que contenha
   "CODIGO" e "DESCRI", ignorando acentos/caixa) e o **tipo** de planilha.
3. Pré-visualização de 20 linhas + mapeamento de colunas editável + contagem de linhas válidas.
4. `fn_sinapi_iniciar_importacao` → lotes → `fn_sinapi_finalizar_importacao(p_publicar)`.
   Barra de progresso; erros por linha exibidos ao final.

### 9.1 Formatos aceitos

**(a) Formato por UF (arquivos legados da Caixa, um por UF/mês/regime)** — ex.:
`SINAPI_Preco_Ref_Insumos_RJ_202609_NaoDesonerado.xlsx`,
`SINAPI_Custo_Ref_Composicoes_Sintetico_RJ_202609_NaoDesonerado.xlsx`,
`SINAPI_Custo_Ref_Composicoes_Analitico_RJ_202609_NaoDesonerado.xlsx`.

| Tipo | Colunas reconhecidas (sinônimos, sem acento, caixa ignorada) |
|---|---|
| insumos | `CODIGO`/`CODIGO DO INSUMO` · `DESCRICAO`/`DESCRICAO DO INSUMO` · `UNIDADE`/`UNIDADE DE MEDIDA` · `ORIGEM DE PRECO` · `PRECO MEDIANO R$`/`PRECO`/`PRECO MEDIANO` · `CLASSIFICACAO` (opcional) |
| composições (sintético) | `CODIGO DA COMPOSICAO`/`CODIGO` · `DESCRICAO DA COMPOSICAO`/`DESCRICAO` · `UNIDADE` · `CUSTO TOTAL`/`CUSTO` · `DESCRICAO DA CLASSE`/`GRUPO` · `% MAO DE OBRA`, `CUSTO MAO DE OBRA`, `CUSTO MATERIAL`, `CUSTO EQUIPAMENTO`, `CUSTO SERVICOS TERCEIROS`/`CUSTO OUTROS` (opcionais) |
| analítico | `CODIGO DA COMPOSICAO` · `TIPO ITEM` (`INSUMO`/`COMPOSICAO`) · `CODIGO ITEM` · `DESCRICAO ITEM` · `UNIDADE ITEM` · `COEFICIENTE` (linhas sem `TIPO ITEM` = cabeçalho da composição: usadas para descrição/unidade/custo) |

**(b) Formato consolidado (planilha única mensal com abas e colunas por UF)** — abas cujos nomes
contenham `ISD` (insumos sem desoneração), `ICD` (com desoneração), `CSD`, `CCD` (composições) e
`ANALITICO`. A coluna de preço é a coluna cujo cabeçalho é exatamente a UF escolhida (`RJ`). O
parser oferece seleção da aba; o regime é inferido pela sigla da aba (`SD` ⇒ não desonerado,
`CD` ⇒ desonerado) e pode ser ajustado.

### 9.2 Normalização

- Código: `String(v).trim()`, remover `.0` final de números lidos do Excel, remover zeros à esquerda.
- Números: aceitar `1.234,56`, `1234,56`, `1234.56` e numéricos nativos; vazio ⇒ linha com erro
  "preço ausente" (insumos) — composições sem custo são aceitas com `custo` nulo? **Não**: erro.
- Unidade: maiúsculas, trim; `M2`, `M3`, `M`, `KG`, `H`, `UN`, `L`, `CHP`, `CHI`, `MES`, `T`…
- Tipo de insumo (quando não houver coluna): heurística pela unidade/descrição —
  `H` e descrição terminando em profissão ⇒ `mao_de_obra`; `CHP`/`CHI` ⇒ `equipamento`; senão `material`.
- Linhas cujo código não é numérico são ignoradas (títulos, rodapés).

Tipos TS dessas linhas: `src/types/sinapi-import.ts` (já criado, é contrato entre F1 e B2).

## 10. Dados de demonstração

`supabase/seed.sql` (B2) cria **apenas** dados marcados `is_demo = true`:
- `datas_base` RJ (mês/ano corrente − 2 meses) nos dois regimes, `descricao` iniciando com
  `"DEMONSTRAÇÃO – dados de exemplo, importe a tabela oficial"`, status `publicada`;
- ~40 insumos e ~15 composições com **códigos e descrições SINAPI conhecidos** (ex.: insumos de
  mão de obra, cimento, areia, brita, blocos cerâmicos, aço CA-50; composições de alvenaria,
  chapisco, emboço, contrapiso, concreto, pintura) com **preços fictícios plausíveis**;
- uma tabela de encargos sociais de exemplo (horista/mensalista) `is_demo = true`.

Regras de UI: qualquer data-base/insumo/composição `is_demo` exibe `<Badge variant="demo">` com o
texto **"Exemplo"** e o tooltip "Dados de exemplo – importe a tabela oficial SINAPI"; relatórios
impressos com data-base demo recebem a faixa "DOCUMENTO GERADO COM DADOS DE EXEMPLO – NÃO OFICIAIS".
O seed **não** cria usuários nem organizações (o primeiro cadastro vira admin).

## 11. Storage (B1, `0008`)

| Bucket | Público | Caminho | Leitura | Escrita |
|---|---|---|---|---|
| `logos` | não (URLs assinadas 1 h) | `{organizacao_id}/logo.{png\|jpg\|svg}` | membros da org, admin | owner da org, admin |
| `avatares` | não | `{user_id}/avatar.{ext}` | qualquer usuário ativo | o próprio usuário |
| `sinapi-arquivos` | não | `{ano}/{mes}/{uf}/{arquivo}` | admin | admin |

Limites: logos/avatares 2 MB (`image/png`, `image/jpeg`, `image/svg+xml`, `image/webp`);
sinapi-arquivos 60 MB. Políticas em `storage.objects` usando `(storage.foldername(name))[1]`.

## 12. Relatórios e exportação (F2)

Rotas de impressão fora do AppShell: `/imprimir/orcamentos/:orcamentoId/:relatorio` com
`relatorio ∈ { sintetico, analitico, composicoes, curva-abc-servicos, curva-abc-insumos,
cronograma, memoria, medicao }` (+ query `?medicao=<id>`). Layout A4 (retrato; cronograma em
paisagem), cabeçalho com logo da organização, dados da obra, data-base, BDI e regime; rodapé com
RT e numeração. PDF = "Salvar como PDF" do navegador (`window.print()`).

Exportação: `src/lib/export/xlsx.ts` e `src/lib/export/csv.ts` (F2). CSV com `;` como separador e
vírgula decimal (padrão Excel pt-BR), UTF-8 com BOM.

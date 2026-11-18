<p align="center"><img src="public/logo.svg" alt="Pretium" height="48"></p>

# Pretium

Sistema web de **orçamento de obras** com base na tabela **SINAPI – Rio de Janeiro**, para
engenheiros e arquitetos: obras, orçamento analítico/sintético com EAP, composições SINAPI e
próprias, BDI (fórmula TCU – Acórdão 2622/2013), encargos sociais, mão de obra, cronograma
físico-financeiro, curva ABC, memória de cálculo, medições, honorários de projeto, relatórios
(impressão/PDF) e exportação CSV/XLSX. Multiusuário com organizações e RLS no Supabase.

Stack: Vite · React 18 · TypeScript (strict) · Tailwind CSS 3 · React Router 6 · TanStack Query ·
zod + react-hook-form · lucide-react · recharts · SheetJS (xlsx) · Supabase (Postgres, Auth, RLS,
RPC, Storage) · Vitest + Testing Library.

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | módulos, modelo de dados, RLS/permissões, RPCs, regras de cálculo, formato SINAPI |
| [`docs/DESIGN.md`](docs/DESIGN.md) | tokens de cor (claro/escuro), tipografia, componentes, acessibilidade |
| [`docs/DIVISAO_TRABALHO.md`](docs/DIVISAO_TRABALHO.md) | responsabilidades e propriedade de arquivos por agente |
| [`docs/CONTRATO_ALTERACOES.md`](docs/CONTRATO_ALTERACOES.md) | registro de mudanças de contrato |
| [`docs/RELATORIO_TESTES.md`](docs/RELATORIO_TESTES.md) | ambiente, cobertura e resultados dos testes |

## Requisitos

- Node.js 20+ e npm 10+
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) e Docker
  (para banco local) **ou** um projeto no [supabase.com](https://supabase.com)

## Como rodar (desenvolvimento)

```bash
npm install
cp .env.example .env.local          # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev                          # http://localhost:5173
```

### Supabase local

```bash
supabase start                       # sobe Postgres, Auth, Storage, Studio (http://localhost:54323)
supabase db reset                    # aplica supabase/migrations/* em ordem e roda supabase/seed.sql
```

`supabase start` imprime a `API URL` e a `anon key`: copie-as para `.env.local`.
E-mails de autenticação locais (recuperação de senha) aparecem no Inbucket: http://localhost:54324.

### Supabase na nuvem

1. Crie o projeto e anote **Project URL** e **anon public key** (Settings → API) no `.env.local`.
2. Vincule e aplique as migrações:
   ```bash
   supabase link --project-ref <ref-do-projeto>
   supabase db push                  # aplica supabase/migrations/*
   ```
   O seed de demonstração é opcional: `psql "<connection-string>" -f supabase/seed.sql`.
3. Em **Authentication → URL Configuration** defina o *Site URL* e adicione
   `<seu-dominio>/redefinir-senha` e `<seu-dominio>/convite/*` aos *Redirect URLs*.
4. **Administrador**: o primeiro usuário cadastrado vira administrador. Em produção, antes de
   abrir o cadastro, defina os e-mails administradores:
   ```sql
   update configuracoes set valor = '["voce@empresa.com.br"]' where chave = 'admin_emails';
   ```

## Tabela SINAPI

O banco **não** traz preços oficiais. O seed cria apenas dados de **demonstração** (marcados
"Exemplo" em toda a interface). Para usar preços oficiais, o administrador baixa as planilhas
mensais da Caixa (SINAPI, UF RJ, desonerado e não desonerado) e as carrega em
**Administração → Tabelas SINAPI → Importar**. Formatos aceitos: `docs/ARQUITETURA.md` §9.

## Scripts

| Script | Ação |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | checagem de tipos + build de produção em `dist/` |
| `npm run preview` | serve o build |
| `npm run typecheck` | `tsc -b` |
| `npm test` | testes unitários e de componente (vitest + Testing Library) |
| `npm run test:db` | suítes SQL (RLS, RPCs, cálculo, importação) em Postgres WASM (PGlite) — não precisa de Docker |
| `npm run test:db:pg` | as mesmas suítes num Postgres real via `psql` (padrão: o do `supabase start`, porta 54322) |
| `npm run test:contrato` | verificador estático: toda chamada `from/select/rpc/storage` de `src/` × catálogo do banco migrado |
| `npm run test:integracao` | hooks reais de `src/api` contra o Supabase local (GoTrue + PostgREST + Storage); `-- --reset` faz `supabase db reset` antes |
| `npm run test:e2e` | Playwright (Chromium) no build de produção contra o Supabase local; screenshots em `test-results/e2e/` |
| `npm run test:all` | tudo acima (os passos que dependem do Supabase local/psql/Playwright são pulados com aviso se indisponíveis) |
| `npm run lint` | ESLint |
| `npm run types:gen` | gera `src/types/database.generated.ts` a partir do banco local (conferência) |
| `npm run db:start` / `db:reset` | atalhos do Supabase CLI |

### Testes contra o Supabase local

```bash
supabase start -x studio,imgproxy,edge-runtime,logflare,vector,postgres-meta,supavisor
npm run test:integracao -- --reset   # aplica migrações + seed e roda os fluxos ponta a ponta
npm run test:e2e
```

Sem acesso ao registro ECR da AWS, use as imagens do Docker Hub: `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io supabase start …`.
Relatório da última rodada: [`docs/RELATORIO_TESTES.md`](docs/RELATORIO_TESTES.md).

## Estrutura

```
public/                 logo.svg, logo-dark.svg, logo-mark*.svg, favicon.svg
src/
  App.tsx               roteamento completo
  routes.ts             construtores de caminhos
  components/ui/        design system (Button, Input, Table, Card, Modal, Tabs, …)
  components/layout/    AppShell, Sidebar, Topbar
  components/brand/     Logo
  contexts/             Auth, Organização, Tema
  api/                  hooks react-query (core/, orcamento/)
  lib/                  supabase, format, calc (regras de cálculo), labels
  pages/                telas por módulo
  types/                tipos do banco (contrato com as migrações)
supabase/
  migrations/           0001–0009 núcleo · 0010–0029 SINAPI/orçamento · 0030+ correções (TESTES)
  seed.sql              dados de demonstração
  config.toml
docs/
```

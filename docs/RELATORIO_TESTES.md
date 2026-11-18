# Relatório de testes — Pretium

Agente TESTES · 18/11/2026 · branch `claude/tender-babbage-ybmjko`

Este relatório cobre a primeira rodada contra um **Supabase real**. Antes dela, o banco só tinha
sido exercitado no PGlite (Postgres 18 em WASM) e o frontend só com testes unitários. Resultado:
**todas as suítes passam** (`npm run test:all` termina com código 0). Foram encontrados e corrigidos
8 problemas, listados no §4.

## 1. Ambiente

| Peça | Versão / como |
|---|---|
| Supabase local | Supabase CLI 2.54.11 com `supabase start`, imagens do Docker Hub (`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`, porque o ECR estava bloqueado). Serviços: **Postgres 15.8.1.085**, **GoTrue v2.180.0**, **PostgREST v13.0.7**, **Storage API v1.28.2**, Kong 2.8.1. Desligados: studio, imgproxy, edge-runtime, logflare, vector, realtime, postgres-meta, supavisor e mailpit. |
| Migrações | `supabase db reset` aplica 0001–0022, a nova **0030** e o `seed.sql` no PG 15.8 sem erros nem avisos de compatibilidade (repetido várias vezes). |
| Postgres 16 | PG 16.15 local, criado com `initdb` num diretório temporário, para rodar as suítes SQL (`test:db:pg`). |
| PGlite | `@electric-sql/pglite` 0.5.16 (agora devDependency), usado por `test:db` e `test:contrato`. |
| Navegador | Playwright pré-instalado, Chromium headless, `deviceScaleFactor: 1`, locale pt-BR. O teste roda sobre o build de produção (`vite build` + `vite preview`) apontando para o Supabase local. |
| Node | 22.23 |

O plano B (PostgREST avulso com stub de auth) não foi necessário, porque o stack completo do Supabase subiu.
Para isso foi preciso desligar o Realtime no `config.toml` (§4, item 6).

## 2. O que foi testado e resultados

| Suíte | Comando | Resultado |
|---|---|---|
| Unitários + componentes (vitest) | `npm test` | **91/91** (14 arquivos: os 67 originais e 24 novos) |
| SQL no PGlite: núcleo, só com as migrações 0001–0009 | `npm run test:db` | **167/167** |
| SQL no PGlite: núcleo, com todas as migrações | idem | **167/167** |
| SQL no PGlite: referências/orçamento, incluindo a nova `orc_70` | idem | **249/249** (225 originais + 24 novos) |
| As mesmas suítes SQL no **Postgres 15.8 real** (container do Supabase) | `npm run test:db:pg` | **416/416** |
| As mesmas suítes SQL no **Postgres 16.15 real** | `PRETIUM_PG_URL=… npm run test:db:pg` | **416/416** |
| Verificador de contrato (estático × catálogo) | `npm run test:contrato` | **OK**: 94 `from()`, 61 `rpc()` e 2 `storage.from()` analisados, sem nenhum erro (30 tabelas, 47 RPCs, 3 buckets) |
| Integração com hooks reais contra GoTrue/PostgREST/Storage | `npm run test:integracao` | **41/41** (40 fluxos + 1 de storage) |
| E2E no navegador | `npm run test:e2e` | **87 visitas de tela, 2 interações, 0 problemas** (sem erro de console, exceção, HTTP ≥ 400 ou `<EstadoErro>`) |
| `typecheck`, `lint`, `build` | — | sem erros |

### 2.1 Verificador de contrato (`scripts/verificar-contrato.mjs`)

O script usa a API do compilador TypeScript para extrair de `src/**` cada chamada do supabase-js: tabela,
string do `select` (com embeds, alias, `!fk` e `!inner`), filtros e ordenações, chaves literais de
`insert`/`update`/`upsert`, `onConflict`, nome da RPC e nomes dos parâmetros, e bucket.

Em seguida valida tudo contra o catálogo do banco migrado:

- colunas existem;
- os embeds têm FK entre as tabelas, e a dica `!fk` é uma constraint ou coluna válida;
- nenhum embed sem dica é ambíguo (o erro PGRST201 do PostgREST);
- `onConflict` corresponde a um índice único;
- toda tabela tem RLS ligada e o papel `authenticated` tem o privilégio da operação;
- toda RPC existe, `authenticated` tem `EXECUTE`, cada parâmetro enviado existe e cada parâmetro obrigatório é enviado.

Para confirmar que o verificador detecta erros, foram introduzidos de propósito três defeitos: uma
coluna errada num embed, uma dica de FK inexistente e um parâmetro de RPC renomeado. Os três foram
apontados.

Como verificação complementar, o projeto foi recompilado usando os tipos gerados pelo banco real
(`supabase gen types`) no lugar dos tipos escritos à mão. Apareceram 36 diferenças, todas esperadas e
inofensivas:

- `organizacao_id` é obrigatório no tipo gerado, mas é preenchido por trigger;
- parâmetros `default null` aparecem como `string | undefined`;
- colunas `jsonb` e enums que o gerador tipa como `text`.

Nenhum nome de tabela, coluna ou parâmetro diverge.

### 2.2 Integração (`src/test/integracao/`, Supabase real)

Os testes montam os **hooks reais** de `src/api/**` com React Query. O client singleton conversa com o
GoTrue e o PostgREST de verdade, usando JWTs reais de usuários de teste. Fluxos cobertos, em ordem:

1. **Cadastro e aprovação.** O primeiro cadastro vira admin ativo e os seguintes ficam `pending`. Um
   usuário pendente não lê dados nem cria organização. O anônimo só lê as configurações públicas. O
   admin lista os pendentes, aprova (com auditoria `aprovar_usuario`) e consulta as estatísticas.
2. **Organizações.** Ana cria a organização A (CNPJ normalizado, organização ativa no perfil) e Carla
   cria a B. Ana convida Bruno (editor, e-mail em maiúsculas) e Vitor (viewer), e eles aceitam via
   `meus_convites`/`obter_convite`/`aceitar_convite`. A lista de membros confere, e o único owner não
   consegue se rebaixar. O admin vê a contagem de membros pelo embed `organizacao_membros(count)`.
3. **Clientes e obras.** Cadastro de cliente (documento, UF e e-mail vazio normalizados), busca com
   `.or(ilike)`, obra com embed do cliente e lista de obras do cliente. O viewer recebe 42501 ao tentar
   escrever, e a outra organização não vê nem altera nada.
4. **Orçamento.**
   - Criação com data-base demo e BDI TCU; o BDI do banco é igual ao `calcularBdi()`.
   - A etapa padrão "1 – Serviços preliminares" é criada; depois, etapas, subetapa e itens de
     composição, insumo e item livre (`fn_buscar_referencias` por texto e por código).
   - Edição inline: o resultado do trigger é igual ao `calcularItem()`. Custo manual também funciona.
   - Memória de cálculo: a soma das linhas vira a quantidade do item.
   - Troca de BDI e recálculo: os totais de itens, etapas e orçamento são iguais ao
     `totalizarOrcamento()`, e o resumo sintético soma 100%.
   - BDI diferenciado por item; cotação via `upsert` com `onConflict` substituindo o preço SINAPI, e a exclusão volta ao preço anterior.
   - Composição analítica e itens da composição (embeds com dica de FK).
   - Mover item (`fn_orcamento_mover`, posição 1-based) e renumeração.
   - Curva ABC de serviços e de insumos, com acumulado de 100%.
   - Cronograma físico-financeiro, cuja soma é igual ao total do orçamento.
   - Medição: exige orçamento em revisão; `upsert` de itens e remoção com quantidade 0; resumo; ao
     fechar, os itens ficam somente leitura.
   - Mão de obra: equipe, membros, resumo e horas.
   - Honorários: valores iguais a `valorDisciplina()`/`totalHonorarios()`.
   - Duplicar versão: copia EAP, itens, BDIs e memórias.
   - Trocar data-base para desonerado; orçamento aprovado fica somente leitura.
   - Dashboard.
5. **Referências próprias.** Insumo próprio e **composição própria pela nova RPC atômica**:
   - criação e edição;
   - um item inválido desfaz tudo;
   - o custo aparece na busca;
   - a outra organização não vê nem edita.

   Também cobre duplicar encargos sociais para a organização.
6. **Importação SINAPI.** Uma planilha de 2.302 linhas é gerada e passa por ida e volta em XLSX real
   (SheetJS). Em seguida passa pelo parser do front (`detectarLinhaCabecalho`, `detectarTipo`,
   `sugerirMapeamento`, `extrair`) e por `executarImportacao` em **3 lotes** (1000 + 1000 + 301 linhas
   válidas). A linha sem preço é rejeitada no parser, a data-base é publicada e um código do seed vira
   oficial. Depois vêm as composições sintéticas e o analítico com cabeçalhos; o editor usa a nova
   data-base oficial. Um não-admin recebe 42501.
7. **RLS entre organizações pelo PostgREST.** Em 12 tabelas a organização B lê 0 linhas da A. RPCs de
   leitura e cálculo, duplicação, exclusão, `listar_membros` e `fn_dashboard_resumo` também são negados.
   O viewer lê, mas não altera nem recalcula.
8. **Storage** (`enviarImagem`/`urlAssinada`). Upload em `logos/{org}/logo.png`, URL assinada baixando
   os mesmos bytes, e upsert. A outra organização não envia nem assina URL. Formato inválido é barrado no front.
9. **Repetição de todos os `select` extraídos de `src/**`** contra o PostgREST real, com os filtros
   estáticos: **nenhum rejeitado**. Numéricos chegam como `number`.
10. **Segurança e administração.**
    - O usuário não se promove por `PATCH profiles`, não altera o perfil de outro e não lê nem forja auditoria.
    - Perfil e tema são salvos pelo hook.
    - **Cadastro fechado**: a mensagem que chega ao front é verificada (§4, item 4). O convidado ainda
      consegue se cadastrar com o cadastro fechado.
    - Usuário bloqueado perde o acesso mesmo com a sessão aberta, e o recupera ao ser reativado.
    - Organização bloqueada fica somente leitura.
    - Revogar convite e remover membro cortam o acesso.

A suíte pode ser repetida: os e-mails levam um sufixo por rodada. Sem `db reset`, o primeiro admin é
promovido pelo `service_role`.

### 2.3 E2E de navegador (`scripts/e2e/rodar.mjs`)

**Semeadura.** Pelo supabase-js são criados: admin, usuária, organização, 2 clientes, 2 obras, um
orçamento com 3 etapas, subetapa, 7 itens e memória, cronograma, uma versão aprovada com medição,
equipe, honorário, insumo próprio e composição própria (pela nova RPC).

**Navegação.** Login pela tela, depois **30 telas** como usuária e **7 telas de administração**, em tema
claro e escuro: painel; obras e detalhe; orçamentos; as 10 abas do orçamento e a medição; consulta
SINAPI; composição; composições próprias (lista, edição e nova); insumos próprios; encargos e detalhe;
honorários e editor; clientes e detalhe; organização e equipe; perfil; 404; e o admin completo.

Em cada tela o script registra erros e avisos de console, exceções, respostas HTTP ≥ 400 do Supabase,
falhas de rede, redirecionamentos inesperados e alertas de erro. **Nenhum foi registrado.**

**Interações:**

- Senha errada mostra "E-mail ou senha incorretos.".
- Edição da quantidade na planilha ("12,5" + Enter): o PATCH é gravado, o total do item é igual a
  quantidade × preço, o recálculo é consolidado e o total novo aparece na tela.

**Responsividade a 390 px.** Painel, planilha, obras, BDI e clientes: nenhum estouro horizontal em
`html`, `main` ou `header`.

**Impressão.** As 8 rotas `/imprimir/...` são abertas com `media: print`. Para sintético, cronograma
(paisagem) e medição são gerados PDF e screenshot.

**Screenshots.** 32 em claro e escuro, mais as de celular e impressão, em `test-results/e2e/` (ignorado
pelo git), junto com o `relatorio.json`.

**Avaliação visual.** Tipografia, tokens e contraste estão consistentes nos dois temas. A planilha densa
segue o DESIGN.md. Os relatórios de impressão têm cabeçalho, faixa de "dados de exemplo", carimbo
técnico e rodapé com data-base. O layout de celular estava quebrado (§4, item 1).

### 2.4 Testes de componente novos (vitest + Testing Library)

| Arquivo | Casos |
|---|---|
| `src/pages/auth/LoginPage.test.tsx` | 5: validação zod, erro do Auth, redirecionamento para `state.from`, sessão ativa e mostrar senha |
| `src/pages/orcamentos/OrcamentoAnaliticoPage.test.tsx` | 7: EAP numerada; totais iguais a `totalizarOrcamento()`; edição inline com valores otimistas de `calcularItem()` e recálculo agendado; Esc desfaz; custo editável só em item livre ou manual; filtro sem acento; modo somente leitura; nova etapa |
| `src/pages/orcamentos/OrcamentoBdiPage.test.tsx` | 5: BDI ao vivo; gravação dos 10 parâmetros; preset igual ao gravado (regressão do item 3); tributos ≥ 100%; somente leitura |
| `src/pages/admin/AdminSinapiImportarPage.test.tsx` | 4: leitura, detecção, metadados pelo nome e prévia com erros; envio com UF, mês, regime e publicação; falha do servidor; planilha vazia |
| `src/test/contrato.test.ts` | 3: parser de `select` do verificador |
| `supabase/tests/orcamento/orc_70_composicao_propria.test.sql` | 24: RPC 0030 (criação, edição, atomicidade, validações, permissões por papel e organização, pendente, anon) |

## 3. Compatibilidade com Postgres 15

As 23 migrações e o seed rodam limpos no Postgres 15.8 do Supabase (`db reset`). As 416 asserções SQL
passam em PG 15.8, PG 16.15 e no PGlite. Não há recurso exclusivo de PG 16 ou superior; o
`NULLS NOT DISTINCT` usado funciona no 15.

## 4. Bugs encontrados e correções

| # | Onde | Problema | Correção |
|---|---|---|---|
| 1 | `AppShell`/`Topbar` (layout) | Abaixo de 768 px a sidebar de 232 px continuava fixa. O conteúdo ficava espremido em cerca de 150 px: KPIs cortados ("R$ 202.") e a topbar sem o usuário. | Em telas estreitas a sidebar vira gaveta (botão "Abrir menu", fundo escurecido, fecha com Esc ou ao navegar). A busca rápida fica oculta e o padding do conteúdo cai para 12 px. |
| 2 | `PageHeader` | O contêiner das ações usava `shrink-0` e estourava a largura no celular (botão "Status" cortado). | `max-w-full`: as ações passam a quebrar linha. |
| 3 | `OrcamentoBdiPage` | Ao aplicar um preset TCU igual ao valor gravado, o botão "Salvar e recalcular" ficava habilitado e indicava alteração. Causa: `JSON.stringify` com ordens de chave diferentes entre `presetTcu()` e `params()`. | Comparação campo a campo. Há teste de regressão, que falha com o código antigo. |
| 4 | `api/core/auth.ts` | Com `cadastro_aberto = false`, o `handle_new_user` recusa o cadastro, mas o GoTrue devolve um 500 genérico "Database error saving new user". A tela mostrava essa mensagem crua, em inglês. | Tradução para "Não foi possível criar a conta: o cadastro está fechado. Solicite um convite ao administrador." Coberto pela integração com o GoTrue real. |
| 5 | Composição própria | Salvar cabeçalho e itens em 3 requisições não era atômico: uma falha no insert deixava a composição sem itens (pendência registrada pelo FRONTEND-2). | RPC `fn_composicao_propria_salvar` (0030) e o hook `useSalvarComposicaoPropria` passou a usá-la. 24 casos SQL e o fluxo de integração cobrem a mudança. |
| 6 | `supabase/config.toml` | `supabase start` abortava porque o container do Realtime falha em host sem IPv6 (`eafnosupport`), e o app nem usa Realtime. Além disso, o CLI 3.x (o atual no npm) recusa a seção `[inbucket]` ("no longer supported"). | `[realtime] enabled = false`. A seção do servidor de e-mail foi removida (os padrões valem no CLI 2.x e no 3.x; validado com 2.54.11 e 3.2.0). |
| 7 | `supabase/tests/orcamento/orc_run.mjs` | O runner só aplicava migrações até 0029, então correções na faixa 0030+ ficariam fora dos testes. | Passa a aplicar todas as migrações. |
| 8 | Testes | Os runners SQL exigiam instalar o PGlite fora do projeto. | `@electric-sql/pglite` virou devDependency; os scripts npm foram integrados ao `test:all`. |

Nenhuma divergência de contrato foi encontrada entre o frontend e o banco: tabelas, colunas, embeds,
parâmetros de RPC, tipos de retorno e RLS batem. As mudanças de contrato foram registradas em
`CONTRATO_ALTERACOES.md` (seção TESTES).

## 5. O que não foi testado (e por quê)

- **E-mails** (confirmação de cadastro, recuperação e redefinição de senha, links de convite por e-mail):
  o mailpit foi desligado para o stack subir rápido, e o projeto usa `enable_confirmations = false`.
  As telas de recuperação e redefinição de senha não entraram no roteiro E2E.
- **Supabase na nuvem** (`supabase db push`, URLs de redirecionamento, limites de taxa de produção):
  só o stack local foi usado. A versão do Postgres é a mesma (15).
- **Outros navegadores** (Firefox, Safari, mobile real): só Chromium headless. O seletor de data nativo
  aparece como mm/dd/aaaa no headless por causa da localização do Chromium, não do app.
- **Realtime e Edge Functions:** não são usados pelo app.
- **Carga e volume pela API:** o desempenho do recálculo com mais de 1.000 itens é coberto pela suíte
  SQL (`orc_60`), não pelo navegador. **Risco anotado, não corrigido:** o PostgREST está com
  `max_rows = 5000`. Um orçamento com mais de 5.000 itens viria truncado no editor, porque
  `useItens` não pagina.
- **Uploads grandes de planilha** (dezenas de MB) e cancelamento no meio do envio pelo navegador: o
  cancelamento só tem cobertura indireta. Os lotes foram testados com 2.302 linhas.
- **Acessibilidade** com leitor de tela: só a navegação por rótulos/ARIA usada nos testes.
- **Instabilidade observada uma vez no E2E:** numa das primeiras rodadas, a primeira edição de
  quantidade digitada logo após o carregamento da planilha não foi gravada. Não se repetiu em quatro
  rodadas completas depois que o script passou a esperar o campo estar visível. O script mantém uma
  nova tentativa e registra no `relatorio.json` quando a primeira falha.

## 6. Como reproduzir

```bash
npm ci
npm test && npm run test:db && npm run test:contrato           # sem Docker
SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io \
  supabase start -x studio,imgproxy,edge-runtime,logflare,vector,postgres-meta,supavisor,mailpit
npm run test:db:pg                                             # suítes SQL no PG 15 do container
npm run test:integracao -- --reset                             # db reset + fluxos com hooks reais
npm run test:e2e                                               # Playwright (Chromium)
npm run test:all                                               # tudo
```

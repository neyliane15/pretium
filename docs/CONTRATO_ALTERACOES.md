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

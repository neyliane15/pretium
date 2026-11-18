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

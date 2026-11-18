# Pretium — Design System

> Software técnico premium para orçamento de obras: denso, preciso, calmo. A linguagem visual vem
> da **prancha técnica** (filetes finos, cantoneiras, malha milimetrada, rótulos em caixa-alta mono)
> e da **sinalização de obra** (laranja de segurança como acento, amarelo de sinalização pontual,
> asfalto/grafite e azul-petróleo como bases, cinza-concreto nos neutros).

Implementação: tokens em `src/styles/index.css` (CSS variables em canais RGB) → mapeados em
`tailwind.config.ts`. Componentes em `src/components/ui/*` (API pública em `index.ts`).
**Nunca** use cores hex ou classes de paleta padrão do Tailwind (`gray-500`, `orange-600`…) nas
telas — somente os tokens abaixo.

---

## 1. Cores

### 1.1 Paleta de marca

| Nome | Hex | Uso |
|---|---|---|
| Laranja-obra | `#F26B1D` | marca, logo, filetes, foco, indicador ativo, gráficos série 1 |
| Laranja-obra profundo | `#C2480C` | botão primário no claro (4,97:1 com branco), links |
| Amarelo-sinalização | `#F5B800` | destaque secundário, selo "Exemplo", faixas de alerta — **sempre com texto grafite** |
| Azul-petróleo | `#102E38` | sidebar, favicon, série 2 dos gráficos |
| Grafite/asfalto | `#1C2023` / `#1F2428` | texto principal, haste do logo |
| Concreto | `#F4F3F0` → `#C7C4BC` | fundos e linhas |

### 1.2 Tokens semânticos

| Token (Tailwind) | CSS var | Claro | Escuro | Uso |
|---|---|---|---|---|
| `bg-bg` | `--c-bg` | `#F4F3F0` | `#121518` | fundo da aplicação |
| `bg-surface` | `--c-surface` | `#FFFFFF` | `#181C20` | cards, tabelas, modais |
| `bg-surface-2` | `--c-surface-2` | `#FAF9F7` | `#1E2328` | cabeçalho de tabela, rodapés, zebra |
| `bg-sunken` | `--c-sunken` | `#EEEDE9` | `#0E1113` | campos somente-leitura, trilhos, linhas de etapa |
| `bg-overlay` | `--c-overlay` | `#14181B` | `#000000` | backdrop de modal (usar `/50`) |
| `border-border` | `--c-border` | `#DEDCD6` | `#2C333A` | bordas padrão 1px |
| `border-border-strong` | `--c-border-strong` | `#C7C4BC` | `#3B444C` | campos, cabeçalho de tabela, cantoneiras |
| `border-grid` | `--c-grid` | `#EAE8E3` | `#242A30` | linhas internas de tabela, malha |
| `text-fg` | `--c-fg` | `#1C2023` | `#E8E6E1` | texto principal (15,9:1 / 13,7:1) |
| `text-fg-muted` | `--c-fg-muted` | `#5B6166` | `#A3A7AA` | secundário (6,3:1 / 7,1:1) |
| `text-fg-subtle` | `--c-fg-subtle` | `#6B7075` | `#858B90` | rótulos, placeholders (5,0:1 / 4,6:1) |
| `text-brand` / `bg-brand` | `--c-brand` | `#F26B1D` | `#FF7A2F` | acento — **não usar para texto corrido no claro** (3,05:1) |
| `bg-primary` | `--c-primary` | `#C2480C` | `#FF7A2F` | botão primário |
| `bg-primary-hover` | `--c-primary-hover` | `#A93E0A` | `#FF9152` | hover do primário |
| `text-primary-fg` | `--c-primary-fg` | `#FFFFFF` | `#14110F` | texto sobre primário (4,97:1 / 7,2:1) |
| `bg-primary-soft` | `--c-primary-soft` | `#FDECE0` | `#3A2418` | linha selecionada, realce |
| `bg-accent` | `--c-accent` | `#F5B800` | `#FFC220` | amarelo de sinalização |
| `text-accent-fg` | `--c-accent-fg` | `#1C2023` | `#14110F` | texto sobre amarelo (9,2:1) |
| `bg-accent-soft` | `--c-accent-soft` | `#FFF6D6` | `#342B10` | fundos de aviso |
| `petrol` / `petrol-2` | `--c-petrol` | `#102E38` / `#17404D` | `#4FB8D4` / `#17404D` | marca secundária |
| `success` / `-soft` | | `#1E7A45` / `#E2F3E9` | `#4CC38A` / `#143022` | aprovado, concluído |
| `warning` / `-soft` | | `#8A5A00` / `#FFF4CC` | `#FFB020` / `#33280E` | pendente, atenção |
| `danger` / `-soft` | | `#C8312B` / `#FBE7E5` | `#F07067` / `#3A1A18` | erro, bloqueado, excluir |
| `info` / `-soft` | | `#1B6A86` / `#E1F0F5` | `#4FB8D4` / `#112D36` | informação, em revisão |
| `ring` | `--c-ring` | `#F26B1D` | `#FF7A2F` | anel de foco |
| `sidebar` | `--c-sidebar` | `#102E38` | `#0D171C` | barra lateral (sempre escura) |
| `sidebar-fg` / `-muted` | | `#E8E6E1` / `#9FB4BA` | `#E8E6E1` / `#8CA0A7` | texto da sidebar (11,5:1 / 6,6:1) |
| `sidebar-border` | | `#1E4856` | `#1E2C33` | divisórias da sidebar |
| `chart-1…6` | | laranja, petróleo, amarelo, concreto escuro, petróleo claro, concreto | variantes acesas | séries de gráficos, nessa ordem |

Opacidade: todos os tokens aceitam `/<alpha>` (`bg-primary-soft/60`, `ring-ring/25`).

### 1.3 Regras de uso de cor

1. Laranja é **acento**, não fundo: botão primário, item ativo, filete, foco, 1ª série de gráfico.
   No máximo **um** botão primário por área visível.
2. Amarelo só com texto grafite. Reservado a: selo "Exemplo" (dados demo), faixas de alerta,
   classe B da curva ABC.
3. Curva ABC: A = `chart-1` (laranja), B = `chart-3` (amarelo), C = `chart-6` (concreto).
4. Valores negativos/glosas em `text-danger`; nunca só por cor — prefixar com "−".
5. Status sempre com `<Badge>` + texto (nunca só um ponto colorido).

### 1.4 Tema escuro

`<html data-theme="dark">`. O `ThemeProvider` e um script inline no `index.html` aplicam o tema
(preferência em `localStorage['pretium.tema']`: `light` | `dark` | `system`). Tailwind `dark:` está
ligado ao seletor `[data-theme="dark"]`, mas **prefira tokens** (que já trocam sozinhos) a `dark:`.

## 2. Tipografia

| Família | Token | Uso |
|---|---|---|
| Inter 400/500/600/700 | `font-sans` | UI e texto |
| Space Grotesk 500/600/700 | `font-display` | títulos (h1–h4), nomes de cards, wordmark |
| JetBrains Mono 400/500/600 | `font-mono` / `.num` | números, códigos SINAPI, rótulos técnicos |

Base: `html { font-size: 13px }` (1rem = 13px). Escala (px absolutos):

| Classe | Tamanho / altura | Uso |
|---|---|---|
| `text-2xs` | 10/14, tracking 0.04em | rótulos caixa-alta (`th`, eyebrow, KPI label) |
| `text-xs` | 11/16 | hints, metadados, badges md |
| `text-sm` | 12/18 | **tabelas**, descrições |
| `text-base` | 13/20 | corpo, controles |
| `text-md` | 14/20 | títulos de card |
| `text-lg` | 16/24 | títulos de modal |
| `text-xl` | 18/26 | títulos de tela de auth |
| `text-2xl` | 22/30 | título de página, valor de KPI |
| `text-3xl` | 28/36 | números-herói (raro) |

Regras: números de dinheiro/quantidade sempre `.num` (mono, `tabular-nums`, zero cortado) e
alinhados à direita; códigos SINAPI em `font-mono text-xs`; rótulos técnicos em
`font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle`. Pesos: 400 texto, 500 ênfase,
600 títulos/totais. Nunca usar 700+ em texto corrido.

## 3. Espaçamento e grade

Escala Tailwind padrão (4px). Ritmo vertical recomendado: 4 / 8 / 12 / 16 / 24.

| Elemento | Medida |
|---|---|
| Topbar | 48px (`h-topbar`) |
| Sidebar | 232px (`w-sidebar`), recolhida 56px |
| Conteúdo | `max-w-[1600px] px-6 py-5` |
| Controles | 30px (`h-control`), 24px `sm`, 36px `lg` |
| Linha de tabela | 28px padrão, 24px `compact` (planilha do orçamento), 36px `comfortable` |
| Padding de card | 16px; cabeçalho 10px × 16px |
| Gap de formulário | 12px vertical, 16px entre colunas |

### 3.1 Telas estreitas (< 768px, `md`)

Validado a 390px (celular). Nenhuma tela pode gerar rolagem horizontal do documento.

- **Sidebar vira gaveta**: some do fluxo e abre sobre o conteúdo pelo botão "Abrir menu" (ícone de
  hambúrguer à esquerda da Topbar), com fundo escurecido; fecha com Esc, clique no fundo ou ao navegar.
- **Topbar**: a busca rápida (Ctrl K) fica oculta; seletor de organização e usuário permanecem.
- **Conteúdo**: padding cai para 12px; ações do `PageHeader` quebram linha (`max-w-full`).
- **Tabelas largas** (planilha, medição, honorários, admin) rolam **dentro** do próprio contêiner;
  células de código (`Td mono`) e a etiqueta de data-base não quebram linha. Tabelas de edição densa
  podem fixar `min-w-[…]` para não espremer os campos.
- **KPIs** (`Stat`): valor em `text-lg` no celular e `text-2xl` a partir de `sm`, sem quebra de linha.
- **Faixa de dados de exemplo**: no celular mostra só o selo "DADOS DE EXEMPLO" (e o atalho do admin);
  a frase explicativa aparece a partir de `sm`.

## 4. Bordas, raios, sombras

- **Bordas**: sempre 1px (`border`). Padrão `border-border`; controles e cabeçalhos
  `border-border-strong`; linhas internas `border-grid`.
- **Raios** (sutis): `rounded-xs` 2px (checkbox), `rounded-sm` 3px (badge, item de menu),
  `rounded` 4px (**padrão**: botões, campos, cards), `rounded-md` 5px, `rounded-lg` 8px (raro).
  Nada de pílulas exceto avatares/pontos.
- **Sombras** discretas: `shadow-xs` (cards, controles), `shadow-sm`, `shadow-md` (toasts,
  menus), `shadow-lg` (modais). No escuro as sombras viram mais densas e as bordas carregam a forma.

### 4.1 Detalhes de prancha técnica (assinatura visual)

| Utilitário | Efeito | Onde usar |
|---|---|---|
| `.corner-marks` | cantoneiras 8px (sup-esq e inf-dir) em `border-strong` | KPIs, EmptyState, cabeçalho de documento |
| `.corner-marks-brand` | cantoneiras em laranja | modal, card de auth, KPI em destaque |
| `.accent-rule` | filete laranja 28×2px no topo-esquerdo | card de seção principal |
| `.blueprint-grid` | malha 24px em `--c-grid` | telas de auth, estados vazios, 404 |
| `.hazard-stripe` | zebrado amarelo/grafite 45° | faixa "AMBIENTE COM DADOS DE EXEMPLO" (selo 24×12px) e faixa dos relatórios impressos |
| `.num` | mono tabular | todo número |

Use com parcimônia: no máximo um elemento com cantoneiras laranja por tela.

## 5. Componentes (API em `src/components/ui/index.ts`)

| Componente | Variantes / props-chave | Notas |
|---|---|---|
| `Button` | `variant`: primary · secondary (padrão) · ghost · danger · accent · link; `size`: sm · md · lg; `loading`, `leftIcon`, `rightIcon`, `block` | ícones lucide 16px (14px em sm); `type="button"` por padrão |
| `IconButton` | `label` obrigatório (aria + tooltip), `icon` | quadrado, ghost por padrão |
| `Input` / `Textarea` | `size`, `prefix`, `suffix`, `numeric`, `invalid` | foco: borda laranja + anel 25% |
| `NumberInput` | `value: number \| null`, `onChange(n)`, `decimals`, `min`, `max` | aceita "1.234,56"; confirma no blur/Enter; Esc desfaz |
| `Select` | `options`, `placeholder`, `size` | nativo estilizado (rápido em tabelas) |
| `Checkbox` | `label`, `description` | |
| `Field` | `label`, `hint`, `error`, `required`, `labelAside`; filho render-prop `(p) => <Input {...p}/>` | liga `id`, `aria-describedby`, `aria-invalid` |
| `Card` (+`CardHeader`, `CardBody`, `CardFooter`) | `cornerMarks` (true \| 'brand'), `accent`, `flush` | header: `eyebrow`, `title`, `description`, `actions` |
| `Table` (+`THead`,`TBody`,`TFoot`,`Tr`,`Th`,`Td`,`TableMessage`) | `density`, `striped`, `stickyHeader`, `gridLines`; `Tr`: `selected`, `interactive`, `group` (1–3 níveis da EAP); `Th`: `numeric`, `sort`, `onSort`, `width`; `Td`: `numeric`, `mono`, `muted`, `truncate` | 12px; cabeçalho caixa-alta 10px; totais em `TFoot` |
| `Badge` / `DemoBadge` | neutral · brand · accent · success · warning · danger · info · outline · demo; `dot`, `size` | `DemoBadge` = selo amarelo "Exemplo" |
| `Tabs` / `TabLinks` | `items`, `value`, `onChange`, `variant` line · segmented | `TabLinks` usa rotas (NavLink) |
| `Modal` / `ConfirmDialog` | `size` sm · md · lg · xl · full; `footer`; `dismissable` | portal, trap de foco, Esc, `data-autofocus` |
| `Toast` | `useToast().success/error/toast({...})` | canto inferior direito, barra lateral colorida |
| `Spinner` / `LoadingBlock` | `size` | |
| `EmptyState` | `icon`, `title`, `description`, `action`, `variant` framed · inline | malha + cantoneiras |
| `Stat` | `label`, `value`, `hint`, `icon`, `delta`, `highlight` | KPI |
| `PageHeader` | `title`, `description`, `breadcrumbs`, `actions`, `badges`, `children` | padrão de toda página |
| `Skeleton` | `className` | |
| `Logo` (`components/brand`) | `variant` full · mark, `height`, `divider` | usa `currentColor` + token brand |

Layout (`components/layout`): `AppShell` (sidebar + topbar + `<Outlet/>`), `Sidebar`, `Topbar`,
navegação em `nav.ts`.

**Componentes a criar pelo FRONTEND-1** (mesma linguagem): `Tooltip`, `DropdownMenu`
(menu de ações de linha e usuário), `Combobox` (busca com teclado, usado pela busca SINAPI do F2),
`Drawer` (painel lateral direito 480px — memória de cálculo, composição analítica), `Pagination`,
`DateInput`, `FileDrop` (importador), `Progress`, `Avatar`, `Kbd`, `Alert` (faixa inline).
Assinaturas propostas em `docs/DIVISAO_TRABALHO.md` §4.

### 5.1 Planilha do orçamento (padrão de tabela densa — F2)

- `Table density="compact" gridLines stickyHeader`, colunas: Item (mono) · Fonte · Código (mono) ·
  Descrição (truncate + title) · Und · Quant. · Custo unit. · BDI % · Preço unit. · Total · % .
- Linhas de etapa: `Tr group={nivel}` com total à direita; itens indentados 12px por nível.
- Edição inline: célula vira `NumberInput size="sm"` no foco; Enter confirma e desce;
  Tab avança; Esc cancela.
- Itens `sem_preco`: ícone `AlertTriangle` em `text-warning` + tooltip.
- Rodapé `TFoot`: Total sem BDI · BDI · **Total com BDI** (600, `text-md`).

## 6. Estados

| Estado | Tratamento |
|---|---|
| hover | botões: escurece 1 passo (`primary-hover`) ou `bg-surface-2`/`bg-sunken`; linhas: `bg-primary-soft/40` |
| foco | **sempre visível**: `ring-2 ring-ring` (laranja) com offset 1–2px, ou `outline 2px` global em `:focus-visible` |
| ativo/selecionado | `bg-primary-soft` + texto `fg`; abas com sublinhado laranja 2px; sidebar com barra laranja 3px à esquerda |
| disabled | `opacity-50`, `pointer-events-none` (botões) / `bg-sunken text-fg-subtle cursor-not-allowed` (campos) |
| inválido | `aria-invalid` → borda `danger` + mensagem em `text-danger text-xs` com `role="alert"` |
| carregando | `Spinner` no botão (`loading`), `Skeleton` em listas, `LoadingBlock` em painéis |
| somente leitura (viewer / orçamento aprovado) | campos `readOnly` (fundo `sunken`), ações de edição ocultas, faixa `Alert` explicando |

## 7. Acessibilidade

- Contraste AA verificado (valores na tabela §1.2). `brand` (#F26B1D) **não** é usado para texto
  sobre branco; para texto/link use `text-primary` (#C2480C, 4,97:1).
- Foco visível em todo elemento interativo; nunca `outline: none` sem substituto.
- Ícones decorativos com `aria-hidden`; `IconButton` exige `label`.
- Formulários via `Field` (rótulo ligado, descrição e erro anunciados).
- Modal: `role="dialog"`, `aria-modal`, trap de foco, Esc, retorno de foco.
- Tabelas: `<th scope="col">`, `aria-sort` nas ordenáveis.
- Navegação por teclado em `Tabs` (←/→) e na planilha (Enter/Tab/Esc).
- Respeitar `prefers-reduced-motion` em animações novas (as atuais duram ≤160ms).
- Idioma `lang="pt-BR"`; números com `Intl` pt-BR (`src/lib/format.ts`).

## 8. Impressão

`@media print`: fonte 10pt, fundo branco, `.no-print` oculta sidebar/topbar/ações, `.print-break`
força quebra de página, A4 com margens 14×12mm. Relatórios usam tokens neutros e logo da
organização no cabeçalho; dados demo recebem faixa "DOCUMENTO GERADO COM DADOS DE EXEMPLO".

## 9. Marca

Arquivos em `public/`: `logo.svg` (horizontal, fundo claro), `logo-dark.svg` (fundo escuro),
`logo-mark.svg` / `logo-mark-dark.svg` (símbolo), `favicon.svg` (símbolo em ladrilho petróleo).
Conceito: o "P" é um **pilar sobre sapata** (haste grafite) unido a uma **viga em perfil
chanfrado** (bojo laranja). Wordmark "PRETIUM" monolinha geométrica, com chanfros que ecoam o
perfil. Área de respiro mínima = altura da sapata × 2; tamanho mínimo do símbolo 16px; não
recolorir a viga com outra cor que não `brand`.

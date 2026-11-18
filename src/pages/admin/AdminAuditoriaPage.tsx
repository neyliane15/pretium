import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Eraser, Eye, Search } from 'lucide-react';
import {
  Badge, Button, DateInput, Drawer, EmptyState, Field, IconButton, Input, Pagination, Select, Skeleton, TBody, THead, Table, TableMessage, Td, Th, Tr,
  type BadgeVariant,
} from '@/components/ui';
import { useAuditoria, type FiltrosAuditoria } from '@/api/core/admin';
import { formatDataHora } from '@/lib/format';
import type { AuditoriaLog, Json } from '@/types/database';
import { EstadoErro } from '@/pages/_shared/EstadoErro';

const PAGE = 50;

const ACOES: { value: string; label: string }[] = [
  { value: '', label: 'Todas as ações' },
  { value: 'insert', label: 'Inclusão' },
  { value: 'update', label: 'Alteração' },
  { value: 'delete', label: 'Exclusão' },
  { value: 'login', label: 'Acesso' },
  { value: 'aprovar_usuario', label: 'Aprovação de usuário' },
  { value: 'bloquear_usuario', label: 'Bloqueio de usuário' },
  { value: 'alterar_papel', label: 'Alteração de papel' },
  { value: 'importar_sinapi', label: 'Importação SINAPI' },
  { value: 'config', label: 'Configuração' },
];
const ENTIDADES = ['', 'profiles', 'organizacoes', 'organizacao_membros', 'convites', 'clientes', 'obras', 'orcamentos', 'orcamento_itens', 'configuracoes', 'sinapi', 'datas_base', 'auth'];

const BADGE_ACAO: Record<string, BadgeVariant> = { insert: 'success', update: 'info', delete: 'danger', login: 'neutral', bloquear_usuario: 'danger', aprovar_usuario: 'success', importar_sinapi: 'brand', config: 'warning' };
const rotuloAcao = (a: string) => ACOES.find((x) => x.value === a)?.label ?? a;

type Obj = Record<string, Json | undefined>;
const isObj = (v: Json | null | undefined): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const fmt = (v: Json | undefined) => (v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v));

/** Tabela campo a campo de dados_antes × dados_depois, destacando alterações. */
function Diff({ antes, depois }: { antes: Json | null; depois: Json | null }) {
  const a = useMemo<Obj>(() => (isObj(antes) ? antes : {}), [antes]);
  const d = useMemo<Obj>(() => (isObj(depois) ? depois : {}), [depois]);
  const chaves = useMemo(() => Array.from(new Set([...Object.keys(a), ...Object.keys(d)])).sort(), [a, d]);
  const [soAlterados, setSoAlterados] = useState(true);
  const mudou = (k: string) => fmt(a[k]) !== fmt(d[k]);
  const visiveis = chaves.filter((k) => !soAlterados || mudou(k) || !isObj(antes) || !isObj(depois));
  if (chaves.length === 0) return <p className="text-sm text-fg-muted">Sem dados registrados.</p>;
  return (
    <div className="flex flex-col gap-2">
      {isObj(antes) && isObj(depois) && (
        <label className="inline-flex items-center gap-2 self-end text-xs text-fg-muted">
          <input type="checkbox" checked={soAlterados} onChange={(e) => setSoAlterados(e.target.checked)} className="h-3 w-3 accent-[rgb(var(--c-primary))]" />
          Somente campos alterados
        </label>
      )}
      <Table density="compact" gridLines>
        <THead>
          <tr>
            <Th width={150}>Campo</Th>
            <Th>Antes</Th>
            <Th>Depois</Th>
          </tr>
        </THead>
        <TBody>
          {visiveis.map((k) => (
            <Tr key={k} className={mudou(k) ? 'bg-accent-soft/50' : undefined}>
              <Td mono className="align-top text-fg-muted">
                {k}
              </Td>
              <Td className={`break-all align-top font-mono text-xs ${mudou(k) && a[k] !== undefined ? 'text-danger' : 'text-fg-muted'}`}>{fmt(a[k]) || '—'}</Td>
              <Td className={`break-all align-top font-mono text-xs ${mudou(k) && d[k] !== undefined ? 'text-success' : 'text-fg-muted'}`}>{fmt(d[k]) || '—'}</Td>
            </Tr>
          ))}
          {visiveis.length === 0 && <TableMessage colSpan={3}>Nenhum campo alterado.</TableMessage>}
        </TBody>
      </Table>
    </div>
  );
}

const VAZIO: FiltrosAuditoria = { de: null, ate: null, usuario: '', entidade: '', acao: '', page: 1, pageSize: PAGE };

/** Auditoria: filtros por período, usuário, entidade e ação; diff antes/depois. Dono: FRONTEND-1. */
export default function AdminAuditoriaPage() {
  const [f, setF] = useState<FiltrosAuditoria>(VAZIO);
  const [usuario, setUsuario] = useState('');
  const [aberto, setAberto] = useState<AuditoriaLog | null>(null);
  const q = useAuditoria(f);

  useEffect(() => {
    const t = window.setTimeout(() => setF((x) => (x.usuario === usuario ? x : { ...x, usuario, page: 1 })), 300);
    return () => window.clearTimeout(t);
  }, [usuario]);

  const set = (p: Partial<FiltrosAuditoria>) => setF((x) => ({ ...x, ...p, page: 1 }));
  const linhas = q.data?.linhas ?? [];
  const filtrado = Boolean(f.de || f.ate || f.usuario || f.entidade || f.acao);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 items-end gap-2 rounded border border-border bg-surface p-3 shadow-xs md:grid-cols-3 xl:grid-cols-[150px_150px_1fr_200px_200px_auto]">
        <Field label="De">{(p) => <DateInput {...p} size="sm" value={f.de} max={f.ate ?? undefined} onChange={(de) => set({ de })} />}</Field>
        <Field label="Até">{(p) => <DateInput {...p} size="sm" value={f.ate} min={f.de ?? undefined} onChange={(ate) => set({ ate })} />}</Field>
        <Field label="Usuário (e-mail)">{(p) => <Input {...p} size="sm" prefix={<Search />} value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="parte do e-mail" />}</Field>
        <Field label="Entidade">
          {(p) => <Select {...p} size="sm" value={f.entidade} onChange={(e) => set({ entidade: e.target.value })} options={ENTIDADES.map((e) => ({ value: e, label: e || 'Todas as entidades' }))} />}
        </Field>
        <Field label="Ação">{(p) => <Select {...p} size="sm" value={f.acao} onChange={(e) => set({ acao: e.target.value })} options={ACOES} />}</Field>
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<Eraser />}
          disabled={!filtrado}
          onClick={() => {
            setUsuario('');
            setF(VAZIO);
          }}
        >
          Limpar
        </Button>
      </div>

      {q.isError ? (
        <EstadoErro erro={q.error} onRetry={() => void q.refetch()} />
      ) : !q.isLoading && linhas.length === 0 && !filtrado ? (
        <EmptyState icon={<ClipboardList />} title="Nenhum evento registrado" description="As alterações relevantes são gravadas automaticamente." />
      ) : (
        <>
          <Table striped density="compact" gridLines>
            <THead>
              <tr>
                <Th width={140}>Data/hora</Th>
                <Th width={220}>Usuário</Th>
                <Th width={150}>Ação</Th>
                <Th width={170}>Entidade</Th>
                <Th>Registro</Th>
                <Th width={40}>
                  <span className="sr-only">Detalhes</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {q.isLoading &&
                Array.from({ length: 8 }, (_, i) => (
                  <Tr key={i}>
                    <Td colSpan={6}>
                      <Skeleton className="h-3 w-1/2" />
                    </Td>
                  </Tr>
                ))}
              {!q.isLoading && linhas.length === 0 && <TableMessage colSpan={6}>Nenhum evento com estes filtros.</TableMessage>}
              {linhas.map((l) => (
                <Tr key={l.id} interactive onClick={() => setAberto(l)}>
                  <Td className="num text-xs">{formatDataHora(l.created_at)}</Td>
                  <Td truncate title={l.user_email ?? undefined}>
                    {l.user_email ?? <span className="text-fg-subtle">sistema</span>}
                  </Td>
                  <Td>
                    <Badge variant={BADGE_ACAO[l.acao] ?? 'outline'}>{rotuloAcao(l.acao)}</Badge>
                  </Td>
                  <Td mono>{l.entidade}</Td>
                  <Td truncate mono muted title={l.entidade_id ?? undefined}>
                    {l.entidade_id ?? '—'}
                  </Td>
                  <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                    <IconButton size="sm" label="Ver detalhes" icon={<Eye />} onClick={() => setAberto(l)} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pagination page={f.page} pageSize={PAGE} total={q.data?.total ?? 0} onChange={(page) => setF({ ...f, page })} itemLabel="eventos" />
        </>
      )}

      <Drawer
        open={Boolean(aberto)}
        onClose={() => setAberto(null)}
        width={640}
        eyebrow={aberto ? `Evento #${aberto.id}` : undefined}
        title={aberto ? `${rotuloAcao(aberto.acao)} · ${aberto.entidade}` : undefined}
        description={aberto ? `${formatDataHora(aberto.created_at)} · ${aberto.user_email ?? 'sistema'}` : undefined}
      >
        {aberto && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 rounded-sm border border-border font-mono text-2xs uppercase tracking-[0.08em]">
              {[
                ['Entidade', aberto.entidade],
                ['Registro', aberto.entidade_id ?? '—'],
                ['Organização', aberto.organizacao_id ?? '—'],
                ['Usuário', aberto.user_id ?? '—'],
              ].map(([k, v], i) => (
                <div key={k} className={`px-3 py-2 ${i % 2 === 0 ? 'border-r' : ''} ${i < 2 ? 'border-b' : ''} border-border`}>
                  <dt className="text-fg-subtle">{k}</dt>
                  <dd className="mt-0.5 break-all normal-case tracking-normal text-fg">{v}</dd>
                </div>
              ))}
            </dl>
            <section>
              <h3 className="mb-2 font-display text-md font-semibold">Alterações</h3>
              <Diff antes={aberto.dados_antes} depois={aberto.dados_depois} />
            </section>
            {aberto.detalhes !== null && (
              <section>
                <h3 className="mb-2 font-display text-md font-semibold">Detalhes</h3>
                <pre className="overflow-x-auto rounded-sm border border-border bg-sunken p-3 font-mono text-xs leading-5">{JSON.stringify(aberto.detalhes, null, 2)}</pre>
              </section>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

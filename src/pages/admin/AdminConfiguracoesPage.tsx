import { useEffect, useState, type ReactNode } from 'react';
import { Globe, Lock, Save } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardFooter, CardHeader, Checkbox, Field, Input, LoadingBlock, NumberInput, Select, Textarea, useToast } from '@/components/ui';
import { useConfiguracoesAdmin, useDefinirConfiguracao } from '@/api/core/configuracoes';
import { formatDataHora } from '@/lib/format';
import { UFS } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import type { Configuracao, Json } from '@/types/database';
import { EstadoErro } from '@/pages/_shared/EstadoErro';

interface Valores {
  admin_emails: string;
  aprovacao_obrigatoria: boolean;
  cadastro_aberto: boolean;
  uf_padrao: string;
  aviso_global: string;
  convite_validade_dias: number | null;
}

const ler = (rows: Configuracao[]): Valores => {
  const v = (k: string): Json | undefined => rows.find((r) => r.chave === k)?.valor;
  const emails = v('admin_emails');
  return {
    admin_emails: Array.isArray(emails) ? emails.filter((e): e is string => typeof e === 'string').join('\n') : '',
    aprovacao_obrigatoria: v('aprovacao_obrigatoria') !== false,
    cadastro_aberto: v('cadastro_aberto') !== false,
    uf_padrao: typeof v('uf_padrao') === 'string' ? (v('uf_padrao') as string) : 'RJ',
    aviso_global: typeof v('aviso_global') === 'string' ? (v('aviso_global') as string) : '',
    convite_validade_dias: typeof v('convite_validade_dias') === 'number' ? (v('convite_validade_dias') as number) : 7,
  };
};

const paraJson = (k: keyof Valores, x: Valores): Json => {
  switch (k) {
    case 'admin_emails':
      return Array.from(new Set(x.admin_emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)));
    case 'aviso_global':
      return x.aviso_global.trim() || null;
    default:
      return x[k] as Json;
  }
};

function Linha({ titulo, descricao, publica, children, meta }: { titulo: string; descricao: string; publica: boolean; children: ReactNode; meta?: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_360px]">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-base font-medium">{titulo}</h3>
          <Badge variant={publica ? 'info' : 'neutral'} className="gap-1">
            {publica ? <Globe className="h-2.5 w-2.5" aria-hidden /> : <Lock className="h-2.5 w-2.5" aria-hidden />}
            {publica ? 'Pública' : 'Restrita'}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm text-fg-muted">{descricao}</p>
        {meta && <p className="mt-1 font-mono text-2xs text-fg-subtle">{meta}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

/** Configurações globais (§5.2) via `admin_definir_configuracao`. Dono: FRONTEND-1. */
export default function AdminConfiguracoesPage() {
  const q = useConfiguracoesAdmin();
  const definir = useDefinirConfiguracao();
  const toast = useToast();
  const [v, setV] = useState<Valores | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (q.data) setV(ler(q.data));
  }, [q.data]);

  if (q.isLoading || (!v && !q.isError)) return <LoadingBlock />;
  if (q.isError || !v) return <EstadoErro erro={q.error} onRetry={() => void q.refetch()} />;

  const original = ler(q.data ?? []);
  const alteradas = (Object.keys(v) as (keyof Valores)[]).filter((k) => JSON.stringify(paraJson(k, v)) !== JSON.stringify(paraJson(k, original)));
  const meta = (k: string) => {
    const r = q.data?.find((x) => x.chave === k);
    return r ? `${k} · atualizado ${formatDataHora(r.updated_at)}` : `${k} · ainda não definido`;
  };
  const publica = (k: string, padrao: boolean) => q.data?.find((x) => x.chave === k)?.publica ?? padrao;
  const emailsInvalidos = v.admin_emails.split(/[\s,;]+/).filter((e) => e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));

  const salvar = async () => {
    setSalvando(true);
    try {
      for (const k of alteradas) await definir.mutateAsync({ chave: k, valor: paraJson(k, v) });
      toast.success('Configurações salvas', `${alteradas.length} ${alteradas.length === 1 ? 'chave alterada' : 'chaves alteradas'}.`);
    } catch (e) {
      toast.error('Não foi possível salvar', mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card flush accent>
      <CardHeader eyebrow="Sistema" title="Configurações globais" description="Valem para todas as organizações. Alterações ficam registradas na auditoria." />
      <CardBody className="divide-y divide-grid">
        <Linha titulo="Cadastro aberto" descricao="Permite que novas pessoas criem conta pela tela de cadastro." publica={publica('cadastro_aberto', true)} meta={meta('cadastro_aberto')}>
          <Checkbox checked={v.cadastro_aberto} onChange={(e) => setV({ ...v, cadastro_aberto: e.target.checked })} label="Aceitar novos cadastros" />
        </Linha>
        <Linha
          titulo="Aprovação obrigatória"
          descricao="Novas contas entram como pendentes e só acessam o sistema após aprovação de um administrador."
          publica={publica('aprovacao_obrigatoria', true)}
          meta={meta('aprovacao_obrigatoria')}
        >
          <Checkbox checked={v.aprovacao_obrigatoria} onChange={(e) => setV({ ...v, aprovacao_obrigatoria: e.target.checked })} label="Exigir aprovação" />
        </Linha>
        <Linha titulo="E-mails de administradores" descricao="Quem se cadastrar com estes e-mails vira administrador global automaticamente. Um por linha." publica={publica('admin_emails', false)} meta={meta('admin_emails')}>
          <Field error={emailsInvalidos.length ? `E-mail inválido: ${emailsInvalidos.join(', ')}` : null}>
            {(p) => <Textarea {...p} rows={3} className="font-mono text-xs" value={v.admin_emails} onChange={(e) => setV({ ...v, admin_emails: e.target.value })} placeholder="responsavel@empresa.com.br" />}
          </Field>
        </Linha>
        <Linha titulo="UF padrão" descricao="Sugerida em novas organizações e na importação SINAPI." publica={publica('uf_padrao', true)} meta={meta('uf_padrao')}>
          <div className="w-[120px]"><Select aria-label="UF padrão" value={v.uf_padrao} onChange={(e) => setV({ ...v, uf_padrao: e.target.value })} options={UFS.map((u) => ({ value: u, label: u }))} /></div>
        </Linha>
        <Linha titulo="Validade dos convites" descricao="Dias até um convite de organização expirar." publica={publica('convite_validade_dias', false)} meta={meta('convite_validade_dias')}>
          <div className="max-w-[140px]">
            <NumberInput aria-label="Validade em dias" value={v.convite_validade_dias} decimals={0} min={1} max={90} suffix="dias" onChange={(n) => setV({ ...v, convite_validade_dias: n })} />
          </div>
        </Linha>
        <Linha titulo="Aviso global" descricao="Faixa exibida no topo para todos os usuários (manutenção, novidades). Deixe vazio para ocultar." publica={publica('aviso_global', true)} meta={meta('aviso_global')}>
          <Field hint={`${v.aviso_global.length}/240`}>
            {(p) => <Input {...p} maxLength={240} value={v.aviso_global} onChange={(e) => setV({ ...v, aviso_global: e.target.value })} placeholder="Ex.: Manutenção programada sábado, 22h–23h." />}
          </Field>
        </Linha>
      </CardBody>
      <CardFooter>
        {alteradas.length > 0 && <span className="mr-auto text-xs text-fg-muted">{alteradas.length} alteração(ões) não salva(s)</span>}
        <Button variant="ghost" disabled={!alteradas.length || salvando} onClick={() => setV(original)}>
          Descartar
        </Button>
        <Button variant="primary" leftIcon={<Save />} loading={salvando} disabled={!alteradas.length || emailsInvalidos.length > 0} onClick={() => void salvar()}>
          Salvar configurações
        </Button>
      </CardFooter>
    </Card>
  );
}

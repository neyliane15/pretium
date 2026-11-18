import { useState } from 'react';
import { FilePlus2, Layers, Package } from 'lucide-react';
import { useAdicionarItem } from '@/api/orcamento/orcamentos';
import { useBuscarReferencias, type TipoBusca } from '@/api/orcamento/referencias';
import { Badge, Button, Combobox, DemoBadge, Field, Input, Modal, NumberInput, Select, Tabs, useToast } from '@/components/ui';
import { formatMoeda } from '@/lib/format';
import { LABEL_INSUMO_TIPO } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import type { OrcamentoItem, ReferenciaBusca } from '@/types/database';
import { Rotulo } from './comum';

/**
 * Barra de inclusão de itens: busca SINAPI/próprias (`fn_buscar_referencias`) com filtro de tipo,
 * etapa de destino e item livre.
 */
export function AdicionarItemBarra({
  orcamentoId, dataBaseId, etapas, etapaId, onEtapa, onAdicionado,
}: {
  orcamentoId: string;
  dataBaseId: string;
  etapas: { id: string; codigo: string; nome: string; nivel: number }[];
  etapaId: string;
  onEtapa: (id: string) => void;
  onAdicionado?: (item: OrcamentoItem) => void;
}) {
  const toast = useToast();
  const [tipo, setTipo] = useState<'todos' | 'composicao' | 'insumo'>('todos');
  const [termo, setTermo] = useState('');
  const tipoBusca: TipoBusca = tipo === 'todos' ? null : tipo;
  const busca = useBuscarReferencias(termo, dataBaseId, tipoBusca);
  const adicionar = useAdicionarItem(orcamentoId);
  const [livre, setLivre] = useState(false);
  const [dLivre, setDLivre] = useState({ descricao: '', unidade: 'UN', custo: null as number | null, quantidade: null as number | null });

  const add = async (r: ReferenciaBusca | null) => {
    if (!r || !etapaId) return;
    try {
      const item = await adicionar.mutateAsync({ etapaId, referenciaTipo: r.tipo, referenciaId: r.id, quantidade: 0 });
      toast.success('Item adicionado', `${r.codigo} – ${r.descricao.slice(0, 60)}`);
      onAdicionado?.(item);
    } catch (e) {
      toast.error('Não foi possível adicionar', mensagemErro(e));
    }
  };

  const addLivre = async () => {
    if (!dLivre.descricao.trim() || !dLivre.unidade.trim()) {
      toast.error('Informe descrição e unidade');
      return;
    }
    try {
      const item = await adicionar.mutateAsync({
        etapaId, referenciaTipo: 'livre', descricao: dLivre.descricao.trim(), unidade: dLivre.unidade.trim().toUpperCase(),
        custoUnitario: dLivre.custo ?? 0, quantidade: dLivre.quantidade ?? 0,
      });
      setLivre(false);
      setDLivre({ descricao: '', unidade: 'UN', custo: null, quantidade: null });
      onAdicionado?.(item);
    } catch (e) {
      toast.error('Não foi possível adicionar', mensagemErro(e));
    }
  };

  return (
    <div className="no-print mb-2 flex flex-wrap items-center gap-2 rounded border border-border bg-surface px-2.5 py-2 shadow-xs">
      <Rotulo className="shrink-0">Adicionar em</Rotulo>
      <div className="w-56 shrink-0">
        <Select size="sm" aria-label="Etapa de destino" value={etapaId} onChange={(e) => onEtapa(e.target.value)}
          options={etapas.map((e) => ({ value: e.id, label: `${' '.repeat(e.nivel - 1)}${e.codigo} ${e.nome}` }))} />
      </div>
      <Tabs size="sm" variant="segmented" aria-label="Tipo de referência" value={tipo} onChange={setTipo}
        items={[{ value: 'todos', label: 'Todos' }, { value: 'composicao', label: 'Composições', icon: <Layers /> }, { value: 'insumo', label: 'Insumos', icon: <Package /> }]} />
      <div className="min-w-[320px] flex-1">
        <Combobox<ReferenciaBusca>
          value={null}
          onChange={(r) => void add(r)}
          onSearch={setTermo}
          items={busca.data ?? []}
          loading={busca.isFetching}
          clearOnSelect
          size="sm"
          aria-label="Buscar serviço SINAPI ou próprio"
          disabled={!etapaId || adicionar.isPending}
          getKey={(r) => `${r.tipo}-${r.id}`}
          getLabel={(r) => `${r.codigo} ${r.descricao}`}
          placeholder="Código SINAPI ou descrição (ex.: 87503, alvenaria bloco cerâmico)…"
          emptyText={termo.trim().length < 2 ? 'Digite ao menos 2 caracteres' : 'Nada encontrado nesta data-base'}
          maxListHeight={380}
          listHeader={
            <div className="grid grid-cols-[52px_64px_1fr_40px_84px] gap-2 px-2 font-mono text-2xs uppercase tracking-[0.08em] text-fg-subtle">
              <span>Fonte</span><span>Código</span><span>Descrição</span><span>Und</span><span className="text-right">Custo</span>
            </div>
          }
          renderItem={(r) => (
            <div className="grid grid-cols-[52px_64px_1fr_40px_84px] items-center gap-2 text-sm">
              <span className="flex gap-1">
                <Badge variant={r.fonte === 'propria' ? 'brand' : 'outline'}>{r.fonte === 'propria' ? 'PRÓP.' : 'SINAPI'}</Badge>
              </span>
              <span className="font-mono text-xs text-fg-muted">{r.codigo}</span>
              <span className="min-w-0">
                <span className="line-clamp-2 leading-4">{r.descricao}</span>
                <span className="mt-0.5 flex items-center gap-1 text-2xs text-fg-subtle">
                  {r.tipo === 'composicao' ? 'Composição' : `Insumo · ${r.insumo_tipo ? LABEL_INSUMO_TIPO[r.insumo_tipo] : ''}`}
                  {r.is_demo && <DemoBadge className="ml-1" />}
                </span>
              </span>
              <span className="text-xs text-fg-subtle">{r.unidade}</span>
              <span className="num text-right text-xs">{formatMoeda(r.preco)}</span>
            </div>
          )}
        />
      </div>
      <Button size="sm" leftIcon={<FilePlus2 />} disabled={!etapaId} onClick={() => setLivre(true)}>Item livre</Button>

      <Modal open={livre} onClose={() => setLivre(false)} size="sm" title="Item livre" description="Serviço sem referência (custo digitado)."
        footer={<><Button onClick={() => setLivre(false)}>Cancelar</Button><Button variant="primary" loading={adicionar.isPending} onClick={() => void addLivre()}>Adicionar</Button></>}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Descrição" required className="col-span-3">{(p) => <Input {...p} data-autofocus value={dLivre.descricao} onChange={(e) => setDLivre({ ...dLivre, descricao: e.target.value })} />}</Field>
          <Field label="Unidade" required>{(p) => <Input {...p} value={dLivre.unidade} onChange={(e) => setDLivre({ ...dLivre, unidade: e.target.value })} />}</Field>
          <Field label="Quantidade">{(p) => <NumberInput {...p} decimals={4} value={dLivre.quantidade} onChange={(v) => setDLivre({ ...dLivre, quantidade: v })} min={0} />}</Field>
          <Field label="Custo unit. (R$)">{(p) => <NumberInput {...p} value={dLivre.custo} onChange={(v) => setDLivre({ ...dLivre, custo: v })} min={0} />}</Field>
        </div>
      </Modal>
    </div>
  );
}

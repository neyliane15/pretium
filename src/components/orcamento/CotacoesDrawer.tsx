import { useState } from 'react';
import { Tag, Trash2 } from 'lucide-react';
import { useCotacoes, useExcluirCotacao, useSalvarCotacao } from '@/api/orcamento/orcamentos';
import { useBuscarReferencias } from '@/api/orcamento/referencias';
import { Button, Combobox, Drawer, EmptyState, IconButton, Input, LoadingBlock, NumberInput, TBody, THead, Table, Td, Th, Tr, useToast } from '@/components/ui';
import { formatMoeda, formatNumero } from '@/lib/format';
import { mensagemErro } from '@/lib/supabase';
import type { ReferenciaBusca } from '@/types/database';
import { Rotulo } from './comum';

/** Cotações de insumos do orçamento (orcamento_insumo_precos). */
export function CotacoesDrawer({ open, onClose, orcamentoId, dataBaseId, editavel }: { open: boolean; onClose: () => void; orcamentoId: string; dataBaseId: string; editavel: boolean }) {
  const toast = useToast();
  const cot = useCotacoes(open ? orcamentoId : undefined);
  const salvar = useSalvarCotacao(orcamentoId);
  const excluir = useExcluirCotacao(orcamentoId);
  const [termo, setTermo] = useState('');
  const busca = useBuscarReferencias(termo, dataBaseId, 'insumo', 30);
  const [sel, setSel] = useState<ReferenciaBusca | null>(null);
  const [preco, setPreco] = useState<number | null>(null);
  const [fonte, setFonte] = useState('');

  const adicionar = async () => {
    if (!sel || preco === null) return;
    try {
      await salvar.mutateAsync({ insumoId: sel.id, preco, fonte: fonte || null });
      toast.success('Cotação aplicada', sel.descricao);
      setSel(null);
      setPreco(null);
      setFonte('');
    } catch (e) {
      toast.error('Não foi possível salvar', mensagemErro(e));
    }
  };

  return (
    <Drawer open={open} onClose={onClose} width={720} eyebrow="Preços do orçamento" title="Cotações de insumos" description="Substituem o preço da data-base em todas as composições deste orçamento.">
      {editavel && (
        <div className="accent-rule mb-4 space-y-2 rounded border border-border bg-surface-2 p-3">
          <Rotulo>Nova cotação</Rotulo>
          <Combobox<ReferenciaBusca>
            value={sel}
            onChange={(i) => { setSel(i); setPreco(i?.preco ?? null); }}
            onSearch={setTermo}
            items={busca.data ?? []}
            loading={busca.isFetching}
            getKey={(i) => i.id}
            getLabel={(i) => `${i.codigo} – ${i.descricao}`}
            placeholder="Buscar insumo por código ou descrição…"
            emptyText={termo.length < 2 ? 'Digite ao menos 2 caracteres' : 'Nenhum insumo encontrado'}
            size="sm"
            renderItem={(i) => (
              <div className="grid grid-cols-[64px_1fr_40px_80px] gap-2 text-sm">
                <span className="font-mono text-xs text-fg-muted">{i.codigo}</span>
                <span className="truncate">{i.descricao}</span>
                <span className="text-xs text-fg-subtle">{i.unidade}</span>
                <span className="num text-right text-xs">{formatMoeda(i.preco)}</span>
              </div>
            )}
          />
          <div className="grid grid-cols-[150px_1fr_auto] gap-2">
            <NumberInput size="sm" aria-label="Preço cotado" value={preco} onChange={setPreco} decimals={4} prefix="R$" disabled={!sel} />
            <Input size="sm" aria-label="Fonte" placeholder="Fonte (fornecedor, data)" value={fonte} onChange={(e) => setFonte(e.target.value)} disabled={!sel} />
            <Button size="sm" variant="primary" disabled={!sel || preco === null} loading={salvar.isPending} onClick={() => void adicionar()}>Aplicar</Button>
          </div>
          {sel && sel.preco !== null && preco !== null && (
            <p className="text-xs text-fg-muted">
              Data-base: <span className="num">{formatMoeda(sel.preco)}</span> → cotação <span className="num">{formatMoeda(preco)}</span>{' '}
              (<span className={preco > sel.preco ? 'text-danger' : 'text-success'}>{preco >= sel.preco ? '+' : '−'}{formatNumero(Math.abs(sel.preco ? ((preco - sel.preco) / sel.preco) * 100 : 0))}%</span>)
            </p>
          )}
        </div>
      )}
      {cot.isLoading ? (
        <LoadingBlock />
      ) : (cot.data ?? []).length === 0 ? (
        <EmptyState icon={<Tag />} title="Sem cotações" description="Os preços seguem a data-base SINAPI do orçamento." variant="inline" />
      ) : (
        <Table density="compact" gridLines>
          <THead>
            <Tr><Th width={70}>Código</Th><Th>Insumo</Th><Th width={40}>Und</Th><Th numeric width={96}>Preço (R$)</Th><Th>Fonte</Th><Th width={30} /></Tr>
          </THead>
          <TBody>
            {(cot.data ?? []).map((c) => (
              <Tr key={c.insumo_id}>
                <Td mono>{c.insumo?.codigo}</Td>
                <Td truncate title={c.insumo?.descricao}>{c.insumo?.descricao}</Td>
                <Td muted className="text-xs">{c.insumo?.unidade}</Td>
                <Td numeric>{formatNumero(c.preco, 4)}</Td>
                <Td muted truncate className="max-w-[160px] text-xs">{c.fonte ?? '—'}</Td>
                <Td>{editavel && <IconButton size="sm" label="Remover cotação" icon={<Trash2 />} onClick={() => excluir.mutate(c.insumo_id, { onError: (e) => toast.error('Não foi possível remover', mensagemErro(e)) })} />}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </Drawer>
  );
}

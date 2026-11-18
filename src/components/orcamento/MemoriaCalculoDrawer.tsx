import { useEffect, useState } from 'react';
import { Calculator, Plus, Trash2 } from 'lucide-react';
import { useMemorias, useSalvarMemorias, type MemoriaLinha } from '@/api/orcamento/orcamentos';
import { Alert, Button, Drawer, IconButton, Input, LoadingBlock, useToast } from '@/components/ui';
import { avaliarExpressao, quantidadeDaMemoria } from '@/lib/calc';
import { formatQuantidade } from '@/lib/format';
import { mensagemErro } from '@/lib/supabase';
import type { OrcamentoItem } from '@/types/database';
import { Rotulo } from './comum';

interface LinhaEdit extends MemoriaLinha {
  chave: number;
}

let seq = 0;
const nova = (descricao = '', expressao = ''): LinhaEdit => ({ chave: ++seq, descricao, expressao, resultado: 0 });

/** Memória de cálculo de quantitativos de um item (expressões pt-BR avaliadas por `avaliarExpressao`). */
export function MemoriaCalculoDrawer({ item, codigo, open, onClose, orcamentoId, editavel }: {
  item: OrcamentoItem | null;
  codigo: string;
  open: boolean;
  onClose: () => void;
  orcamentoId: string;
  editavel: boolean;
}) {
  const toast = useToast();
  const mem = useMemorias(open ? item?.id : null);
  const salvar = useSalvarMemorias(orcamentoId);
  const [linhas, setLinhas] = useState<LinhaEdit[]>([]);

  useEffect(() => {
    if (!open || !mem.data) return;
    setLinhas(mem.data.length ? mem.data.map((m) => ({ chave: ++seq, id: m.id, descricao: m.descricao, expressao: m.expressao, resultado: m.resultado })) : [nova()]);
  }, [open, mem.data]);

  const avaliadas = linhas.map((l) => ({ ...l, r: l.expressao.trim() ? avaliarExpressao(l.expressao) : null }));
  const invalidas = avaliadas.filter((l) => l.r && !l.r.ok).length;
  const total = quantidadeDaMemoria(avaliadas.map((l) => (l.r?.ok ? l.r.valor : 0)));

  const set = (chave: number, patch: Partial<LinhaEdit>) => setLinhas((xs) => xs.map((x) => (x.chave === chave ? { ...x, ...patch } : x)));

  const onSalvar = async (usaMemoria: boolean) => {
    if (!item) return;
    if (invalidas) {
      toast.error('Corrija as expressões inválidas');
      return;
    }
    try {
      await salvar.mutateAsync({
        itemId: item.id,
        usaMemoria,
        linhas: avaliadas.filter((l) => l.expressao.trim()).map((l) => ({ descricao: l.descricao.trim(), expressao: l.expressao.trim(), resultado: l.r?.ok ? l.r.valor : 0 })),
      });
      toast.success(usaMemoria ? 'Memória salva' : 'Memória desvinculada', usaMemoria ? `Quantidade = ${formatQuantidade(total)} ${item.unidade}` : 'A quantidade volta a ser digitada.');
      onClose();
    } catch (e) {
      toast.error('Não foi possível salvar', mensagemErro(e));
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={620}
      eyebrow={`Item ${codigo} · ${item?.referencia_codigo ?? 'livre'}`}
      title="Memória de cálculo"
      description={item?.descricao}
      dismissable={!salvar.isPending}
      footer={
        editavel && (
          <>
            {item?.usa_memoria && <Button variant="ghost" className="mr-auto" onClick={() => void onSalvar(false)}>Desvincular</Button>}
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" loading={salvar.isPending} onClick={() => void onSalvar(true)} leftIcon={<Calculator />}>Aplicar quantidade</Button>
          </>
        )
      }
    >
      {mem.isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-fg-muted">
            Use números com vírgula (<code className="font-mono">3,50</code>), operadores <code className="font-mono">+ − * / ^</code>, <code className="font-mono">x</code> como multiplicação e parênteses.
            Ex.: <code className="font-mono">2*(3,50+4,20)*2,80 - 1,20x2,10</code>
          </p>
          <div className="overflow-hidden rounded border border-border">
            <div className="grid grid-cols-[28px_1fr_1.3fr_96px_28px] items-center gap-2 border-b border-border-strong bg-surface-2 px-2 py-1.5">
              <Rotulo>#</Rotulo><Rotulo>Descrição / local</Rotulo><Rotulo>Expressão</Rotulo><Rotulo className="text-right">Resultado</Rotulo><span />
            </div>
            {avaliadas.map((l, i) => (
              <div key={l.chave} className="grid grid-cols-[28px_1fr_1.3fr_96px_28px] items-start gap-2 border-b border-grid px-2 py-1.5 last:border-b-0">
                <span className="num pt-1 text-xs text-fg-subtle">{String(i + 1).padStart(2, '0')}</span>
                <Input size="sm" aria-label={`Descrição da linha ${i + 1}`} value={l.descricao} readOnly={!editavel} placeholder="Parede eixo A – térreo" onChange={(e) => set(l.chave, { descricao: e.target.value })} />
                <div>
                  <Input
                    size="sm"
                    aria-label={`Expressão da linha ${i + 1}`}
                    className="font-mono"
                    value={l.expressao}
                    readOnly={!editavel}
                    invalid={Boolean(l.r && !l.r.ok)}
                    placeholder="0,00"
                    onChange={(e) => set(l.chave, { expressao: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editavel && i === linhas.length - 1) setLinhas((xs) => [...xs, nova()]);
                    }}
                  />
                  {l.r && !l.r.ok && <p role="alert" className="mt-0.5 text-2xs text-danger">{l.r.erro} (posição {l.r.posicao + 1})</p>}
                </div>
                <span className="num pt-1 text-right text-sm">{l.r?.ok ? formatQuantidade(l.r.valor) : '—'}</span>
                {editavel ? <IconButton size="sm" label="Remover linha" icon={<Trash2 />} onClick={() => setLinhas((xs) => (xs.length > 1 ? xs.filter((x) => x.chave !== l.chave) : [nova()]))} /> : <span />}
              </div>
            ))}
            <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-border-strong bg-surface-2 px-3 py-2">
              <span className="text-sm font-medium">Quantidade total</span>
              <span className="num text-md font-semibold">{formatQuantidade(total)} <span className="text-xs font-normal text-fg-subtle">{item?.unidade}</span></span>
            </div>
          </div>
          {editavel && <Button size="sm" leftIcon={<Plus />} onClick={() => setLinhas((xs) => [...xs, nova()])}>Adicionar linha</Button>}
          {invalidas > 0 && <Alert variant="warning">{invalidas} expressão(ões) inválida(s).</Alert>}
          {item && !item.usa_memoria && item.quantidade > 0 && (
            <Alert variant="info">Ao aplicar, a quantidade digitada ({formatQuantidade(item.quantidade)}) será substituída pela soma da memória.</Alert>
          )}
        </div>
      )}
    </Drawer>
  );
}

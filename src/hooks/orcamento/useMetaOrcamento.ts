import { useMemo } from 'react';
import { useOrcamentoContexto } from '@/components/orcamento/contexto';
import type { LinhaEap } from '@/components/orcamento/eap';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import type { LinhaEapExport, MetaOrcamento } from '@/lib/export/relatorios';
import type { OrcamentoEtapa, OrcamentoItem } from '@/types/database';

/** Cabeçalho padrão dos relatórios/exportações do orçamento aberto. */
export function useMetaOrcamento(): MetaOrcamento {
  const { orcamento, bdiPadrao } = useOrcamentoContexto();
  const { organizacao } = useOrganizacao();
  return useMemo(
    () => ({
      organizacao: organizacao?.razao_social ?? organizacao?.nome,
      obra: orcamento.obra?.nome,
      orcamento: orcamento.nome,
      codigo: orcamento.codigo,
      versao: orcamento.versao,
      dataBase: orcamento.data_base,
      bdi: bdiPadrao?.bdi ?? null,
      dataOrcamento: orcamento.data_orcamento,
      responsavel: organizacao?.responsavel_tecnico ? `${organizacao.responsavel_tecnico}${organizacao.crea_cau ? ' – ' + organizacao.crea_cau : ''}` : null,
    }),
    [orcamento, bdiPadrao, organizacao],
  );
}

/** Converte linhas de `montarEap` para o formato de exportação. */
export function linhasParaExport(linhas: readonly LinhaEap<OrcamentoEtapa, OrcamentoItem>[]): (LinhaEapExport & { id: string })[] {
  return linhas.map((l) =>
    l.tipo === 'etapa'
      ? { id: l.id, tipo: 'etapa', nivel: l.nivel, codigo: l.codigo, descricao: l.etapa.nome, total_sem_bdi: l.total_sem_bdi, total: l.total, percentual: l.percentual }
      : {
          id: l.id, tipo: 'item', nivel: l.nivel, codigo: l.codigo, descricao: l.item.descricao, fonte: l.item.referencia_tipo === 'livre' ? 'LIVRE' : l.item.fonte,
          referencia_codigo: l.item.referencia_codigo, unidade: l.item.unidade, quantidade: l.item.quantidade, custo_unitario: l.item.custo_unitario,
          bdi_percentual: l.item.bdi_percentual, preco_unitario: l.preco_unitario, total_sem_bdi: l.total_sem_bdi, total: l.total, percentual: l.percentual,
        },
  );
}

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { EnviarPacoteSinapiModal } from './EnviarPacoteSinapiModal';
import { useSincronizacoesSinapi, type SinapiSincronizacao } from '@/api/core/sinapiCaixa';
import { Badge, Button, Card, CardHeader, TBody, THead, Table, Td, Th, Tr } from '@/components/ui';
import { formatDataHora } from '@/lib/format';

const STATUS: Record<SinapiSincronizacao['status'], { rotulo: string; variant: 'success' | 'danger' | 'warning' | 'info' }> = {
  processando: { rotulo: 'Em andamento', variant: 'info' },
  concluida: { rotulo: 'Concluída', variant: 'success' },
  erro: { rotulo: 'Erro', variant: 'danger' },
  indisponivel: { rotulo: 'Indisponível', variant: 'warning' },
};

/** Admin → Tabelas SINAPI: botão principal "Atualizar tabela SINAPI" (3 passos) e histórico das buscas automáticas. */
export function SincronizacaoSinapiCard() {
  const hist = useSincronizacoesSinapi(10);
  const [aberto, setAberto] = useState(false);

  return (
    <Card flush accent>
      <CardHeader
        eyebrow="Tabela de preços"
        title="Atualizar tabela SINAPI"
        description="Todo mês a Caixa publica uma tabela nova. Baixe o arquivo e envie aqui — leva cerca de 2 minutos."
        actions={
          <Button variant="primary" leftIcon={<RefreshCw />} onClick={() => setAberto(true)}>
            Atualizar tabela SINAPI
          </Button>
        }
      />
      {(hist.data ?? []).length > 0 && (
        <details className="group border-t border-border px-4 py-3 text-sm">
          <summary className="cursor-pointer select-none text-fg-muted hover:text-fg">Tentativas automáticas recentes</summary>
          <Table inset striped containerClassName="mt-3">
            <THead>
              <tr>
                <Th width={150}>Quando</Th>
                <Th width={90}>Mês</Th>
                <Th width={130}>Situação</Th>
                <Th>Detalhes</Th>
              </tr>
            </THead>
            <TBody>
              {(hist.data ?? []).map((s) => (
                <Tr key={s.id}>
                  <Td mono>{formatDataHora(s.iniciado_em)}</Td>
                  <Td mono>{String(s.mes).padStart(2, '0')}/{s.ano}</Td>
                  <Td><Badge variant={STATUS[s.status].variant}>{STATUS[s.status].rotulo}</Badge></Td>
                  <Td muted className="max-w-[420px] truncate" title={s.mensagem ?? ''}>{s.mensagem ?? '—'}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </details>
      )}
      <EnviarPacoteSinapiModal open={aberto} onClose={() => setAberto(false)} />
    </Card>
  );
}

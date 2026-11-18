import { useState } from 'react';
import { CloudDownload, RefreshCw } from 'lucide-react';
import { mensagemResposta, useBuscarSinapiCaixa, useSincronizacoesSinapi, type SinapiSincronizacao } from '@/api/core/sinapiCaixa';
import { BuscarSinapiCaixaModal } from '@/components/referencias/BuscarSinapiCaixa';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, TBody, THead, Table, Td, Th, Tr, useToast } from '@/components/ui';
import { formatDataHora } from '@/lib/format';

const STATUS: Record<SinapiSincronizacao['status'], { rotulo: string; variant: 'success' | 'danger' | 'warning' | 'info' }> = {
  processando: { rotulo: 'Em andamento', variant: 'info' },
  concluida: { rotulo: 'Concluída', variant: 'success' },
  erro: { rotulo: 'Erro', variant: 'danger' },
  indisponivel: { rotulo: 'Indisponível', variant: 'warning' },
};
const ORIGEM = { usuario: 'Usuário', admin: 'Admin', automatica: 'Automática' } as const;

/** Admin → Tabelas SINAPI: busca automática na Caixa (todas as UFs), histórico e rotina diária. */
export function SincronizacaoSinapiCard() {
  const toast = useToast();
  const hist = useSincronizacoesSinapi(15);
  const buscar = useBuscarSinapiCaixa();
  const [umaUf, setUmaUf] = useState(false);
  const [confirmar, setConfirmar] = useState<null | 'em_uso' | 'todas'>(null);

  const rodar = async (ufs: 'em_uso' | 'todas') => {
    setConfirmar(null);
    try {
      const m = mensagemResposta(await buscar.mutateAsync({ ufs }));
      toast.toast({ tipo: m.tipo, titulo: m.titulo, descricao: m.texto });
    } catch (e) {
      toast.error('Não foi possível sincronizar', e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <Card flush>
      <CardHeader
        eyebrow="Caixa · automático"
        title="Busca automática da SINAPI"
        description="Baixa o pacote mensal oficial da Caixa (todas as UFs) e importa os dois regimes. Todo dia o sistema verifica se saiu mês novo para as UFs em uso."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" leftIcon={<CloudDownload />} onClick={() => setUmaUf(true)}>Buscar uma UF</Button>
            <Button size="sm" leftIcon={<RefreshCw />} loading={buscar.isPending} onClick={() => setConfirmar('em_uso')}>Atualizar UFs em uso</Button>
            <Button size="sm" variant="primary" loading={buscar.isPending} onClick={() => setConfirmar('todas')}>Importar todas as UFs</Button>
          </div>
        }
      />
      {!hist.isLoading && (hist.data ?? []).length === 0 ? (
        <EmptyState variant="inline" icon={<CloudDownload />} title="Nenhuma busca ainda" description="Use os botões acima ou o botão “Buscar tabela oficial” na Consulta SINAPI." />
      ) : (
        <Table inset striped>
          <THead>
            <tr>
              <Th width={150}>Início</Th>
              <Th width={90}>Mês</Th>
              <Th>UFs</Th>
              <Th width={110}>Origem</Th>
              <Th width={130}>Situação</Th>
              <Th>Detalhes</Th>
            </tr>
          </THead>
          <TBody>
            {(hist.data ?? []).map((s) => (
              <Tr key={s.id}>
                <Td mono>{formatDataHora(s.iniciado_em)}</Td>
                <Td mono>{String(s.mes).padStart(2, '0')}/{s.ano}</Td>
                <Td className="max-w-[220px] truncate" title={s.ufs.join(', ')}>{s.ufs.length === 27 ? 'Todas' : s.ufs.join(', ')}</Td>
                <Td muted>{ORIGEM[s.origem]}</Td>
                <Td><Badge variant={STATUS[s.status].variant}>{STATUS[s.status].rotulo}</Badge></Td>
                <Td muted className="max-w-[420px] truncate" title={s.mensagem ?? ''}>{s.mensagem ?? '—'}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <BuscarSinapiCaixaModal open={umaUf} onClose={() => setUmaUf(false)} />
      <ConfirmDialog
        open={confirmar !== null}
        onClose={() => setConfirmar(null)}
        onConfirm={() => void rodar(confirmar!)}
        loading={buscar.isPending}
        title={confirmar === 'todas' ? 'Importar as 27 UFs?' : 'Atualizar as UFs em uso?'}
        description={
          confirmar === 'todas'
            ? 'Importa o mês mais recente de todos os estados, nos dois regimes (≈ 3 MB por UF e regime no banco). Cada execução processa o que couber em ~4 minutos; se ficar parcial, clique de novo para continuar.'
            : 'Baixa o mês mais recente publicado e importa as UFs que já têm tabela oficial ou são padrão de algum escritório.'
        }
        confirmLabel="Iniciar"
      />
    </Card>
  );
}

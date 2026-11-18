import { useEffect, useMemo, useState } from 'react';
import { CloudDownload } from 'lucide-react';
import { mensagemResposta, useBuscarSinapiCaixa, type RespostaBusca } from '@/api/core/sinapiCaixa';
import { Alert, Button, Field, Modal, Select } from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { UFS } from '@/lib/labels';

const NOMES_UF: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul', MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba',
  PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RO: 'Rondônia', RR: 'Roraima',
  RS: 'Rio Grande do Sul', SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins',
};

/** Últimos 12 meses (o mais recente publicado pela Caixa costuma ser o mês anterior). */
function mesesRecentes(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  for (let i = 1; i <= 12; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const mes = x.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    out.push({ value: `${x.getFullYear()}-${x.getMonth() + 1}`, label: mes.charAt(0).toUpperCase() + mes.slice(1) });
  }
  return out;
}

/** Modal "Buscar tabela oficial": escolhe UF e mês; o servidor baixa da Caixa e importa os dois regimes. */
export function BuscarSinapiCaixaModal({ open, onClose, ufInicial }: { open: boolean; onClose: () => void; ufInicial?: string }) {
  const { organizacao } = useOrganizacao();
  const buscar = useBuscarSinapiCaixa();
  const [uf, setUf] = useState(ufInicial ?? organizacao?.uf_padrao ?? 'RJ');
  const [mes, setMes] = useState('recente');
  const [resposta, setResposta] = useState<RespostaBusca | null>(null);
  const meses = useMemo(mesesRecentes, []);

  useEffect(() => {
    if (open) {
      setResposta(null);
      buscar.reset();
      setUf(ufInicial ?? organizacao?.uf_padrao ?? 'RJ');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const enviar = async () => {
    setResposta(null);
    const [a, m] = mes === 'recente' ? [undefined, undefined] : mes.split('-').map(Number);
    try {
      setResposta(await buscar.mutateAsync({ uf, ano: a, mes: m }));
    } catch {
      /* erro exibido abaixo */
    }
  };

  const msg = resposta ? mensagemResposta(resposta) : null;
  const concluiu = resposta?.status === 'concluida' || resposta?.status === 'ja_disponivel';

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissable={!buscar.isPending}
      title="Buscar tabela SINAPI oficial"
      description="O Pretium baixa a planilha mensal publicada pela Caixa e importa a UF escolhida, desonerada e não desonerada."
      footer={
        concluiu ? (
          <Button variant="primary" onClick={onClose}>Concluir</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={buscar.isPending}>Cancelar</Button>
            <Button variant="primary" leftIcon={<CloudDownload />} loading={buscar.isPending} onClick={() => void enviar()}>
              {buscar.isPending ? 'Buscando…' : 'Buscar na Caixa'}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Estado (UF)">
            {(p) => (
              <Select {...p} value={uf} disabled={buscar.isPending} onChange={(e) => setUf(e.target.value)} options={UFS.map((u) => ({ value: u, label: `${u} — ${NOMES_UF[u]}` }))} />
            )}
          </Field>
          <Field label="Mês de referência">
            {(p) => (
              <Select {...p} value={mes} disabled={buscar.isPending} onChange={(e) => setMes(e.target.value)} options={[{ value: 'recente', label: 'Mais recente publicado' }, ...meses]} />
            )}
          </Field>
        </div>

        {buscar.isPending && (
          <Alert variant="info" title="Baixando e importando…">
            A planilha nacional da Caixa é grande: o processo costuma levar de 1 a 3 minutos. Pode continuar usando o sistema em outra aba; não feche esta janela.
          </Alert>
        )}
        {buscar.isError && <Alert variant="danger" title="Não foi possível buscar">{buscar.error.message}</Alert>}
        {msg && <Alert variant={msg.tipo} title={msg.titulo}>{msg.texto}</Alert>}
        {!buscar.isPending && !resposta && (
          <p className="text-sm text-fg-muted">
            Os preços vêm direto do arquivo oficial da Caixa (sinapi-relatorios-mensais) e ficam disponíveis para todos os escritórios. Depois de
            importada, a tabela da UF é atualizada automaticamente todo mês.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Botão que abre o modal. */
export function BotaoBuscarSinapiCaixa({ ufInicial, size, variant }: { ufInicial?: string; size?: 'sm' | 'md'; variant?: 'primary' | 'secondary' }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} leftIcon={<CloudDownload />} onClick={() => setAberto(true)}>
        Buscar tabela oficial
      </Button>
      <BuscarSinapiCaixaModal open={aberto} onClose={() => setAberto(false)} ufInicial={ufInicial} />
    </>
  );
}

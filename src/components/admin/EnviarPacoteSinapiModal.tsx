import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Upload } from 'lucide-react';
import { Alert, Button, Checkbox, FileDrop, Modal, Progress, Select } from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { supabase } from '@/lib/supabase';
import { UFS } from '@/lib/labels';
import { anoMesDoNome, urlPacoteNacional } from '@/lib/sinapi/nacional';
import type { Rpc } from '@/lib/sinapi/pacote';

type Fase = 'escolha' | 'lendo' | 'importando' | 'fim';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Mês que a Caixa provavelmente já publicou: o anterior (a partir do dia 15) ou o retrasado. */
function mesProvavel(hoje = new Date()): { ano: number; mes: number } {
  const voltar = hoje.getDate() >= 15 ? 1 : 2;
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - voltar, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
}

function Passo({ n, titulo, children, feito }: { n: number; titulo: string; children: ReactNode; feito?: boolean }) {
  return (
    <div className="flex gap-4">
      <div className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ' + (feito ? 'bg-success text-white' : 'bg-brand/10 text-brand')}>
        {feito ? <CheckCircle2 className="h-4 w-4" /> : n}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <p className="mb-2 font-medium text-fg">{titulo}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * Atualizar a tabela SINAPI em 3 passos: baixar o arquivo oficial da Caixa no navegador, enviar aqui
 * e importar. Leitura e importação rodam no navegador (admin). Depois, os dados de exemplo são arquivados.
 */
export function EnviarPacoteSinapiModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { organizacao } = useOrganizacao();
  const sugerido = mesProvavel();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ano, setAno] = useState<number | null>(null);
  const [mes, setMes] = useState<number | null>(null);
  const [uf, setUf] = useState(organizacao?.uf_padrao ?? 'RJ');
  const [todas, setTodas] = useState(false);
  const [fase, setFase] = useState<Fase>('escolha');
  const [progresso, setProgresso] = useState({ uf: '', i: 0, total: 0 });
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ titulo: string; linhas: string[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    setArquivo(null);
    setAno(null);
    setMes(null);
    setFase('escolha');
    setErro(null);
    setResultado(null);
    setTodas(false);
    setUf(organizacao?.uf_padrao ?? 'RJ');
  }, [open, organizacao?.uf_padrao]);

  const escolher = (f: File) => {
    setErro(null);
    if (!/\.(zip|xlsx)$/i.test(f.name)) {
      setErro('Envie o arquivo .zip baixado da Caixa.');
      return;
    }
    setArquivo(f);
    const am = anoMesDoNome(f.name);
    setAno(am?.ano ?? null);
    setMes(am?.mes ?? null);
  };

  const importar = async () => {
    if (!arquivo || !ano || !mes) return;
    const ufs = todas ? [...UFS] : [uf];
    setErro(null);
    setFase('lendo');
    try {
      const pacote = await import('@/lib/sinapi/pacote');
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      await new Promise((ok) => setTimeout(ok, 50)); // deixa a tela atualizar antes do trabalho pesado
      const abas = /\.zip$/i.test(arquivo.name) ? pacote.lerPacote(bytes).abas : pacote.lerPlanilhaReferencia(bytes);

      const { data: dbs } = await supabase.from('datas_base').select('id').eq('ano', ano).eq('mes', mes).eq('is_demo', false);
      const ids = (dbs ?? []).map((d) => d.id);
      const { count } = ids.length
        ? await supabase.from('sinapi_importacoes').select('id', { count: 'exact', head: true }).in('data_base_id', ids).eq('tipo', 'analitico').eq('status', 'concluida')
        : { count: 0 };

      setFase('importando');
      const rpc: Rpc = async (fn, args) => {
        const { data, error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);
        if (error) throw new Error(error.message);
        return data;
      };
      const r = await pacote.importarNacional(rpc, {
        ano,
        mes,
        url: `${arquivo.name} (enviado; origem ${urlPacoteNacional(ano, mes)})`,
        ufs,
        abas,
        analiticoJaImportado: (count ?? 0) > 0,
        onUf: (u, i, total) => setProgresso({ uf: u, i, total }),
      });
      if (!r.ufs.length) throw new Error(`Não encontrei os preços no arquivo. ${r.avisos.slice(0, 3).join(' ')}`);

      // com tabela oficial publicada, os dados de exemplo saem de cena
      const { data: demos } = await supabase.from('datas_base').select('id').eq('is_demo', true).eq('status', 'publicada');
      for (const d of demos ?? []) await supabase.rpc('fn_sinapi_publicar_data_base', { p_data_base_id: d.id, p_status: 'arquivada' });

      const n = (x: number) => x.toLocaleString('pt-BR');
      const primeiro = r.ufs[0]!.regimes[0];
      setResultado({
        titulo: `Pronto! Tabela SINAPI de ${MESES[mes - 1]}/${ano} ativada ${r.ufs.length === 1 ? `para ${r.ufs[0]!.uf}` : `para ${r.ufs.length} estados`}.`,
        linhas: [
          primeiro ? `${n(primeiro.insumos)} insumos e ${n(primeiro.composicoes)} composições por estado.` : '',
          'Já aparece na Consulta SINAPI e nos novos orçamentos.',
          ...(r.avisos.length ? [`Observações: ${r.avisos.slice(0, 3).join(' ')}`] : []),
        ].filter(Boolean),
      });
      setFase('fim');
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setFase('escolha');
    } finally {
      void qc.invalidateQueries({ queryKey: ['ref', 'datas-base'] });
      void qc.invalidateQueries({ queryKey: ['core'] });
    }
  };

  const ocupado = fase === 'lendo' || fase === 'importando';
  const pct = fase === 'lendo' ? 8 : progresso.total ? Math.round(((progresso.i + 0.5) / progresso.total) * 100) : 10;
  const anos = [sugerido.ano, sugerido.ano - 1];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      dismissable={!ocupado}
      title="Atualizar tabela SINAPI"
      description="Três passos. Leva cerca de 2 minutos."
      footer={
        fase === 'fim' ? (
          <Button variant="primary" onClick={onClose}>Fechar</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={ocupado}>Cancelar</Button>
            <Button variant="primary" leftIcon={<Upload />} loading={ocupado} disabled={!arquivo || !ano || !mes} onClick={() => void importar()}>
              Importar
            </Button>
          </>
        )
      }
    >
      {fase === 'fim' && resultado ? (
        <div className="py-2 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-success" />
          <p className="font-display text-lg font-semibold text-fg">{resultado.titulo}</p>
          {resultado.linhas.map((l) => (
            <p key={l} className="mt-1 text-sm text-fg-muted">{l}</p>
          ))}
        </div>
      ) : ocupado ? (
        <div className="space-y-3 py-4">
          <Progress value={pct} striped label={fase === 'lendo' ? 'Lendo o arquivo…' : `Importando ${progresso.uf}${progresso.total > 1 ? ` (${progresso.i + 1} de ${progresso.total})` : ''}…`} />
          <p className="text-sm text-fg-muted">Não feche esta janela.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <Passo n={1} titulo="Baixe o arquivo da Caixa" feito={Boolean(arquivo)}>
            <a
              href={urlPacoteNacional(sugerido.ano, sugerido.mes)}
              className="inline-flex h-control items-center gap-2 rounded border border-border-strong bg-surface px-4 text-base font-medium text-fg shadow-xs hover:bg-surface-2"
            >
              <Download className="h-4 w-4" /> Baixar SINAPI de {MESES[sugerido.mes - 1]}/{sugerido.ano}
            </a>
            <p className="mt-1.5 text-xs text-fg-subtle">O download começa no seu navegador. Não precisa abrir o arquivo.</p>
          </Passo>

          <Passo n={2} titulo="Envie o arquivo baixado" feito={Boolean(arquivo)}>
            <FileDrop accept=".zip,.xlsx" file={arquivo} onFile={escolher} label="Arraste o arquivo aqui ou clique para escolher" hint="Ele fica na pasta Downloads (SINAPI-…-formato-xlsx.zip)" />
            {arquivo && (!ano || !mes) && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-fg-muted">Mês do arquivo:</span>
                <Select size="sm" aria-label="Mês" value={mes ?? ''} placeholder="mês" onChange={(e) => setMes(Number(e.target.value) || null)} options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))} />
                <Select size="sm" aria-label="Ano" value={ano ?? ''} placeholder="ano" onChange={(e) => setAno(Number(e.target.value) || null)} options={anos.map((a) => ({ value: String(a), label: String(a) }))} />
              </div>
            )}
          </Passo>

          <Passo n={3} titulo="Escolha o estado e clique em Importar">
            <div className="flex flex-wrap items-center gap-4">
              <Select aria-label="Estado" value={uf} disabled={todas} onChange={(e) => setUf(e.target.value)} options={UFS.map((u) => ({ value: u, label: u }))} className="w-28" />
              <Checkbox label="Todos os estados" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
            </div>
          </Passo>

          {erro && <Alert variant="danger" title="Não deu certo">{erro}</Alert>}
        </div>
      )}
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Upload } from 'lucide-react';
import { Alert, Button, Checkbox, Field, FileDrop, Modal, Progress, Select } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { UFS } from '@/lib/labels';
import { anoMesDoNome, urlPacoteNacional } from '@/lib/sinapi/nacional';
import type { Rpc } from '@/lib/sinapi/pacote';

type Fase = 'escolha' | 'lendo' | 'importando' | 'fim';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const ANOS = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

/**
 * Plano B da busca automática: o admin baixa no próprio navegador o pacote mensal da Caixa
 * (SINAPI-AAAA-MM-formato-xlsx.zip ou a planilha SINAPI_Referência_AAAA_MM.xlsx) e envia aqui.
 * A leitura e a importação rodam no navegador, com as mesmas regras da função de servidor.
 */
export function EnviarPacoteSinapiModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ano, setAno] = useState<number | null>(null);
  const [mes, setMes] = useState<number | null>(null);
  const [ufs, setUfs] = useState<string[]>(['RJ']);
  const [fase, setFase] = useState<Fase>('escolha');
  const [progresso, setProgresso] = useState({ uf: '', i: 0, total: 0 });
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setArquivo(null);
    setFase('escolha');
    setErro(null);
    setResumo(null);
    setAvisos([]);
    void supabase.rpc('fn_sinapi_ufs_em_uso').then(({ data }) => {
      if (Array.isArray(data) && data.length) setUfs(data as string[]);
    });
  }, [open]);

  const escolher = (f: File) => {
    setArquivo(f);
    const am = anoMesDoNome(f.name);
    if (am) {
      setAno(am.ano);
      setMes(am.mes);
    }
  };

  const alternar = (uf: string) => setUfs((l) => (l.includes(uf) ? l.filter((x) => x !== uf) : [...l, uf].sort()));

  const importar = async () => {
    if (!arquivo || !ano || !mes || !ufs.length) return;
    setErro(null);
    setFase('lendo');
    try {
      const pacote = await import('@/lib/sinapi/pacote');
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      // deixa a tela atualizar antes do trabalho pesado
      await new Promise((ok) => setTimeout(ok, 50));
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
        url: `${arquivo.name} (enviado manualmente; origem ${urlPacoteNacional(ano, mes)})`,
        ufs,
        abas,
        analiticoJaImportado: (count ?? 0) > 0,
        onUf: (uf, i, total) => setProgresso({ uf, i, total }),
      });
      setAvisos(r.avisos);
      setResumo(r.ufs.length ? `Importado e publicado: ${r.ufs.map((u) => u.uf).join(', ')} — ${String(mes).padStart(2, '0')}/${ano}, desonerado e não desonerado.` : 'Nenhuma UF foi importada.');
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
  const pct = fase === 'lendo' ? 5 : progresso.total ? Math.round(((progresso.i + 0.5) / progresso.total) * 100) : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      dismissable={!ocupado}
      title="Enviar pacote da Caixa"
      description="Use quando a busca automática for bloqueada: baixe o arquivo no seu navegador e envie aqui."
      footer={
        fase === 'fim' ? (
          <Button variant="primary" onClick={onClose}>Concluir</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={ocupado}>Cancelar</Button>
            <Button variant="primary" leftIcon={<Upload />} loading={ocupado} disabled={!arquivo || !ano || !mes || !ufs.length} onClick={() => void importar()}>
              Importar {ufs.length} UF{ufs.length === 1 ? '' : 's'}
            </Button>
          </>
        )
      }
    >
      {fase === 'fim' ? (
        <div className="space-y-3">
          <Alert variant="success" title="Concluído">{resumo}</Alert>
          {avisos.length > 0 && (
            <Alert variant="warning" title="Avisos">
              <ul className="list-disc pl-4">{avisos.slice(0, 12).map((a) => <li key={a}>{a}</li>)}</ul>
            </Alert>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-muted">
            <li>
              Baixe o pacote do mês no site da Caixa{' '}
              {ano && mes ? (
                <a className="inline-flex items-center gap-1 font-medium text-brand hover:underline" href={urlPacoteNacional(ano, mes)} target="_blank" rel="noreferrer">
                  (link direto {String(mes).padStart(2, '0')}/{ano} <ExternalLink className="h-3 w-3" />)
                </a>
              ) : (
                <>(caixa.gov.br → Downloads → SINAPI → Relatórios mensais)</>
              )}
              .
            </li>
            <li>Envie o arquivo .zip (ou a planilha “SINAPI_Referência” .xlsx de dentro dele).</li>
            <li>Escolha as UFs e importe. Tudo é lido aqui no seu navegador.</li>
          </ol>

          <FileDrop accept=".zip,.xlsx" file={arquivo} disabled={ocupado} onFile={escolher} label="Arraste o pacote da Caixa aqui ou clique para escolher" hint="SINAPI-AAAA-MM-formato-xlsx.zip ou SINAPI_Referência_AAAA_MM.xlsx" />

          <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
            <Field label="Mês">
              {(p) => <Select {...p} value={mes ?? ''} disabled={ocupado} placeholder="—" onChange={(e) => setMes(Number(e.target.value) || null)} options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))} />}
            </Field>
            <Field label="Ano">
              {(p) => <Select {...p} value={ano ?? ''} disabled={ocupado} placeholder="—" onChange={(e) => setAno(Number(e.target.value) || null)} options={ANOS.map((a) => ({ value: String(a), label: String(a) }))} />}
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-fg">UFs a importar ({ufs.length})</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => setUfs([...UFS])}>Todas</Button>
                <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => setUfs([])}>Nenhuma</Button>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-x-3 gap-y-2 sm:grid-cols-9">
              {UFS.map((uf) => (
                <Checkbox key={uf} label={uf} checked={ufs.includes(uf)} disabled={ocupado} onChange={() => alternar(uf)} />
              ))}
            </div>
          </div>

          {ocupado && (
            <Progress
              value={pct}
              striped
              label={fase === 'lendo' ? 'Lendo a planilha (pode levar até um minuto)…' : `Importando ${progresso.uf} (${progresso.i + 1} de ${progresso.total})…`}
            />
          )}
          {erro && <Alert variant="danger" title="Não foi possível importar">{erro}</Alert>}
        </div>
      )}
    </Modal>
  );
}

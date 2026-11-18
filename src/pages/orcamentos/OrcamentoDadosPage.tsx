import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, GitBranch, RefreshCcw, Save } from 'lucide-react';
import { useAtualizarOrcamento, useDuplicarOrcamento, useOrcamentos, useTrocarDataBase } from '@/api/orcamento/orcamentos';
import { useDatasBase, useEncargos } from '@/api/orcamento/referencias';
import { DataBaseTag, StatusOrcamento } from '@/components/orcamento/comum';
import { rotuloDataBase } from '@/components/orcamento/dataBase';
import { useOrcamentoContexto } from '@/components/orcamento/contexto';
import {
  Alert, Button, Card, CardBody, CardFooter, CardHeader, Checkbox, DateInput, Field, Input, Modal, NumberInput, Select, TBody, THead,
  Table, Td, Textarea, Th, Tr, useToast,
} from '@/components/ui';
import { formatBRL, formatData, formatNumero, formatPercent } from '@/lib/format';
import { LABEL_ORCAMENTO_STATUS, LABEL_REGIME, opcoes } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';
import type { OrcamentoStatus } from '@/types/database';

/** Dados gerais, data-base, encargos, status e versões. Dono: FRONTEND-2. */
export default function OrcamentoDadosPage() {
  const { orcamento: o, podeEditar } = useOrcamentoContexto();
  const toast = useToast();
  const navigate = useNavigate();
  const atualizar = useAtualizarOrcamento(o.id);
  const trocar = useTrocarDataBase(o.id);
  const duplicar = useDuplicarOrcamento();
  const datas = useDatasBase();
  const encargos = useEncargos();
  const versoes = useOrcamentos(o.obra_id);
  const [f, setF] = useState({ nome: o.nome, codigo: o.codigo ?? '', descricao: o.descricao ?? '', data_orcamento: o.data_orcamento, validade_dias: o.validade_dias as number | null, observacoes: o.observacoes ?? '', encargos_sociais_id: o.encargos_sociais_id ?? '', status: o.status });
  const [novaDb, setNovaDb] = useState<string | null>(null);
  const [confirmTroca, setConfirmTroca] = useState(false);
  const [dup, setDup] = useState<{ nome: string; versao: boolean } | null>(null);

  useEffect(() => {
    setF({ nome: o.nome, codigo: o.codigo ?? '', descricao: o.descricao ?? '', data_orcamento: o.data_orcamento, validade_dias: o.validade_dias, observacoes: o.observacoes ?? '', encargos_sociais_id: o.encargos_sociais_id ?? '', status: o.status });
  }, [o]);

  const salvar = async () => {
    if (f.nome.trim().length < 2) return toast.error('Informe o nome do orçamento');
    try {
      await atualizar.mutateAsync({
        nome: f.nome.trim(), codigo: f.codigo.trim() || null, descricao: f.descricao.trim() || null, data_orcamento: f.data_orcamento,
        validade_dias: f.validade_dias ?? 30, observacoes: f.observacoes.trim() || null, encargos_sociais_id: f.encargos_sociais_id || null, status: f.status,
      });
      toast.success('Dados salvos');
    } catch (e) {
      toast.error('Não foi possível salvar', mensagemErro(e));
    }
  };
  const confirmarTroca = async () => {
    if (!novaDb) return;
    try {
      await trocar.mutateAsync(novaDb);
      toast.success('Data-base alterada', 'Custos recalculados com os novos preços.');
      setNovaDb(null);
      setConfirmTroca(false);
    } catch (e) {
      toast.error('Não foi possível trocar a data-base', mensagemErro(e));
    }
  };
  const confirmarDup = async () => {
    if (!dup) return;
    try {
      const id = await duplicar.mutateAsync({ id: o.id, nome: dup.nome.trim() || null, novaVersao: dup.versao });
      setDup(null);
      toast.success('Orçamento duplicado');
      navigate(rotas.orcamento(id));
    } catch (e) {
      toast.error('Não foi possível duplicar', mensagemErro(e));
    }
  };

  const dbSel = datas.data?.find((d) => d.id === novaDb);
  const encSel = encargos.data?.find((e) => e.id === f.encargos_sociais_id);
  const ro = !podeEditar;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card flush accent>
        <CardHeader eyebrow="Cadastro" title="Dados do orçamento" />
        <CardBody className="grid grid-cols-6 gap-x-4 gap-y-3">
          <Field label="Código" className="col-span-2">{(p) => <Input {...p} className="font-mono" readOnly={ro} value={f.codigo} placeholder="ORC-2026-031" onChange={(e) => setF({ ...f, codigo: e.target.value })} />}</Field>
          <Field label="Nome" required className="col-span-4">{(p) => <Input {...p} readOnly={ro} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />}</Field>
          <Field label="Data do orçamento" className="col-span-2">{(p) => <DateInput {...p} readOnly={ro} value={f.data_orcamento} onChange={(v) => setF({ ...f, data_orcamento: v ?? o.data_orcamento })} />}</Field>
          <Field label="Validade da proposta" className="col-span-2">{(p) => <NumberInput {...p} readOnly={ro} decimals={0} min={1} value={f.validade_dias} onChange={(v) => setF({ ...f, validade_dias: v })} suffix="d" />}</Field>
          <Field label="Status" className="col-span-2">{(p) => <Select {...p} disabled={ro} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as OrcamentoStatus })} options={opcoes(LABEL_ORCAMENTO_STATUS)} />}</Field>
          <Field label="Encargos sociais" className="col-span-6" hint={encSel ? `Horista ${formatPercent(encSel.total_horista)} · Mensalista ${formatPercent(encSel.total_mensalista)} — usado no custo-hora de equipes sem insumo SINAPI` : 'Usado no custo-hora de membros de equipe informados por salário'}>
            {(p) => <Select {...p} disabled={ro} value={f.encargos_sociais_id} onChange={(e) => setF({ ...f, encargos_sociais_id: e.target.value })} placeholder="— nenhuma tabela —" options={(encargos.data ?? []).map((e) => ({ value: e.id, label: `${e.nome}${e.organizacao_id ? '' : ' (referência)'}${e.is_demo ? ' · EXEMPLO' : ''}` }))} />}
          </Field>
          <Field label="Descrição" className="col-span-6">{(p) => <Textarea {...p} rows={2} readOnly={ro} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />}</Field>
          <Field label="Observações (saem nos relatórios)" className="col-span-6">{(p) => <Textarea {...p} rows={4} readOnly={ro} value={f.observacoes} placeholder="Premissas, exclusões, condições de pagamento…" onChange={(e) => setF({ ...f, observacoes: e.target.value })} />}</Field>
        </CardBody>
        {podeEditar && <CardFooter><Button variant="primary" leftIcon={<Save />} loading={atualizar.isPending} onClick={() => void salvar()}>Salvar dados</Button></CardFooter>}
      </Card>

      <div className="flex flex-col gap-4">
        <Card flush>
          <CardHeader eyebrow="Preços de referência" title="Data-base" />
          <CardBody className="space-y-3">
            <DataBaseTag db={o.data_base} />
            {podeEditar && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select size="sm" aria-label="Nova data-base" value={novaDb ?? ''} onChange={(e) => setNovaDb(e.target.value || null)} placeholder="Trocar para…"
                    options={(datas.data ?? []).filter((d) => d.id !== o.data_base_id).map((d) => ({ value: d.id, label: `${rotuloDataBase(d)}${d.is_demo ? ' · EXEMPLO' : ''}` }))} />
                </div>
                <Button size="sm" leftIcon={<RefreshCcw />} disabled={!novaDb} onClick={() => setConfirmTroca(true)}>Trocar</Button>
              </div>
            )}
            <p className="text-xs text-fg-subtle">Ao trocar, todos os itens não manuais são recalculados (`fn_orcamento_trocar_data_base`). Cotações do orçamento são mantidas.</p>
          </CardBody>
        </Card>

        <Card flush>
          <CardHeader eyebrow="Histórico" title="Versões desta obra" actions={podeEditar && <Button size="sm" leftIcon={<Copy />} onClick={() => setDup({ nome: `${o.nome} (revisão)`, versao: true })}>Duplicar</Button>} />
          <Table containerClassName="rounded-none border-0" className="[&_td]:px-3 [&_th]:px-3">
            <THead><Tr><Th width={44}>Ver.</Th><Th>Orçamento</Th><Th>Status</Th><Th numeric>Total</Th></Tr></THead>
            <TBody>
              {(versoes.data ?? []).sort((a, b) => b.versao - a.versao).map((v) => (
                <Tr key={v.id} selected={v.id === o.id} interactive={v.id !== o.id} onClick={() => v.id !== o.id && navigate(rotas.orcamento(v.id))}>
                  <Td mono>
                    <span className="inline-flex items-center gap-1">{v.orcamento_origem_id && <GitBranch aria-label="derivado" className="h-3 w-3 text-fg-subtle" />}v{v.versao}</span>
                  </Td>
                  <Td>{v.nome}<div className="text-2xs text-fg-subtle">{formatData(v.data_orcamento)}</div></Td>
                  <Td><StatusOrcamento status={v.status} /></Td>
                  <Td numeric>{formatNumero(v.total)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <Modal open={confirmTroca && Boolean(dbSel)} onClose={() => setConfirmTroca(false)} size="sm" title="Trocar data-base?"
        footer={<><Button onClick={() => setConfirmTroca(false)}>Cancelar</Button><Button variant="primary" loading={trocar.isPending} onClick={() => void confirmarTroca()}>Trocar e recalcular</Button></>}>
        {dbSel && (
          <div className="space-y-2 text-sm">
            <p>De <strong>{o.data_base ? rotuloDataBase(o.data_base) : '—'}</strong> para <strong>{rotuloDataBase(dbSel)}</strong>.</p>
            {o.data_base && dbSel.regime !== o.data_base.regime && <Alert variant="warning">O regime muda para <strong>{LABEL_REGIME[dbSel.regime]}</strong>: revise o CPRB do BDI e a tabela de encargos.</Alert>}
            <p className="text-fg-muted">Total atual: <span className="num">{formatBRL(o.total)}</span>. Itens com custo manual não mudam.</p>
          </div>
        )}
      </Modal>
      <Modal open={dup !== null} onClose={() => setDup(null)} size="sm" title="Duplicar orçamento"
        footer={<><Button onClick={() => setDup(null)}>Cancelar</Button><Button variant="primary" loading={duplicar.isPending} onClick={() => void confirmarDup()}>Duplicar</Button></>}>
        <div className="space-y-3">
          <Field label="Nome da cópia">{(p) => <Input {...p} data-autofocus value={dup?.nome ?? ''} onChange={(e) => dup && setDup({ ...dup, nome: e.target.value })} />}</Field>
          <Checkbox label="Registrar como nova versão desta obra" description="Copia BDIs, EAP, itens, memórias, cotações, cronograma e equipes (não copia medições)." checked={dup?.versao ?? true} onChange={(e) => dup && setDup({ ...dup, versao: e.target.checked })} />
        </div>
      </Modal>
    </div>
  );
}

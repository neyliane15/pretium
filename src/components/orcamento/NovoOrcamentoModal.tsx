import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useObras } from '@/api/core/obras';
import { useCriarOrcamento } from '@/api/orcamento/orcamentos';
import { useDatasBase } from '@/api/orcamento/referencias';
import { Alert, Button, Field, Input, Modal, Select, useToast } from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { calcularBdi, FAIXAS_TCU } from '@/lib/calc';
import { formatPercent } from '@/lib/format';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';
import { novoOrcamentoSchema, type NovoOrcamentoForm } from '@/schemas/orcamento';
import { BDI_ZERO, presetTcu } from './bdiPresets';
import {} from './comum';
import { rotuloDataBase } from './dataBase';
import { BuscarSinapiCaixaModal } from '@/components/referencias/BuscarSinapiCaixa';

/** Criação de orçamento (`fn_orcamento_criar`) com data-base e preset de BDI TCU. */
export function NovoOrcamentoModal({ open, onClose, obraId }: { open: boolean; onClose: () => void; obraId?: string | null }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { organizacao } = useOrganizacao();
  const obras = useObras();
  const datas = useDatasBase();
  const [buscarAberto, setBuscarAberto] = useState(false);
  const criar = useCriarOrcamento();
  const { register, handleSubmit, reset, watch, control, formState: { errors } } = useForm<NovoOrcamentoForm>({
    resolver: zodResolver(novoOrcamentoSchema),
    defaultValues: { obra_id: obraId ?? '', nome: '', data_base_id: '', preset_bdi: 'edificacoes' },
  });

  // data-base padrão: mais recente na UF/regime padrão da organização
  const padrao = useMemo(() => {
    const ds = datas.data ?? [];
    return ds.find((d) => d.uf === (organizacao?.uf_padrao ?? 'RJ') && d.regime === (organizacao?.regime_padrao ?? 'nao_desonerado') && !d.is_demo)
      ?? ds.find((d) => d.uf === (organizacao?.uf_padrao ?? 'RJ') && d.regime === (organizacao?.regime_padrao ?? 'nao_desonerado'))
      ?? ds[0];
  }, [datas.data, organizacao]);

  useEffect(() => {
    if (open) reset({ obra_id: obraId ?? '', nome: 'Orçamento base', data_base_id: padrao?.id ?? '', preset_bdi: 'edificacoes' });
  }, [open, obraId, padrao, reset]);

  const preset = watch('preset_bdi');
  const bdi = preset === 'zero' ? BDI_ZERO : presetTcu(preset, 'medio');
  const dbSel = (datas.data ?? []).find((d) => d.id === watch('data_base_id'));

  const enviar = handleSubmit(async (v) => {
    try {
      const id = await criar.mutateAsync({ obraId: v.obra_id, nome: v.nome, dataBaseId: v.data_base_id, bdi });
      toast.success('Orçamento criado', v.nome);
      onClose();
      navigate(rotas.orcamento(id));
    } catch (e) {
      toast.error('Não foi possível criar o orçamento', mensagemErro(e));
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Novo orçamento"
      description="Escolha a obra, a data-base SINAPI e o ponto de partida do BDI."
      dismissable={!criar.isPending}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={criar.isPending} onClick={() => void enviar()}>Criar orçamento</Button>
        </>
      }
    >
      <form className="grid gap-3" onSubmit={(e) => void enviar(e)} noValidate>
        <Field label="Obra" required error={errors.obra_id?.message}>
          {(p) => <Select {...p} {...register('obra_id')} placeholder="Selecione…" options={(obras.data ?? []).map((o) => ({ value: o.id, label: `${o.codigo ? o.codigo + ' · ' : ''}${o.nome}` }))} />}
        </Field>
        <Field label="Nome do orçamento" required error={errors.nome?.message}>{(p) => <Input {...p} {...register('nome')} data-autofocus />}</Field>
        <Field label="Data-base de preços" required error={errors.data_base_id?.message} hint="Define UF, mês de referência e regime (desonerado ou não)."
          labelAside={<Button variant="link" size="sm" onClick={() => setBuscarAberto(true)}>Não achou sua UF ou mês? Buscar na Caixa</Button>}>
          {(p) => (
            <Controller
              control={control}
              name="data_base_id"
              render={({ field }) => (
                <Select {...p} value={field.value} onChange={(e) => field.onChange(e.target.value)} placeholder="Selecione…"
                  options={(datas.data ?? []).map((d) => ({ value: d.id, label: `${rotuloDataBase(d)}${d.is_demo ? ' · EXEMPLO' : ''}` }))} />
              )}
            />
          )}
        </Field>
        <BuscarSinapiCaixaModal open={buscarAberto} onClose={() => setBuscarAberto(false)} ufInicial={dbSel?.uf} />
        {dbSel?.is_demo && <Alert variant="demo">Data-base com dados de exemplo — não use para propostas oficiais.</Alert>}
        <Field label="BDI inicial" hint={`BDI resultante: ${formatPercent(calcularBdi(bdi))} (ISS 0% — ajuste na aba BDI)`}>
          {(p) => (
            <Select {...p} {...register('preset_bdi')} options={[
              { value: 'edificacoes', label: `TCU médio — ${FAIXAS_TCU.edificacoes.rotulo}` },
              { value: 'fornecimento_materiais', label: `TCU médio — ${FAIXAS_TCU.fornecimento_materiais.rotulo}` },
              { value: 'zero', label: 'Somente PIS/COFINS (definir depois)' },
            ]} />
          )}
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

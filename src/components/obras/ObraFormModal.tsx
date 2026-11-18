import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useClientesOpcoes, useSalvarObra, type ObraComCliente } from '@/api/core/obras';
import { Button, DateInput, Field, Input, Modal, NumberInput, Select, Textarea, useToast } from '@/components/ui';
import { Rotulo } from '@/components/orcamento/comum';
import { LABEL_OBRA_STATUS, opcoes, UFS } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import { obraSchema, type ObraDados, type ObraForm } from '@/schemas/orcamento';
import type { Obra } from '@/types/database';

const vazio: ObraForm = {
  codigo: '', nome: '', descricao: '', tipo_obra: '', status: 'planejamento', cliente_id: null, cep: '', logradouro: '', numero: '',
  complemento: '', bairro: '', municipio: '', uf: 'RJ', area_construida_m2: null, area_terreno_m2: null, data_inicio_prevista: null,
  data_fim_prevista: null, responsavel_tecnico: '', crea_cau: '', art_rrt: '', observacoes: '',
};

function paraForm(o: ObraComCliente): ObraForm {
  return {
    codigo: o.codigo ?? '', nome: o.nome, descricao: o.descricao ?? '', tipo_obra: o.tipo_obra ?? '', status: o.status, cliente_id: o.cliente_id,
    cep: o.cep ?? '', logradouro: o.logradouro ?? '', numero: o.numero ?? '', complemento: o.complemento ?? '', bairro: o.bairro ?? '',
    municipio: o.municipio ?? '', uf: (UFS as readonly string[]).includes(o.uf) ? (o.uf as ObraForm['uf']) : 'RJ',
    area_construida_m2: o.area_construida_m2, area_terreno_m2: o.area_terreno_m2, data_inicio_prevista: o.data_inicio_prevista,
    data_fim_prevista: o.data_fim_prevista, responsavel_tecnico: o.responsavel_tecnico ?? '', crea_cau: o.crea_cau ?? '', art_rrt: o.art_rrt ?? '',
    observacoes: o.observacoes ?? '',
  };
}

const TIPOS_OBRA = ['Residencial unifamiliar', 'Residencial multifamiliar', 'Comercial', 'Reforma residencial', 'Reforma comercial', 'Industrial', 'Institucional', 'Infraestrutura'];

/** Formulário de obra (criação/edição) em modal. */
export function ObraFormModal({ open, onClose, obra, onSalva }: { open: boolean; onClose: () => void; obra?: ObraComCliente | null; onSalva?: (o: Obra) => void }) {
  const toast = useToast();
  const salvar = useSalvarObra();
  const clientes = useClientesOpcoes();
  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<ObraForm>({
    resolver: zodResolver(obraSchema),
    defaultValues: vazio,
  });

  useEffect(() => {
    if (open) reset(obra ? paraForm(obra) : vazio);
  }, [open, obra, reset]);

  const enviar = handleSubmit(async (valores) => {
    try {
      const dados: ObraDados = obraSchema.parse(valores);
      const o = await salvar.mutateAsync({ ...dados, id: obra?.id });
      toast.success(obra ? 'Obra atualizada' : 'Obra cadastrada', o.nome);
      onSalva?.(o);
      onClose();
    } catch (e) {
      toast.error('Não foi possível salvar', mensagemErro(e));
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      dismissable={!salvar.isPending}
      title={obra ? 'Editar obra' : 'Nova obra'}
      description="Dados cadastrais, endereço, áreas e responsabilidade técnica."
      footer={
        <>
          <Button onClick={onClose} disabled={salvar.isPending}>Cancelar</Button>
          <Button variant="primary" loading={salvar.isPending} onClick={() => void enviar()}>Salvar obra</Button>
        </>
      }
    >
      <form onSubmit={(e) => void enviar(e)} className="space-y-5" noValidate>
        <fieldset className="grid grid-cols-6 gap-x-4 gap-y-3">
          <legend className="col-span-6 mb-2"><Rotulo>Identificação</Rotulo></legend>
          <Field label="Código" className="col-span-1" error={errors.codigo?.message}>{(p) => <Input {...p} {...register('codigo')} placeholder="OB-2026-01" className="font-mono" />}</Field>
          <Field label="Nome da obra" required className="col-span-3" error={errors.nome?.message}>{(p) => <Input {...p} {...register('nome')} data-autofocus />}</Field>
          <Field label="Status" className="col-span-2">{(p) => <Select {...p} {...register('status')} options={opcoes(LABEL_OBRA_STATUS)} />}</Field>
          <Field label="Cliente" className="col-span-3" hint={clientes.data?.length === 0 ? 'Nenhum cliente cadastrado' : undefined}>
            {(p) => (
              <Controller
                control={control}
                name="cliente_id"
                render={({ field }) => (
                  <Select {...p} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)} placeholder="— sem cliente —" options={(clientes.data ?? []).map((c) => ({ value: c.id, label: c.nome }))} />
                )}
              />
            )}
          </Field>
          <Field label="Tipo de obra" className="col-span-3">
            {(p) => (
              <>
                <Input {...p} {...register('tipo_obra')} list="tipos-obra" placeholder="Residencial unifamiliar…" />
                <datalist id="tipos-obra">{TIPOS_OBRA.map((t) => <option key={t} value={t} />)}</datalist>
              </>
            )}
          </Field>
          <Field label="Descrição" className="col-span-6">{(p) => <Textarea {...p} rows={2} {...register('descricao')} />}</Field>
        </fieldset>

        <fieldset className="grid grid-cols-6 gap-x-4 gap-y-3">
          <legend className="col-span-6 mb-2"><Rotulo>Endereço</Rotulo></legend>
          <Field label="CEP" className="col-span-1">{(p) => <Input {...p} {...register('cep')} inputMode="numeric" className="font-mono" />}</Field>
          <Field label="Logradouro" className="col-span-3">{(p) => <Input {...p} {...register('logradouro')} />}</Field>
          <Field label="Número" className="col-span-1">{(p) => <Input {...p} {...register('numero')} />}</Field>
          <Field label="Complemento" className="col-span-1">{(p) => <Input {...p} {...register('complemento')} />}</Field>
          <Field label="Bairro" className="col-span-2">{(p) => <Input {...p} {...register('bairro')} />}</Field>
          <Field label="Município" className="col-span-3">{(p) => <Input {...p} {...register('municipio')} />}</Field>
          <Field label="UF" className="col-span-1" error={errors.uf?.message}>{(p) => <Select {...p} {...register('uf')} options={UFS.map((u) => ({ value: u, label: u }))} />}</Field>
        </fieldset>

        <fieldset className="grid grid-cols-6 gap-x-4 gap-y-3">
          <legend className="col-span-6 mb-2"><Rotulo>Áreas e prazos</Rotulo></legend>
          {(['area_construida_m2', 'area_terreno_m2'] as const).map((k) => (
            <Field key={k} label={k === 'area_construida_m2' ? 'Área construída' : 'Área do terreno'} className="col-span-1" error={errors[k]?.message}>
              {(p) => <Controller control={control} name={k} render={({ field }) => <NumberInput {...p} value={field.value} onChange={field.onChange} min={0} suffix="m²" />} />}
            </Field>
          ))}
          <Field label="Início previsto" className="col-span-2" error={errors.data_inicio_prevista?.message}>
            {(p) => <Controller control={control} name="data_inicio_prevista" render={({ field }) => <DateInput {...p} value={field.value} onChange={field.onChange} />} />}
          </Field>
          <Field label="Término previsto" className="col-span-2" error={errors.data_fim_prevista?.message}>
            {(p) => <Controller control={control} name="data_fim_prevista" render={({ field }) => <DateInput {...p} value={field.value} onChange={field.onChange} />} />}
          </Field>
        </fieldset>

        <fieldset className="grid grid-cols-6 gap-x-4 gap-y-3">
          <legend className="col-span-6 mb-2"><Rotulo>Responsabilidade técnica</Rotulo></legend>
          <Field label="Responsável técnico" className="col-span-3">{(p) => <Input {...p} {...register('responsavel_tecnico')} />}</Field>
          <Field label="CREA/CAU" className="col-span-1">{(p) => <Input {...p} {...register('crea_cau')} className="font-mono" />}</Field>
          <Field label="ART/RRT" className="col-span-2">{(p) => <Input {...p} {...register('art_rrt')} className="font-mono" />}</Field>
          <Field label="Observações" className="col-span-6">{(p) => <Textarea {...p} rows={2} {...register('observacoes')} />}</Field>
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { Button, Checkbox, Field, Input, Modal, Tabs, Textarea, useToast } from '@/components/ui';
import { useSalvarCliente } from '@/api/core/clientes';
import { EnderecoCampos } from '@/components/organizacao/EnderecoCampos';
import { formatCep, formatDocumento, formatTelefone } from '@/lib/format';
import { mensagemErro } from '@/lib/supabase';
import { clienteSchema, type ClienteForm } from '@/schemas/core';
import type { Cliente, PessoaTipo } from '@/types/database';

const VAZIO: ClienteForm = {
  tipo: 'PJ', nome: '', nome_fantasia: '', documento: '', inscricao_estadual: '', email: '', telefone: '', contato_nome: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', uf: 'RJ', observacoes: '', ativo: true,
};

const paraForm = (c: Cliente): ClienteForm => ({
  tipo: c.tipo,
  nome: c.nome,
  nome_fantasia: c.nome_fantasia ?? '',
  documento: formatDocumento(c.documento, ''),
  inscricao_estadual: c.inscricao_estadual ?? '',
  email: c.email ?? '',
  telefone: formatTelefone(c.telefone, ''),
  contato_nome: c.contato_nome ?? '',
  cep: formatCep(c.cep, ''),
  logradouro: c.logradouro ?? '',
  numero: c.numero ?? '',
  complemento: c.complemento ?? '',
  bairro: c.bairro ?? '',
  municipio: c.municipio ?? '',
  uf: c.uf ?? '',
  observacoes: c.observacoes ?? '',
  ativo: c.ativo,
});

export interface ClienteFormModalProps {
  open: boolean;
  onClose: () => void;
  /** cliente em edição (ausente = novo) */
  cliente?: Cliente | null;
  onSaved?: (c: Cliente) => void;
}

/** Formulário PF/PJ com validação de CPF/CNPJ. Dono: FRONTEND-1. */
export function ClienteFormModal({ open, onClose, cliente, onSaved }: ClienteFormModalProps) {
  const salvar = useSalvarCliente();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ClienteForm>({ resolver: zodResolver(clienteSchema), defaultValues: VAZIO });

  useEffect(() => {
    if (open) reset(cliente ? paraForm(cliente) : VAZIO);
  }, [open, cliente, reset]);

  const tipo = watch('tipo') as PessoaTipo;
  const pf = tipo === 'PF';

  const onSubmit = handleSubmit((d) => {
    const dados = clienteSchema.parse(d);
    salvar.mutate(
      { ...dados, id: cliente?.id },
      {
        onSuccess: (c) => {
          toast.success(cliente ? 'Cliente atualizado' : 'Cliente cadastrado', c.nome);
          onSaved?.(c);
          onClose();
        },
        onError: (e) => toast.error('Não foi possível salvar', mensagemErro(e)),
      },
    );
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      dismissable={!salvar.isPending}
      title={cliente ? 'Editar cliente' : 'Novo cliente'}
      description="Contratante da obra. Os dados aparecem nos relatórios e propostas."
      footer={
        <>
          <Button onClick={onClose} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" leftIcon={<Save />} loading={salvar.isPending} onClick={() => void onSubmit()}>
            {cliente ? 'Salvar alterações' : 'Cadastrar cliente'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Tabs<PessoaTipo>
          aria-label="Tipo de pessoa"
          variant="segmented"
          size="sm"
          value={tipo}
          onChange={(t) => setValue('tipo', t, { shouldDirty: true, shouldValidate: Boolean(watch('documento')) })}
          items={[
            { value: 'PJ', label: 'Pessoa jurídica' },
            { value: 'PF', label: 'Pessoa física' },
          ]}
        />
        <div className="grid grid-cols-6 gap-x-4 gap-y-3">
          <Field label={pf ? 'Nome completo' : 'Razão social'} required error={errors.nome?.message} className="col-span-6 md:col-span-4">
            {(p) => <Input {...p} {...register('nome')} data-autofocus />}
          </Field>
          <Field label={pf ? 'CPF' : 'CNPJ'} error={errors.documento?.message} className="col-span-6 md:col-span-2">
            {(p) => (
              <Input
                {...p}
                {...register('documento', { onBlur: (e) => setValue('documento', formatDocumento(e.target.value, '')) })}
                inputMode="numeric"
                className="num"
                placeholder={pf ? '000.000.000-00' : '00.000.000/0000-00'}
              />
            )}
          </Field>
          {!pf && (
            <>
              <Field label="Nome fantasia" error={errors.nome_fantasia?.message} className="col-span-6 md:col-span-4">
                {(p) => <Input {...p} {...register('nome_fantasia')} />}
              </Field>
              <Field label="Inscrição estadual" error={errors.inscricao_estadual?.message} className="col-span-6 md:col-span-2">
                {(p) => <Input {...p} {...register('inscricao_estadual')} className="num" />}
              </Field>
            </>
          )}
          <Field label="E-mail" error={errors.email?.message} className="col-span-6 md:col-span-2">
            {(p) => <Input {...p} {...register('email')} type="email" />}
          </Field>
          <Field label="Telefone" error={errors.telefone?.message} className="col-span-3 md:col-span-2">
            {(p) => <Input {...p} {...register('telefone', { onBlur: (e) => setValue('telefone', formatTelefone(e.target.value, '')) })} inputMode="tel" className="num" />}
          </Field>
          <Field label="Contato" error={errors.contato_nome?.message} className="col-span-3 md:col-span-2">
            {(p) => <Input {...p} {...register('contato_nome')} placeholder={pf ? '' : 'Pessoa de contato'} />}
          </Field>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.1em] text-fg-subtle">
            Endereço <span className="h-px flex-1 bg-border" />
          </div>
          <EnderecoCampos register={register} errors={errors} setValue={setValue} />
        </div>
        <Field label="Observações" error={errors.observacoes?.message}>
          {(p) => <Textarea {...p} {...register('observacoes')} rows={2} />}
        </Field>
        <Checkbox {...register('ativo')} label="Cliente ativo" description="Clientes inativos não aparecem na seleção de novas obras." />
      </form>
    </Modal>
  );
}

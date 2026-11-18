import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Building2, Save, Users } from 'lucide-react';
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, EmptyState, Field, Input, PageHeader, Select, useToast } from '@/components/ui';
import { useArquivoUrl } from '@/api/core/arquivos';
import { useEnviarLogo, useSalvarOrganizacao } from '@/api/core/organizacao';
import { EnderecoCampos } from '@/components/organizacao/EnderecoCampos';
import { ImagemUpload } from '@/components/organizacao/ImagemUpload';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { formatCep, formatDataHora, formatDocumento, formatTelefone } from '@/lib/format';
import { LABEL_ORG_ROLE, LABEL_REGIME, UFS, opcoes } from '@/lib/labels';
import { BUCKETS, mensagemErro } from '@/lib/supabase';
import { organizacaoSchema, type OrganizacaoForm } from '@/schemas/core';
import type { Organizacao } from '@/types/database';
import { rotas } from '@/routes';

const paraForm = (o: Organizacao): OrganizacaoForm => ({
  nome: o.nome,
  razao_social: o.razao_social ?? '',
  cnpj: formatDocumento(o.cnpj, ''),
  email: o.email ?? '',
  telefone: formatTelefone(o.telefone, ''),
  site: o.site ?? '',
  cep: formatCep(o.cep, ''),
  logradouro: o.logradouro ?? '',
  numero: o.numero ?? '',
  complemento: o.complemento ?? '',
  bairro: o.bairro ?? '',
  municipio: o.municipio ?? '',
  uf: o.uf ?? '',
  uf_padrao: o.uf_padrao,
  regime_padrao: o.regime_padrao,
  responsavel_tecnico: o.responsavel_tecnico ?? '',
  crea_cau: o.crea_cau ?? '',
});

/** Dados do escritório, logo (bucket `logos`) e padrões de orçamento. Dono: FRONTEND-1. */
export default function OrganizacaoDadosPage() {
  const { organizacao, papel, isOwner } = useOrganizacao();
  const toast = useToast();
  const nav = useNavigate();
  const salvar = useSalvarOrganizacao();
  const logo = useEnviarLogo();
  const { data: logoUrl } = useArquivoUrl(BUCKETS.logos, organizacao?.logo_path);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<OrganizacaoForm>({ resolver: zodResolver(organizacaoSchema) });

  useEffect(() => {
    if (organizacao) reset(paraForm(organizacao));
  }, [organizacao, reset]);

  if (!organizacao)
    return (
      <>
        <PageHeader title="Escritório" />
        <EmptyState icon={<Building2 />} title="Nenhuma organização ativa" description="Crie ou selecione uma organização para editar os dados." />
      </>
    );

  const ro = !isOwner;
  const onSubmit = handleSubmit((d) => {
    salvar.mutate(organizacaoSchema.parse(d), {
      onSuccess: () => toast.success('Dados do escritório salvos'),
      onError: (e) => toast.error('Não foi possível salvar', mensagemErro(e)),
    });
  });
  const enviarLogo = (f: File | null) =>
    logo.mutate(f, {
      onSuccess: () => toast.success(f ? 'Logo atualizada' : 'Logo removida'),
      onError: (e) => toast.error('Não foi possível atualizar a logo', mensagemErro(e)),
    });

  return (
    <>
      <PageHeader
        title={organizacao.nome}
        description="Dados cadastrais usados nos cabeçalhos dos relatórios e padrões para novos orçamentos."
        breadcrumbs={[{ label: 'Cadastros' }, { label: 'Escritório' }]}
        badges={
          <>
            {papel && <Badge variant="outline">{LABEL_ORG_ROLE[papel]}</Badge>}
            {organizacao.status === 'bloqueada' && <Badge variant="danger">Bloqueada</Badge>}
          </>
        }
        actions={
          <Button leftIcon={<Users />} onClick={() => nav(rotas.organizacaoMembros)}>
            Equipe
          </Button>
        }
      />
      {ro && (
        <Alert variant="info" className="mb-4">
          Somente o proprietário do escritório pode alterar estes dados.
        </Alert>
      )}
      <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Card flush accent as="section">
            <CardHeader eyebrow="01" title="Identificação" />
            <CardBody className="grid grid-cols-6 gap-x-4 gap-y-3">
              <Field label="Nome fantasia" required error={errors.nome?.message} className="col-span-6 md:col-span-3">
                {(p) => <Input {...p} {...register('nome')} disabled={ro} />}
              </Field>
              <Field label="Razão social" error={errors.razao_social?.message} className="col-span-6 md:col-span-3">
                {(p) => <Input {...p} {...register('razao_social')} disabled={ro} />}
              </Field>
              <Field label="CNPJ" error={errors.cnpj?.message} className="col-span-6 md:col-span-2">
                {(p) => (
                  <Input {...p} {...register('cnpj', { onBlur: (e) => setValue('cnpj', formatDocumento(e.target.value, '')) })} className="num" placeholder="00.000.000/0000-00" disabled={ro} />
                )}
              </Field>
              <Field label="E-mail" error={errors.email?.message} className="col-span-6 md:col-span-2">
                {(p) => <Input {...p} {...register('email')} type="email" disabled={ro} />}
              </Field>
              <Field label="Telefone" error={errors.telefone?.message} className="col-span-6 md:col-span-2">
                {(p) => (
                  <Input {...p} {...register('telefone', { onBlur: (e) => setValue('telefone', formatTelefone(e.target.value, '')) })} className="num" disabled={ro} />
                )}
              </Field>
              <Field label="Site" error={errors.site?.message} className="col-span-6">
                {(p) => <Input {...p} {...register('site')} placeholder="https://" disabled={ro} />}
              </Field>
            </CardBody>
          </Card>
          <Card flush as="section">
            <CardHeader eyebrow="02" title="Endereço" />
            <CardBody>
              <EnderecoCampos register={register} errors={errors} setValue={setValue} disabled={ro} />
            </CardBody>
          </Card>
          <Card flush as="section">
            <CardHeader eyebrow="03" title="Responsabilidade técnica e padrões" description="Aplicados a novas obras e orçamentos." />
            <CardBody className="grid grid-cols-6 gap-x-4 gap-y-3">
              <Field label="Responsável técnico" error={errors.responsavel_tecnico?.message} className="col-span-6 md:col-span-4">
                {(p) => <Input {...p} {...register('responsavel_tecnico')} disabled={ro} />}
              </Field>
              <Field label="CREA/CAU" error={errors.crea_cau?.message} className="col-span-6 md:col-span-2">
                {(p) => <Input {...p} {...register('crea_cau')} disabled={ro} />}
              </Field>
              <Field label="UF padrão da referência" error={errors.uf_padrao?.message} className="col-span-3 md:col-span-2">
                {(p) => <Select {...p} {...register('uf_padrao')} options={UFS.map((u) => ({ value: u, label: u }))} disabled={ro} />}
              </Field>
              <Field label="Regime padrão" error={errors.regime_padrao?.message} className="col-span-3 md:col-span-2">
                {(p) => <Select {...p} {...register('regime_padrao')} options={opcoes(LABEL_REGIME)} disabled={ro} />}
              </Field>
            </CardBody>
            {!ro && (
              <CardFooter>
                <Button type="button" variant="ghost" disabled={!isDirty} onClick={() => reset(paraForm(organizacao))}>
                  Descartar
                </Button>
                <Button type="submit" variant="primary" leftIcon={<Save />} loading={salvar.isPending} disabled={!isDirty}>
                  Salvar dados
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>
        <aside className="flex flex-col gap-4">
          <Card cornerMarks>
            <div className="mb-3 font-mono text-2xs uppercase tracking-[0.1em] text-fg-subtle">Logo nos relatórios</div>
            <ImagemUpload
              rotulo="Logo"
              src={logoUrl}
              vazio={<Building2 className="h-6 w-6 text-fg-subtle" aria-hidden />}
              enviando={logo.isPending}
              disabled={ro}
              onEscolher={enviarLogo}
              onRemover={() => enviarLogo(null)}
              dica="PNG/SVG com fundo transparente, até 2 MB."
            />
          </Card>
          <Card>
            <dl className="divide-y divide-grid text-sm">
              <div className="flex justify-between py-1.5">
                <dt className="text-fg-muted">Situação</dt>
                <dd>
                  <Badge variant={organizacao.status === 'ativa' ? 'success' : 'danger'} dot>
                    {organizacao.status === 'ativa' ? 'Ativa' : 'Bloqueada'}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between py-1.5">
                <dt className="text-fg-muted">Criada em</dt>
                <dd className="num text-xs">{formatDataHora(organizacao.created_at)}</dd>
              </div>
              <div className="flex justify-between py-1.5">
                <dt className="text-fg-muted">Atualizada em</dt>
                <dd className="num text-xs">{formatDataHora(organizacao.updated_at)}</dd>
              </div>
            </dl>
          </Card>
        </aside>
      </form>
    </>
  );
}

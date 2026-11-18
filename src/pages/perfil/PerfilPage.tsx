import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Monitor, Moon, Save, Sun } from 'lucide-react';
import { Avatar, Badge, Button, Card, CardBody, CardFooter, CardHeader, Field, Input, PageHeader, Tabs, useToast } from '@/components/ui';
import { useArquivoUrl } from '@/api/core/arquivos';
import { authApi } from '@/api/core/auth';
import { salvarTemaPerfil, useAtualizarPerfil, useEnviarAvatar } from '@/api/core/perfil';
import { ImagemUpload } from '@/components/organizacao/ImagemUpload';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { useTheme } from '@/contexts/ThemeContext';
import { formatDataHora, formatTelefone } from '@/lib/format';
import { BADGE_USER_STATUS, LABEL_APP_ROLE, LABEL_ORG_ROLE, LABEL_USER_STATUS } from '@/lib/labels';
import { BUCKETS, mensagemErro } from '@/lib/supabase';
import { perfilSchema, trocarSenhaSchema, type PerfilForm, type TrocarSenhaForm } from '@/schemas/core';
import type { Tema } from '@/types/database';
import { ForcaSenha, SenhaInput } from '@/pages/auth/SenhaInput';

function DadosPessoais() {
  const { profile } = useAuth();
  const toast = useToast();
  const salvar = useAtualizarPerfil();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<PerfilForm>({ resolver: zodResolver(perfilSchema) });

  useEffect(() => {
    if (profile) reset({ nome: profile.nome, telefone: formatTelefone(profile.telefone, ''), crea_cau: profile.crea_cau ?? '' });
  }, [profile, reset]);

  const onSubmit = handleSubmit((d) => {
    const dados = perfilSchema.parse(d);
    salvar.mutate(dados, {
      onSuccess: () => toast.success('Perfil atualizado'),
      onError: (e) => toast.error('Não foi possível salvar', mensagemErro(e)),
    });
  });

  return (
    <Card flush accent as="section">
      <CardHeader eyebrow="01" title="Dados pessoais" description="Exibidos nos relatórios como responsável pelo orçamento." />
      <form onSubmit={onSubmit} noValidate>
        <CardBody className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
          <Field label="Nome completo" required error={errors.nome?.message} className="md:col-span-2">
            {(p) => <Input {...p} {...register('nome')} autoComplete="name" />}
          </Field>
          <Field label="E-mail" hint="Para alterar o e-mail, fale com o administrador.">
            {(p) => <Input {...p} value={profile?.email ?? ''} readOnly />}
          </Field>
          <Field label="Telefone" error={errors.telefone?.message}>
            {(p) => (
              <Input {...p} {...register('telefone', { onBlur: (e) => setValue('telefone', formatTelefone(e.target.value, '')) })} inputMode="tel" placeholder="(21) 99999-0000" className="num" />
            )}
          </Field>
          <Field label="Registro profissional (CREA/CAU)" error={errors.crea_cau?.message}>
            {(p) => <Input {...p} {...register('crea_cau')} placeholder="Ex.: CREA-RJ 2012345678" />}
          </Field>
        </CardBody>
        <CardFooter>
          <Button type="submit" variant="primary" leftIcon={<Save />} loading={salvar.isPending} disabled={!isDirty}>
            Salvar alterações
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function TrocarSenha() {
  const { profile } = useAuth();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TrocarSenhaForm>({ resolver: zodResolver(trocarSenhaSchema), defaultValues: { atual: '', senha: '', confirmacao: '' } });

  const onSubmit = handleSubmit(async (d) => {
    try {
      await authApi.trocarSenha(profile!.email, d.atual, d.senha);
      reset();
      toast.success('Senha alterada');
    } catch (e) {
      const msg = (e as Error).message;
      if (/atual/i.test(msg)) setError('atual', { message: msg });
      else toast.error('Não foi possível alterar a senha', msg);
    }
  });

  return (
    <Card flush as="section">
      <CardHeader eyebrow="02" title="Senha" description="Use pelo menos 8 caracteres; combine letras, números e símbolos." />
      <form onSubmit={onSubmit} noValidate>
        <CardBody className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <Field label="Senha atual" required error={errors.atual?.message}>
            {(p) => <SenhaInput {...p} {...register('atual')} autoComplete="current-password" />}
          </Field>
          <Field label="Nova senha" required error={errors.senha?.message}>
            {(p) => <SenhaInput {...p} {...register('senha')} autoComplete="new-password" />}
          </Field>
          <Field label="Confirmação" required error={errors.confirmacao?.message}>
            {(p) => <SenhaInput {...p} {...register('confirmacao')} autoComplete="new-password" />}
          </Field>
          <div className="md:col-span-3 md:max-w-[33%]">
            <ForcaSenha senha={watch('senha')} />
          </div>
        </CardBody>
        <CardFooter>
          <Button type="submit" leftIcon={<KeyRound />} loading={isSubmitting}>
            Alterar senha
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function Preferencias() {
  const { tema, setTema } = useTheme();
  const { user } = useAuth();
  const escolher = (t: Tema) => {
    setTema(t);
    if (user) void salvarTemaPerfil(user.id, t);
  };
  return (
    <Card flush as="section">
      <CardHeader eyebrow="03" title="Aparência" description="O tema é salvo neste navegador e no seu perfil." />
      <CardBody>
        <Tabs<Tema>
          aria-label="Tema"
          variant="segmented"
          value={tema}
          onChange={escolher}
          items={[
            { value: 'light', label: 'Claro', icon: <Sun /> },
            { value: 'dark', label: 'Escuro', icon: <Moon /> },
            { value: 'system', label: 'Sistema', icon: <Monitor /> },
          ]}
        />
      </CardBody>
    </Card>
  );
}

/** Perfil do usuário: dados, avatar, senha, tema. Dono: FRONTEND-1. */
export default function PerfilPage() {
  const { profile, isAdmin } = useAuth();
  const { organizacoes } = useOrganizacao();
  const toast = useToast();
  const avatar = useEnviarAvatar();
  const { data: avatarUrl } = useArquivoUrl(BUCKETS.avatares, profile?.avatar_path);

  const enviar = (f: File | null) =>
    avatar.mutate(f, {
      onSuccess: () => toast.success(f ? 'Foto atualizada' : 'Foto removida'),
      onError: (e) => toast.error('Não foi possível atualizar a foto', mensagemErro(e)),
    });

  return (
    <>
      <PageHeader title="Meu perfil" description="Seus dados de acesso e preferências." breadcrumbs={[{ label: 'Conta' }, { label: 'Perfil' }]} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <DadosPessoais />
          <TrocarSenha />
          <Preferencias />
        </div>
        <aside className="flex flex-col gap-4">
          <Card cornerMarks>
            <ImagemUpload
              forma="round"
              rotulo="Foto"
              src={avatarUrl}
              vazio={<Avatar name={profile?.nome || profile?.email} size="lg" className="h-full w-full border-0 text-xl" />}
              enviando={avatar.isPending}
              onEscolher={enviar}
              onRemover={() => enviar(null)}
            />
            <dl className="mt-4 divide-y divide-grid border-t border-border text-sm">
              <div className="flex items-center justify-between py-2">
                <dt className="text-fg-muted">Situação</dt>
                <dd>{profile && <Badge variant={BADGE_USER_STATUS[profile.status]} dot>{LABEL_USER_STATUS[profile.status]}</Badge>}</dd>
              </div>
              <div className="flex items-center justify-between py-2">
                <dt className="text-fg-muted">Papel global</dt>
                <dd>{profile && <Badge variant={isAdmin ? 'brand' : 'neutral'}>{LABEL_APP_ROLE[profile.papel_global]}</Badge>}</dd>
              </div>
              <div className="flex items-center justify-between py-2">
                <dt className="text-fg-muted">Último acesso</dt>
                <dd className="num text-xs">{formatDataHora(profile?.ultimo_acesso_em)}</dd>
              </div>
              <div className="flex items-center justify-between py-2">
                <dt className="text-fg-muted">Conta criada</dt>
                <dd className="num text-xs">{formatDataHora(profile?.created_at)}</dd>
              </div>
            </dl>
          </Card>
          <Card flush>
            <CardHeader title="Organizações" description="Escritórios dos quais você participa." />
            <ul className="divide-y divide-grid">
              {organizacoes.length === 0 && <li className="px-4 py-3 text-sm text-fg-muted">Nenhuma organização.</li>}
              {organizacoes.map((o) => (
                <li key={o.organizacao.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="truncate">{o.organizacao.nome}</span>
                  <Badge variant="outline">{LABEL_ORG_ROLE[o.papel]}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}

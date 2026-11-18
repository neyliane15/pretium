import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MoreHorizontal, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useExcluirInsumoProprio, useInsumosProprios, useSalvarInsumoProprio } from '@/api/orcamento/referencias';
import { ErroCarregamento } from '@/components/orcamento/comum';
import {
  Badge, Button, Checkbox, ConfirmDialog, DateInput, DropdownMenu, EmptyState, Field, IconButton, Input, Modal, NumberInput, PageHeader, Select, Skeleton,
  TBody, THead, Table, TableMessage, Td, Th, Tr, useToast,
} from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { formatData, formatNumero } from '@/lib/format';
import { LABEL_INSUMO_TIPO, opcoes } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import { insumoProprioSchema, type InsumoProprioForm } from '@/schemas/orcamento';
import type { Insumo, InsumoTipo } from '@/types/database';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const vazio: InsumoProprioForm = { codigo: '', descricao: '', unidade: 'UN', tipo: 'material', classificacao: '', preco_proprio: null, preco_proprio_data: new Date().toISOString().slice(0, 10), ativo: true };

/** Insumos próprios (cotações permanentes do escritório). Dono: FRONTEND-2. */
export default function InsumosPropriosPage() {
  const { podeEditar } = useOrganizacao();
  const toast = useToast();
  const q = useInsumosProprios();
  const salvar = useSalvarInsumoProprio();
  const excluir = useExcluirInsumoProprio();
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<InsumoTipo | ''>('');
  const [form, setForm] = useState<Insumo | 'novo' | null>(null);
  const [aExcluir, setAExcluir] = useState<Insumo | null>(null);
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<InsumoProprioForm>({ resolver: zodResolver(insumoProprioSchema), defaultValues: vazio });

  useEffect(() => {
    if (form === 'novo') reset(vazio);
    else if (form) reset({ codigo: form.codigo, descricao: form.descricao, unidade: form.unidade, tipo: form.tipo, classificacao: form.classificacao ?? '', preco_proprio: form.preco_proprio, preco_proprio_data: form.preco_proprio_data, ativo: form.ativo });
  }, [form, reset]);

  const lista = useMemo(() => {
    const t = semAcento(busca.trim());
    return (q.data ?? []).filter((i) => (!tipo || i.tipo === tipo) && (!t || semAcento(`${i.codigo} ${i.descricao}`).includes(t)));
  }, [q.data, busca, tipo]);

  const enviar = handleSubmit(async (v) => {
    const d = insumoProprioSchema.parse(v);
    try {
      await salvar.mutateAsync({ ...d, id: form && form !== 'novo' ? form.id : undefined });
      toast.success('Insumo salvo', d.descricao);
      setForm(null);
    } catch (e) {
      toast.error('Não foi possível salvar', mensagemErro(e));
    }
  });

  return (
    <>
      <PageHeader title="Insumos próprios" description="Materiais, mão de obra e serviços com preço do escritório (usado quando não há preço SINAPI na data-base)."
        actions={podeEditar && <Button variant="primary" leftIcon={<Plus />} onClick={() => setForm('novo')}>Novo insumo</Button>} />
      {q.isError ? <ErroCarregamento erro={q.error} onRetry={() => void q.refetch()} /> : q.data?.length === 0 ? (
        <EmptyState icon={<Package />} title="Nenhum insumo próprio" description="Cadastre itens cotados no mercado (porcelanatos, louças, esquadrias…) para usar em orçamentos e composições."
          action={podeEditar && <Button variant="primary" leftIcon={<Plus />} onClick={() => setForm('novo')}>Cadastrar insumo</Button>} />
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <div className="w-80"><Input size="sm" prefix={<Search />} placeholder="Buscar código ou descrição…" aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
            <div className="w-44"><Select size="sm" aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as InsumoTipo | '')} placeholder="Todos os tipos" options={opcoes(LABEL_INSUMO_TIPO)} /></div>
          </div>
          <Table density="compact" stickyHeader containerClassName="max-h-[calc(100vh-230px)]">
            <THead><Tr><Th width={100}>Código</Th><Th>Descrição</Th><Th width={110}>Tipo</Th><Th width={48}>Und</Th><Th numeric width={110}>Preço (R$)</Th><Th numeric width={90}>Data preço</Th><Th width={70}>Situação</Th><Th width={36} /></Tr></THead>
            <TBody>
              {q.isLoading && Array.from({ length: 5 }, (_, i) => <Tr key={i}><Td colSpan={8}><Skeleton className="h-3" /></Td></Tr>)}
              {q.data && lista.length === 0 && <TableMessage colSpan={8}>Nada encontrado.</TableMessage>}
              {lista.map((i) => (
                <Tr key={i.id} interactive={podeEditar} onClick={() => podeEditar && setForm(i)}>
                  <Td mono>{i.codigo}</Td>
                  <Td truncate title={i.descricao}>{i.descricao}</Td>
                  <Td muted className="text-xs">{LABEL_INSUMO_TIPO[i.tipo]}</Td>
                  <Td muted className="text-xs">{i.unidade}</Td>
                  <Td numeric className="font-medium">{formatNumero(i.preco_proprio, 4)}</Td>
                  <Td numeric muted>{formatData(i.preco_proprio_data)}</Td>
                  <Td><Badge variant={i.ativo ? 'success' : 'neutral'} dot>{i.ativo ? 'Ativo' : 'Inativo'}</Badge></Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    {podeEditar && <DropdownMenu align="end" aria-label={`Ações de ${i.codigo}`} trigger={<IconButton size="sm" className="h-5" label="Ações" icon={<MoreHorizontal />} />}
                      items={[{ label: 'Editar', icon: <Pencil />, onSelect: () => setForm(i) }, 'separator', { label: 'Excluir', icon: <Trash2 />, danger: true, onSelect: () => setAExcluir(i) }]} />}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </>
      )}

      <Modal open={form !== null} onClose={() => setForm(null)} size="lg" title={form === 'novo' ? 'Novo insumo próprio' : 'Editar insumo'}
        footer={<><Button onClick={() => setForm(null)}>Cancelar</Button><Button variant="primary" loading={salvar.isPending} onClick={() => void enviar()}>Salvar</Button></>}>
        <form className="grid grid-cols-6 gap-3" onSubmit={(e) => void enviar(e)} noValidate>
          <Field label="Código" required className="col-span-2" error={errors.codigo?.message}>{(p) => <Input {...p} className="font-mono" data-autofocus {...register('codigo')} placeholder="ESC-001" />}</Field>
          <Field label="Unidade" required className="col-span-1" error={errors.unidade?.message}>{(p) => <Input {...p} {...register('unidade')} />}</Field>
          <Field label="Tipo" className="col-span-3">{(p) => <Select {...p} {...register('tipo')} options={opcoes(LABEL_INSUMO_TIPO)} />}</Field>
          <Field label="Descrição" required className="col-span-6" error={errors.descricao?.message}>{(p) => <Input {...p} {...register('descricao')} />}</Field>
          <Field label="Preço (R$)" className="col-span-2" error={errors.preco_proprio?.message}>{(p) => <Controller control={control} name="preco_proprio" render={({ field }) => <NumberInput {...p} decimals={4} min={0} value={field.value} onChange={field.onChange} />} />}</Field>
          <Field label="Data do preço" className="col-span-2">{(p) => <Controller control={control} name="preco_proprio_data" render={({ field }) => <DateInput {...p} value={field.value} onChange={field.onChange} />} />}</Field>
          <Field label="Classificação" className="col-span-2">{(p) => <Input {...p} {...register('classificacao')} placeholder="Revestimentos…" />}</Field>
          <div className="col-span-6"><Controller control={control} name="ativo" render={({ field }) => <Checkbox label="Ativo (aparece na busca de referências)" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />} /></div>
          <button type="submit" hidden />
        </form>
      </Modal>
      <ConfirmDialog open={aExcluir !== null} onClose={() => setAExcluir(null)} destructive loading={excluir.isPending} title={`Excluir ${aExcluir?.codigo}?`}
        description="Insumos em uso não podem ser excluídos — desative-os." confirmLabel="Excluir"
        onConfirm={() => aExcluir && excluir.mutate(aExcluir.id, { onSuccess: () => setAExcluir(null), onError: (e) => toast.error('Não foi possível excluir', mensagemErro(e)) })} />
    </>
  );
}

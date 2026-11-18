import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Calculator, MapPin, Pencil, PencilRuler, Plus } from 'lucide-react';
import { useObra } from '@/api/core/obras';
import { useHonorarios } from '@/api/orcamento/analises';
import { useOrcamentos } from '@/api/orcamento/orcamentos';
import { ObraFormModal } from '@/components/obras/ObraFormModal';
import { Dado, DataBaseTag, ErroCarregamento, StatusObra, StatusOrcamento } from '@/components/orcamento/comum';
import { NovoHonorarioModal } from '@/components/honorarios/NovoHonorarioModal';
import { NovoOrcamentoModal } from '@/components/orcamento/NovoOrcamentoModal';
import {
  Badge, Button, Card, CardHeader, EmptyState, LoadingBlock, PageHeader, Stat, TBody, THead, Table, Td, Th, Tr,
} from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { formatBRL, formatCep, formatData, formatNumero, formatRelativo } from '@/lib/format';
import { LABEL_HONORARIO_STATUS } from '@/lib/labels';
import { BADGE_HONORARIO_STATUS } from '@/lib/labels-orcamento';
import { rotas } from '@/routes';

/** Ficha da obra com orçamentos e honorários. Dono: FRONTEND-2. */
export default function ObraDetalhePage() {
  const { obraId = '' } = useParams();
  const navigate = useNavigate();
  const { podeEditar } = useOrganizacao();
  const obra = useObra(obraId);
  const orcs = useOrcamentos(obraId);
  const hons = useHonorarios(obraId);
  const [editar, setEditar] = useState(false);
  const [novoOrc, setNovoOrc] = useState(false);
  const [novoHon, setNovoHon] = useState(false);

  if (obra.isLoading) return <LoadingBlock />;
  if (obra.isError || !obra.data) return <ErroCarregamento erro={obra.error} onRetry={() => void obra.refetch()} />;
  const o = obra.data;

  const referencia = (orcs.data ?? []).find((x) => x.status === 'aprovado') ?? orcs.data?.[0];
  const custoM2 = referencia && o.area_construida_m2 ? referencia.total / o.area_construida_m2 : null;
  const endereco = [o.logradouro && `${o.logradouro}${o.numero ? ', ' + o.numero : ''}`, o.complemento, o.bairro, o.municipio && `${o.municipio}/${o.uf}`].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader
        title={o.nome}
        description={o.tipo_obra ?? undefined}
        breadcrumbs={[{ label: 'Obras', to: rotas.obras }, { label: o.codigo ?? o.nome }]}
        badges={<StatusObra status={o.status} />}
        actions={
          podeEditar && (
            <>
              <Button leftIcon={<Pencil />} onClick={() => setEditar(true)}>Editar</Button>
              <Button leftIcon={<PencilRuler />} onClick={() => setNovoHon(true)}>Honorários</Button>
              <Button variant="primary" leftIcon={<Plus />} onClick={() => setNovoOrc(true)}>Novo orçamento</Button>
            </>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={referencia?.status === 'aprovado' ? 'Orçamento aprovado' : 'Último orçamento'} value={formatBRL(referencia?.total)} hint={referencia ? `${referencia.nome} · v${referencia.versao}` : 'Sem orçamento'} highlight />
        <Stat label="Custo por m²" value={custoM2 !== null ? formatBRL(custoM2) : '—'} hint={o.area_construida_m2 ? `${formatNumero(o.area_construida_m2)} m² construídos` : 'Informe a área construída'} />
        <Stat label="Orçamentos" value={orcs.data?.length ?? '—'} hint={`${(orcs.data ?? []).filter((x) => x.status === 'aprovado').length} aprovado(s)`} />
        <Stat label="Honorários de projeto" value={formatBRL((hons.data ?? []).filter((h) => h.status !== 'recusado').reduce((s, h) => s + h.total, 0))} hint={`${hons.data?.length ?? 0} proposta(s)`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card flush className="self-start">
          <CardHeader eyebrow={o.codigo ?? 'Obra'} title="Ficha técnica" />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
            <div className="col-span-2"><Dado rotulo="Cliente">{o.cliente ? <Link className="text-primary hover:underline" to={rotas.cliente(o.cliente.id)}>{o.cliente.nome}</Link> : '—'}</Dado></div>
            <div className="col-span-2">
              <Dado rotulo="Endereço">
                <span className="flex items-start gap-1 whitespace-normal"><MapPin aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" />{endereco || '—'}</span>
              </Dado>
            </div>
            <Dado rotulo="CEP" mono>{formatCep(o.cep)}</Dado>
            <Dado rotulo="UF" mono>{o.uf}</Dado>
            <Dado rotulo="Área construída" mono>{o.area_construida_m2 ? `${formatNumero(o.area_construida_m2)} m²` : '—'}</Dado>
            <Dado rotulo="Área do terreno" mono>{o.area_terreno_m2 ? `${formatNumero(o.area_terreno_m2)} m²` : '—'}</Dado>
            <Dado rotulo="Início previsto" mono>{formatData(o.data_inicio_prevista)}</Dado>
            <Dado rotulo="Término previsto" mono>{formatData(o.data_fim_prevista)}</Dado>
            <div className="col-span-2 border-t border-grid pt-3"><Dado rotulo="Responsável técnico">{o.responsavel_tecnico ?? '—'}</Dado></div>
            <Dado rotulo="CREA/CAU" mono>{o.crea_cau ?? '—'}</Dado>
            <Dado rotulo="ART/RRT" mono>{o.art_rrt ?? '—'}</Dado>
            {o.descricao && <div className="col-span-2"><Dado rotulo="Descrição"><span className="whitespace-pre-line">{o.descricao}</span></Dado></div>}
            {o.observacoes && <div className="col-span-2"><Dado rotulo="Observações"><span className="whitespace-pre-line text-fg-muted">{o.observacoes}</span></Dado></div>}
          </dl>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card flush accent>
            <CardHeader eyebrow="Orçamentos" title="Versões e propostas" actions={podeEditar && <Button size="sm" leftIcon={<Plus />} onClick={() => setNovoOrc(true)}>Novo</Button>} />
            {orcs.data && orcs.data.length === 0 ? (
              <EmptyState variant="inline" icon={<Calculator />} title="Nenhum orçamento para esta obra" description="Crie o orçamento analítico com base SINAPI-RJ." className="py-8" />
            ) : (
              <Table containerClassName="rounded-none border-0" className="[&_td]:px-3 [&_th]:px-3">
                <THead>
                  <Tr><Th>Orçamento</Th><Th width={48}>Versão</Th><Th>Data-base</Th><Th>Status</Th><Th numeric>Total (R$)</Th><Th numeric>Atualizado</Th></Tr>
                </THead>
                <TBody>
                  {(orcs.data ?? []).map((x) => (
                    <Tr key={x.id} interactive onClick={() => navigate(rotas.orcamento(x.id))}>
                      <Td className="font-medium">{x.codigo && <span className="mr-1.5 font-mono text-xs text-fg-subtle">{x.codigo}</span>}{x.nome}</Td>
                      <Td mono>v{x.versao}</Td>
                      <Td><DataBaseTag db={x.data_base} /></Td>
                      <Td><StatusOrcamento status={x.status} /></Td>
                      <Td numeric className="font-medium">{formatNumero(x.total)}</Td>
                      <Td numeric muted className="text-xs">{formatRelativo(x.updated_at)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          <Card flush>
            <CardHeader eyebrow="Projeto" title="Honorários de projeto" actions={podeEditar && <Button size="sm" leftIcon={<Plus />} onClick={() => setNovoHon(true)}>Nova proposta</Button>} />
            {hons.data && hons.data.length === 0 ? (
              <EmptyState variant="inline" icon={<PencilRuler />} title="Sem propostas de honorários" description="Monte a proposta por disciplina: arquitetura, estrutura, instalações…" className="py-8" />
            ) : (
              <Table containerClassName="rounded-none border-0" className="[&_td]:px-3 [&_th]:px-3">
                <THead><Tr><Th>Proposta</Th><Th>Status</Th><Th numeric>Área (m²)</Th><Th numeric>Total (R$)</Th><Th numeric>Atualizado</Th></Tr></THead>
                <TBody>
                  {(hons.data ?? []).map((h) => (
                    <Tr key={h.id} interactive onClick={() => navigate(rotas.honorario(h.id))}>
                      <Td className="font-medium">{h.nome}</Td>
                      <Td><Badge variant={BADGE_HONORARIO_STATUS[h.status]} dot>{LABEL_HONORARIO_STATUS[h.status]}</Badge></Td>
                      <Td numeric>{formatNumero(h.area_m2)}</Td>
                      <Td numeric className="font-medium">{formatNumero(h.total)}</Td>
                      <Td numeric muted className="text-xs">{formatRelativo(h.updated_at)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      </div>

      <ObraFormModal open={editar} onClose={() => setEditar(false)} obra={o} />
      <NovoOrcamentoModal open={novoOrc} onClose={() => setNovoOrc(false)} obraId={o.id} />
      <NovoHonorarioModal open={novoHon} onClose={() => setNovoHon(false)} obraId={o.id} />
    </>
  );
}

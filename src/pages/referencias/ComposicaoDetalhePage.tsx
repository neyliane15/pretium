import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { useComposicao } from '@/api/orcamento/referencias';
import { CorpoAnalitico } from '@/components/orcamento/ComposicaoAnaliticaDrawer';
import { Dado, ErroCarregamento } from '@/components/orcamento/comum';
import { SeletorDataBase } from '@/components/referencias/SeletorDataBase';
import { Badge, Button, Card, CardHeader, DemoBadge, LoadingBlock, PageHeader } from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';
import { rotas } from '@/routes';

/** Ficha da composição com analítico na data-base escolhida. Dono: FRONTEND-2. */
export default function ComposicaoDetalhePage() {
  const { composicaoId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { podeEditar } = useOrganizacao();
  const [db, setDb] = useState(params.get('db') ?? '');
  const c = useComposicao(composicaoId);

  if (c.isLoading) return <LoadingBlock />;
  if (c.isError || !c.data) return <ErroCarregamento erro={c.error} />;
  const comp = c.data;

  return (
    <>
      <PageHeader
        title={<><span className="mr-2 font-mono text-lg text-fg-subtle">{comp.codigo}</span>Composição</>}
        breadcrumbs={[{ label: 'Referências', to: rotas.sinapi }, { label: comp.fonte === 'propria' ? 'Composições próprias' : 'SINAPI', to: comp.fonte === 'propria' ? rotas.composicoesProprias : rotas.sinapi }, { label: comp.codigo }]}
        badges={<><Badge variant={comp.fonte === 'propria' ? 'brand' : 'outline'}>{comp.fonte === 'propria' ? 'PRÓPRIA' : 'SINAPI'}</Badge>{comp.is_demo && <DemoBadge />}{!comp.ativo && <Badge>Inativa</Badge>}</>}
        actions={
          <>
            <SeletorDataBase className="w-72" value={db} onChange={(v) => { setDb(v); setParams({ db: v }, { replace: true }); }} />
            {comp.fonte === 'propria' && podeEditar && <Button leftIcon={<Pencil />} onClick={() => navigate(rotas.composicaoPropria(comp.id))}>Editar</Button>}
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card flush className="self-start">
          <CardHeader eyebrow="Ficha" title="Identificação" />
          <dl className="grid grid-cols-2 gap-3 p-4">
            <div className="col-span-2"><Dado rotulo="Descrição"><span className="whitespace-normal">{comp.descricao}</span></Dado></div>
            <Dado rotulo="Código" mono>{comp.codigo}</Dado>
            <Dado rotulo="Unidade" mono>{comp.unidade}</Dado>
            <div className="col-span-2"><Dado rotulo="Grupo / classe">{comp.grupo ?? '—'}</Dado></div>
            {comp.observacao && <div className="col-span-2"><Dado rotulo="Observação"><span className="whitespace-pre-line text-fg-muted">{comp.observacao}</span></Dado></div>}
          </dl>
        </Card>
        <Card flush accent>
          <CardHeader eyebrow="Analítico" title="Insumos e composições auxiliares" description="Custo = Σ coeficiente × preço, arredondado a 2 casas (§8.2)." />
          <div className="p-4">
            {db ? <CorpoAnalitico composicaoId={comp.id} dataBaseId={db} onAbrirSub={(l) => navigate(`${rotas.composicao(l.referencia_id)}?db=${db}`)} /> : <LoadingBlock />}
          </div>
        </Card>
      </div>
    </>
  );
}

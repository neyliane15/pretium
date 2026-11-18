import { Outlet, useParams } from 'react-router-dom';
import { PageHeader, TabLinks } from '@/components/ui';
import { rotas } from '@/routes';

/** Dono: FRONTEND-2. Moldura do orçamento (cabeçalho com totais + abas). */
export default function OrcamentoLayout() {
  const { orcamentoId = '' } = useParams();
  return (
    <>
      <PageHeader title="Orçamento" breadcrumbs={[{ label: 'Orçamentos', to: rotas.orcamentos }, { label: 'Orçamento' }]}>
        <TabLinks
          items={[
            { to: rotas.orcamento(orcamentoId), label: 'Planilha', end: true },
            { to: rotas.orcamentoSintetico(orcamentoId), label: 'Sintético' },
            { to: rotas.orcamentoBdi(orcamentoId), label: 'BDI' },
            { to: rotas.orcamentoCronograma(orcamentoId), label: 'Cronograma' },
            { to: rotas.orcamentoCurvaAbc(orcamentoId), label: 'Curva ABC' },
            { to: rotas.orcamentoMaoObra(orcamentoId), label: 'Mão de obra' },
            { to: rotas.orcamentoMedicoes(orcamentoId), label: 'Medições' },
            { to: rotas.orcamentoRelatorios(orcamentoId), label: 'Relatórios' },
            { to: rotas.orcamentoDados(orcamentoId), label: 'Dados' },
          ]}
        />
      </PageHeader>
      <Outlet />
    </>
  );
}

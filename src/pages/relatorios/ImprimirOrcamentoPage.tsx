import { useParams } from 'react-router-dom';

/**
 * Dono: FRONTEND-2. Página de impressão A4 fora do AppShell
 * (/imprimir/orcamentos/:orcamentoId/:relatorio). Ver docs/ARQUITETURA.md §12.
 */
export default function ImprimirOrcamentoPage() {
  const { orcamentoId, relatorio } = useParams();
  return (
    <div className="mx-auto max-w-[210mm] bg-white p-10 text-black">
      <p className="font-mono text-xs">
        Relatório “{relatorio}” do orçamento {orcamentoId} — em construção (FRONTEND-2).
      </p>
    </div>
  );
}

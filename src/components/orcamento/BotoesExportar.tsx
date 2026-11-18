import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { Button, DropdownMenu } from '@/components/ui';
import { baixarCsv } from '@/lib/export/csv';
import type { TabelaExport } from '@/lib/export/tabela';
import { baixarXlsx } from '@/lib/export/xlsx';

/** Botão "Exportar" (CSV/XLSX) + atalho de impressão. `tabela` é montada só no clique. */
export function BotoesExportar({ tabela, imprimir, disabled }: { tabela: () => TabelaExport | null; imprimir?: string; disabled?: boolean }) {
  const exec = (fn: (t: TabelaExport) => void) => () => {
    const t = tabela();
    if (t) fn(t);
  };
  return (
    <div className="no-print flex items-center gap-1.5">
      {imprimir && <Button size="sm" leftIcon={<Printer />} onClick={() => window.open(imprimir, '_blank')}>Imprimir / PDF</Button>}
      <DropdownMenu
        align="end"
        aria-label="Exportar"
        trigger={<Button size="sm" leftIcon={<Download />} disabled={disabled}>Exportar</Button>}
        items={[
          { label: 'Planilha Excel (.xlsx)', icon: <FileSpreadsheet />, onSelect: exec((t) => baixarXlsx([t])) },
          { label: 'CSV (Excel pt-BR, ;)', icon: <Download />, onSelect: exec(baixarCsv) },
        ]}
      />
    </div>
  );
}

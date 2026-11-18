import { useEffect } from 'react';
import { useDatasBase } from '@/api/orcamento/referencias';
import {} from '@/components/orcamento/comum';
import { rotuloDataBase } from '@/components/orcamento/dataBase';
import { Select } from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';

/** Select de data-base publicada; escolhe automaticamente a mais recente da UF/regime padrão da organização. */
export function SeletorDataBase({ value, onChange, className }: { value: string; onChange: (id: string) => void; className?: string }) {
  const { organizacao } = useOrganizacao();
  const datas = useDatasBase();
  useEffect(() => {
    const lista = datas.data;
    if (!lista?.length) return;
    const uf = organizacao?.uf_padrao ?? 'RJ';
    const reg = organizacao?.regime_padrao ?? 'nao_desonerado';
    const atual = lista.find((x) => x.id === value);
    // sem seleção (ou seleção que sumiu): oficial mais recente da UF/regime padrão
    if (!atual) {
      const d = lista.find((x) => x.uf === uf && x.regime === reg && !x.is_demo) ?? lista.find((x) => !x.is_demo) ?? lista.find((x) => x.uf === uf && x.regime === reg) ?? lista[0]!;
      onChange(d.id);
      return;
    }
    // estava em dados de exemplo e chegou tabela oficial (ex.: acabou de importar): troca para a oficial
    if (atual.is_demo) {
      const oficial = lista.find((x) => !x.is_demo && x.uf === atual.uf && x.regime === atual.regime) ?? lista.find((x) => !x.is_demo && x.uf === uf && x.regime === reg);
      if (oficial) onChange(oficial.id);
    }
  }, [value, datas.data, organizacao, onChange]);
  return (
    <div className={className}>
      <Select size="sm" aria-label="Data-base" value={value} onChange={(e) => onChange(e.target.value)}
        options={(datas.data ?? []).map((d) => ({ value: d.id, label: `${rotuloDataBase(d)}${d.is_demo ? ' · EXEMPLO' : ''}` }))} placeholder={datas.isLoading ? 'Carregando…' : 'Data-base'} />
    </div>
  );
}

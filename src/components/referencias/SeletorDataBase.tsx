import { useEffect } from 'react';
import { useDatasBase } from '@/api/orcamento/referencias';
import { rotuloDataBase } from '@/components/orcamento/comum';
import { Select } from '@/components/ui';
import { useOrganizacao } from '@/contexts/OrganizacaoContext';

/** Select de data-base publicada; escolhe automaticamente a mais recente da UF/regime padrão da organização. */
export function SeletorDataBase({ value, onChange, className }: { value: string; onChange: (id: string) => void; className?: string }) {
  const { organizacao } = useOrganizacao();
  const datas = useDatasBase();
  useEffect(() => {
    if (value || !datas.data?.length) return;
    const uf = organizacao?.uf_padrao ?? 'RJ';
    const reg = organizacao?.regime_padrao ?? 'nao_desonerado';
    const d = datas.data.find((x) => x.uf === uf && x.regime === reg && !x.is_demo) ?? datas.data.find((x) => x.uf === uf && x.regime === reg) ?? datas.data[0]!;
    onChange(d.id);
  }, [value, datas.data, organizacao, onChange]);
  return (
    <div className={className}>
      <Select size="sm" aria-label="Data-base" value={value} onChange={(e) => onChange(e.target.value)}
        options={(datas.data ?? []).map((d) => ({ value: d.id, label: `${rotuloDataBase(d)}${d.is_demo ? ' · EXEMPLO' : ''}` }))} placeholder={datas.isLoading ? 'Carregando…' : 'Data-base'} />
    </div>
  );
}

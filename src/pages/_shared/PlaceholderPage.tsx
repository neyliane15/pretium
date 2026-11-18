import { Construction } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/ui';

export interface PlaceholderPageProps {
  titulo: string;
  descricao?: string;
  /** agente responsável por implementar a página */
  dono: 'FRONTEND-1' | 'FRONTEND-2';
}

/** Página provisória — substituída pela implementação real do agente dono. */
export function PlaceholderPage({ titulo, descricao, dono }: PlaceholderPageProps) {
  return (
    <>
      <PageHeader title={titulo} description={descricao} />
      <EmptyState icon={<Construction />} title="Em construção" description={`Esta tela será implementada por ${dono}.`} />
    </>
  );
}

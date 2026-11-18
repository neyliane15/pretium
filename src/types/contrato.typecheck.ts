/**
 * Verificação estática do contrato de tipos com o supabase-js (não é importado em runtime).
 * Se `npm run typecheck` falhar aqui, o `Database` deixou de ser compatível com o client.
 */
import { supabase } from '@/lib/supabase';

export async function _contrato() {
  const orc = await supabase.from('orcamentos').select('id, total, status').single();
  const total: number | undefined = orc.data?.total;

  // @ts-expect-error coluna inexistente deve falhar
  await supabase.from('orcamentos').select('*').eq('coluna_que_nao_existe', 1);

  const comObra = await supabase.from('orcamentos').select('id, obra:obras(nome)').single();
  const nomeObra: string | undefined = comObra.data?.obra?.nome;

  const rpc = await supabase.rpc('fn_orcamento_recalcular', { p_orcamento_id: 'x' });
  const recalc: number | undefined = rpc.data?.total_sem_bdi;

  // @ts-expect-error argumento obrigatório ausente
  await supabase.rpc('fn_curva_abc_servicos', {});

  const abc = await supabase.rpc('fn_curva_abc_servicos', { p_orcamento_id: 'x' });
  const classe: 'A' | 'B' | 'C' | undefined = abc.data?.[0]?.classe;

  await supabase.from('orcamento_itens').insert({ orcamento_id: 'o', etapa_id: 'e', referencia_tipo: 'livre', descricao: 'Item', unidade: 'UN' });

  return { total, nomeObra, recalc, classe };
}

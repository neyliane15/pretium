import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useObras } from '@/api/core/obras';
import { useCriarHonorario } from '@/api/orcamento/analises';
import { useOrcamentos } from '@/api/orcamento/orcamentos';
import { Button, Field, Input, Modal, NumberInput, Select, useToast } from '@/components/ui';
import { formatBRL } from '@/lib/format';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';

/** Nova proposta de honorários de projeto para uma obra. */
export function NovoHonorarioModal({ open, onClose, obraId }: { open: boolean; onClose: () => void; obraId?: string | null }) {
  const navigate = useNavigate();
  const toast = useToast();
  const obras = useObras();
  const criar = useCriarHonorario();
  const [obra, setObra] = useState(obraId ?? '');
  const [nome, setNome] = useState('');
  const [area, setArea] = useState<number | null>(null);
  const [orc, setOrc] = useState('');
  const orcs = useOrcamentos(obra || undefined);

  useEffect(() => {
    if (!open) return;
    setObra(obraId ?? '');
    setOrc('');
  }, [open, obraId]);
  useEffect(() => {
    const o = obras.data?.find((x) => x.id === obra);
    setArea(o?.area_construida_m2 ?? null);
    setNome(o ? `Proposta de projeto – ${o.nome}` : '');
  }, [obra, obras.data]);

  const enviar = async () => {
    if (!obra || nome.trim().length < 2) {
      toast.error('Preencha a obra e o nome da proposta');
      return;
    }
    try {
      const id = await criar.mutateAsync({ obra_id: obra, nome: nome.trim(), area_m2: area, orcamento_id: orc || null });
      onClose();
      navigate(rotas.honorario(id));
    } catch (e) {
      toast.error('Não foi possível criar a proposta', mensagemErro(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova proposta de honorários"
      description="Disciplinas, métodos de cálculo e condições são definidos a seguir."
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={criar.isPending} onClick={() => void enviar()}>Criar proposta</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Obra" required>{(p) => <Select {...p} value={obra} onChange={(e) => setObra(e.target.value)} placeholder="Selecione…" options={(obras.data ?? []).map((o) => ({ value: o.id, label: o.nome }))} />}</Field>
        <Field label="Nome da proposta" required>{(p) => <Input {...p} value={nome} onChange={(e) => setNome(e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Área de projeto" hint="Padrão das disciplinas por m²">{(p) => <NumberInput {...p} value={area} onChange={setArea} min={0} suffix="m²" />}</Field>
          <Field label="Orçamento de referência" hint="Base do método % da obra">
            {(p) => <Select {...p} value={orc} onChange={(e) => setOrc(e.target.value)} placeholder="— nenhum —" options={(orcs.data ?? []).map((o) => ({ value: o.id, label: `${o.nome} v${o.versao} · ${formatBRL(o.total)}` }))} />}
          </Field>
        </div>
      </div>
    </Modal>
  );
}

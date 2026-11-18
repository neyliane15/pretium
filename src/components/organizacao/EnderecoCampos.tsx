import type { FieldErrors, UseFormRegister, UseFormSetValue, FieldValues, Path, PathValue } from 'react-hook-form';
import { Field, Input, Select } from '@/components/ui';
import { formatCep } from '@/lib/format';
import { UFS } from '@/lib/labels';

interface CamposEndereco {
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
}

/** Bloco de endereço reutilizado (organização, clientes). Grade 6 colunas. */
export function EnderecoCampos<T extends FieldValues>({
  register,
  errors,
  setValue,
  disabled,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  setValue: UseFormSetValue<T>;
  disabled?: boolean;
}) {
  const e = errors as unknown as FieldErrors<CamposEndereco>;
  const n = (k: keyof CamposEndereco) => k as Path<T>;
  return (
    <div className="grid grid-cols-6 gap-x-4 gap-y-3">
      <Field label="CEP" error={e.cep?.message} className="col-span-6 sm:col-span-2">
        {(p) => (
          <Input
            {...p}
            {...register(n('cep'), { onBlur: (ev) => setValue(n('cep'), formatCep(ev.target.value, '') as PathValue<T, Path<T>>) })}
            inputMode="numeric"
            placeholder="00000-000"
            className="num"
            disabled={disabled}
          />
        )}
      </Field>
      <Field label="Logradouro" error={e.logradouro?.message} className="col-span-6 sm:col-span-4">
        {(p) => <Input {...p} {...register(n('logradouro'))} disabled={disabled} />}
      </Field>
      <Field label="Número" error={e.numero?.message} className="col-span-2 sm:col-span-1">
        {(p) => <Input {...p} {...register(n('numero'))} disabled={disabled} />}
      </Field>
      <Field label="Complemento" error={e.complemento?.message} className="col-span-4 sm:col-span-2">
        {(p) => <Input {...p} {...register(n('complemento'))} disabled={disabled} />}
      </Field>
      <Field label="Bairro" error={e.bairro?.message} className="col-span-6 sm:col-span-3">
        {(p) => <Input {...p} {...register(n('bairro'))} disabled={disabled} />}
      </Field>
      <Field label="Município" error={e.municipio?.message} className="col-span-4 sm:col-span-4">
        {(p) => <Input {...p} {...register(n('municipio'))} disabled={disabled} />}
      </Field>
      <Field label="UF" error={e.uf?.message} className="col-span-2 sm:col-span-2">
        {(p) => <Select {...p} {...register(n('uf'))} placeholder="—" options={UFS.map((u) => ({ value: u, label: u }))} disabled={disabled} />}
      </Field>
    </div>
  );
}

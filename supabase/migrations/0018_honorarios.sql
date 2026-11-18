-- =============================================================================
-- 0018 — BACKEND-2: honorários de projeto (§5.4, §8.7)
-- =============================================================================

create table honorarios (
  id                  uuid primary key default gen_random_uuid(),
  organizacao_id      uuid not null references organizacoes(id) on delete cascade,
  obra_id             uuid not null references obras(id) on delete cascade,
  orcamento_id        uuid null references orcamentos(id) on delete set null,
  nome                text not null check (btrim(nome) <> ''),
  status              honorario_status not null default 'rascunho',
  area_m2             numeric(14,2) null check (area_m2 is null or area_m2 >= 0),
  impostos_percentual numeric(9,4) not null default 0 check (impostos_percentual >= 0 and impostos_percentual < 100),
  desconto_percentual numeric(9,4) not null default 0 check (desconto_percentual >= 0 and desconto_percentual <= 100),
  subtotal            numeric(16,2) not null default 0,
  total               numeric(16,2) not null default 0,
  validade_dias       integer not null default 30 check (validade_dias >= 0),
  condicoes_pagamento text null,
  observacoes         text null,
  created_by          uuid null default auth.uid() references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index honorarios_org_idx on honorarios (organizacao_id, updated_at desc);
create index honorarios_obra_idx on honorarios (obra_id);
create index honorarios_orcamento_idx on honorarios (orcamento_id) where orcamento_id is not null;
create trigger trg_10_honorarios_herda_org before insert or update of obra_id, organizacao_id on honorarios
  for each row execute function fn_herda_organizacao('obras', 'obra_id');
create trigger trg_honorarios_updated_at before update on honorarios
  for each row execute function set_updated_at();
create trigger trg_honorarios_auditoria after insert or update or delete on honorarios
  for each row execute function fn_auditoria_trigger();

create table honorario_disciplinas (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  honorario_id   uuid not null references honorarios(id) on delete cascade,
  disciplina     disciplina_projeto not null,
  descricao      text null,
  metodo         honorario_metodo not null,
  area_m2        numeric(14,2) null,
  valor_m2       numeric(14,2) null,
  valor_obra     numeric(16,2) null,
  percentual     numeric(9,4) null,
  horas          numeric(10,2) null,
  valor_hora     numeric(14,2) null,
  valor_fixo     numeric(16,2) null,
  valor          numeric(16,2) not null default 0,
  prazo_dias     integer null,
  ordem          integer not null default 0
);
create index honorario_disciplinas_honorario_idx on honorario_disciplinas (honorario_id, ordem);
create index honorario_disciplinas_org_idx on honorario_disciplinas (organizacao_id);
create trigger trg_10_honorario_disciplinas_herda_org before insert or update of honorario_id, organizacao_id on honorario_disciplinas
  for each row execute function fn_herda_organizacao('honorarios', 'honorario_id');

-- Valor da disciplina (§8.7) — idêntico a valorDisciplina() de calc.ts
create or replace function fn_honorario_valor_disciplina(
  p_metodo honorario_metodo, p_area_m2 numeric, p_valor_m2 numeric, p_valor_obra numeric, p_percentual numeric,
  p_horas numeric, p_valor_hora numeric, p_valor_fixo numeric, p_area_padrao numeric, p_valor_obra_padrao numeric
) returns numeric language sql immutable as $$
  select case p_metodo
    when 'area' then round(coalesce(p_area_m2, p_area_padrao, 0) * coalesce(p_valor_m2, 0), 2)
    when 'percentual_obra' then round(coalesce(p_valor_obra, p_valor_obra_padrao, 0) * coalesce(p_percentual, 0) / 100, 2)
    when 'horas' then round(coalesce(p_horas, 0) * coalesce(p_valor_hora, 0), 2)
    when 'fixo' then round(coalesce(p_valor_fixo, 0), 2)
  end
$$;

-- total = round2(subtotal × (1 − desc/100) / (1 − imp/100)) — idêntico a totalHonorarios()
create or replace function fn_honorario_total(p_subtotal numeric, p_desconto numeric, p_impostos numeric)
returns numeric language sql immutable as $$
  select round(coalesce(p_subtotal, 0) * (1 - coalesce(p_desconto, 0) / 100) / (1 - coalesce(p_impostos, 0) / 100), 2)
$$;

create or replace function fn_honorario_disciplinas_calc() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_area  numeric;
  v_obra  numeric;
begin
  select h.area_m2, o.total into v_area, v_obra
    from honorarios h left join orcamentos o on o.id = h.orcamento_id
   where h.id = new.honorario_id;
  new.valor := fn_honorario_valor_disciplina(new.metodo, new.area_m2, new.valor_m2, new.valor_obra, new.percentual,
                                             new.horas, new.valor_hora, new.valor_fixo, v_area, v_obra);
  return new;
end $$;
create trigger trg_20_honorario_disciplinas_calc before insert or update on honorario_disciplinas
  for each row execute function fn_honorario_disciplinas_calc();

create or replace function fn_honorario_disciplinas_totaliza() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update honorarios h
     set subtotal = coalesce((select sum(d.valor) from honorario_disciplinas d where d.honorario_id = h.id), 0)
   where h.id in (select (case when tg_op = 'DELETE' then old.honorario_id else new.honorario_id end)
                  union select (case when tg_op = 'UPDATE' then old.honorario_id end));
  return null;
end $$;
create trigger trg_honorario_disciplinas_totaliza after insert or update or delete on honorario_disciplinas
  for each row execute function fn_honorario_disciplinas_totaliza();

-- total do cabeçalho sempre coerente com subtotal/desconto/impostos
create or replace function fn_honorarios_calc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.orcamento_id is not null and (tg_op = 'INSERT' or new.orcamento_id is distinct from old.orcamento_id)
     and not exists (select 1 from orcamentos o where o.id = new.orcamento_id and o.obra_id = new.obra_id) then
    raise exception 'O orçamento deve ser da mesma obra.' using errcode = 'P0001';
  end if;
  new.total := fn_honorario_total(new.subtotal, new.desconto_percentual, new.impostos_percentual);
  return new;
end $$;
create trigger trg_20_honorarios_calc before insert or update on honorarios
  for each row execute function fn_honorarios_calc();

revoke execute on function fn_honorario_disciplinas_calc(), fn_honorario_disciplinas_totaliza(), fn_honorarios_calc()
  from public, anon;

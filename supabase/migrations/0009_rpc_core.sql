-- ============================================================================
-- 0009 — RPCs do núcleo (BACKEND-1)
-- Contrato: docs/ARQUITETURA.md §7.1 (assinaturas exatas)
-- Erros de negócio: P0001; permissão: 42501. Mensagens em pt-BR.
-- ============================================================================

-- Interno: exige usuário autenticado e ativo.
create or replace function public.fn_exige_ativo()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.' using errcode = '42501';
  end if;
  if not public.is_active_user() then
    raise exception 'Sua conta não está ativa' using errcode = '42501';
  end if;
end;
$$;

-- Interno: trava a organização e garante que restará ao menos um owner
-- caso p_user_id deixe de ser owner.
create or replace function public.fn_garante_outro_owner(p_organizacao_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.organizacoes o where o.id = p_organizacao_id for update;
  if exists (
       select 1 from public.organizacao_membros m
        where m.organizacao_id = p_organizacao_id and m.user_id = p_user_id and m.papel = 'owner'
     )
     and not exists (
       select 1 from public.organizacao_membros m
        where m.organizacao_id = p_organizacao_id and m.user_id <> p_user_id and m.papel = 'owner'
     ) then
    raise exception 'A organização precisa de pelo menos um proprietário' using errcode = 'P0001';
  end if;
end;
$$;

-- ─── registrar_acesso ───────────────────────────────────────────────────────
create or replace function public.registrar_acesso()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.' using errcode = '42501';
  end if;

  update public.profiles set ultimo_acesso_em = now() where id = v_uid;

  if not exists (
    select 1 from public.auditoria_logs a
     where a.user_id = v_uid and a.acao = 'login' and a.created_at > now() - interval '1 hour'
  ) then
    perform public.registrar_auditoria('login', 'profiles', v_uid::text);
  end if;
end;
$$;

-- ─── criar_organizacao ──────────────────────────────────────────────────────
create or replace function public.criar_organizacao(p_nome text, p_cnpj text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_nome text := btrim(coalesce(p_nome, ''));
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), '');
  v_uf   text;
  v_id   uuid;
begin
  perform public.fn_exige_ativo();

  if v_nome = '' then
    raise exception 'Informe o nome da organização' using errcode = 'P0001';
  end if;
  if char_length(v_nome) > 200 then
    raise exception 'Nome da organização muito longo' using errcode = 'P0001';
  end if;
  if v_cnpj is not null and v_cnpj !~ '^\d{14}$' then
    raise exception 'CNPJ inválido' using errcode = 'P0001';
  end if;

  v_uf := upper(coalesce(public.fn_config('uf_padrao') #>> '{}', 'RJ'));
  if v_uf !~ '^[A-Z]{2}$' then v_uf := 'RJ'; end if;

  insert into public.organizacoes (nome, cnpj, uf_padrao, created_by)
  values (v_nome, v_cnpj, v_uf, v_uid)
  returning id into v_id;

  insert into public.organizacao_membros (organizacao_id, user_id, papel, convidado_por)
  values (v_id, v_uid, 'owner', null);

  update public.profiles set organizacao_ativa_id = v_id where id = v_uid;

  return v_id;
end;
$$;

-- ─── definir_organizacao_ativa ──────────────────────────────────────────────
create or replace function public.definir_organizacao_ativa(p_organizacao_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_exige_ativo();
  if p_organizacao_id is not null and not public.is_org_member(p_organizacao_id) then
    raise exception 'Você não participa desta organização' using errcode = '42501';
  end if;
  update public.profiles set organizacao_ativa_id = p_organizacao_id where id = auth.uid();
end;
$$;

-- ─── convidar_membro ────────────────────────────────────────────────────────
create or replace function public.convidar_membro(p_organizacao_id uuid, p_email text, p_papel public.org_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_dias    integer;
  v_id      uuid;
begin
  perform public.fn_exige_ativo();
  if not public.is_org_owner(p_organizacao_id) then
    raise exception 'Apenas o proprietário pode convidar membros' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido' using errcode = 'P0001';
  end if;
  if p_papel is null then
    raise exception 'Informe o papel do convidado' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.organizacao_membros m
      join public.profiles p on p.id = m.user_id
     where m.organizacao_id = p_organizacao_id and lower(p.email::text) = v_email
  ) then
    raise exception 'Este e-mail já é membro da organização' using errcode = 'P0001';
  end if;

  begin
    v_dias := (public.fn_config('convite_validade_dias') #>> '{}')::integer;
  exception when others then
    v_dias := null;
  end;
  v_dias := greatest(1, least(coalesce(v_dias, 7), 365));

  select c.id into v_id
    from public.convites c
   where c.organizacao_id = p_organizacao_id and lower(c.email::text) = v_email and c.status = 'pending'
   for update;

  if v_id is not null then
    update public.convites
       set expira_em = now() + make_interval(days => v_dias),
           papel = p_papel,
           convidado_por = auth.uid()
     where id = v_id;
    return v_id;
  end if;

  insert into public.convites (organizacao_id, email, papel, convidado_por, expira_em)
  values (p_organizacao_id, v_email, p_papel, auth.uid(), now() + make_interval(days => v_dias))
  returning id into v_id;
  return v_id;
end;
$$;

-- ─── aceitar_convite ────────────────────────────────────────────────────────
create or replace function public.aceitar_convite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text;
  v_conv   public.convites%rowtype;
begin
  perform public.fn_exige_ativo();

  select * into v_conv from public.convites c where c.token = p_token for update;
  if not found then
    raise exception 'Convite não encontrado' using errcode = 'P0001';
  end if;
  if v_conv.status <> 'pending' then
    raise exception 'Este convite não está mais disponível' using errcode = 'P0001';
  end if;
  if v_conv.expira_em <= now() then
    raise exception 'Este convite expirou. Peça um novo convite.' using errcode = 'P0001';
  end if;

  v_email := lower(public.fn_email_usuario_atual()::text);
  if v_email is null or v_email <> lower(v_conv.email::text) then
    raise exception 'Este convite foi enviado para outro e-mail' using errcode = '42501';
  end if;

  insert into public.organizacao_membros (organizacao_id, user_id, papel, convidado_por)
  values (v_conv.organizacao_id, v_uid, v_conv.papel, v_conv.convidado_por)
  on conflict (organizacao_id, user_id) do update
    set papel = case when public.organizacao_membros.papel = 'owner' then 'owner'::public.org_role
                     else excluded.papel end;

  update public.convites
     set status = 'accepted', aceito_por = v_uid, aceito_em = now()
   where id = v_conv.id;

  update public.profiles
     set organizacao_ativa_id = v_conv.organizacao_id
   where id = v_uid and organizacao_ativa_id is null;

  return v_conv.organizacao_id;
end;
$$;

-- ─── revogar_convite ────────────────────────────────────────────────────────
create or replace function public.revogar_convite(p_convite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.convites%rowtype;
begin
  perform public.fn_exige_ativo();
  select * into v_conv from public.convites c where c.id = p_convite_id for update;
  if not found or not public.is_org_owner(v_conv.organizacao_id) then
    -- não revela a existência do convite a quem não é owner
    if not found then
      raise exception 'Convite não encontrado' using errcode = 'P0001';
    end if;
    raise exception 'Apenas o proprietário pode revogar convites' using errcode = '42501';
  end if;
  if v_conv.status <> 'pending' then
    raise exception 'Somente convites pendentes podem ser revogados' using errcode = 'P0001';
  end if;
  update public.convites set status = 'revoked' where id = p_convite_id;
end;
$$;

-- ─── meus_convites ──────────────────────────────────────────────────────────
create or replace function public.meus_convites()
returns setof public.convites
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
    from public.convites c
   where public.is_active_user()
     and lower(c.email::text) = lower(public.fn_email_usuario_atual()::text)
     and c.status = 'pending'
     and c.expira_em > now()
   order by c.created_at desc;
$$;

-- ─── obter_convite ──────────────────────────────────────────────────────────
-- Acesso por posse do token (segredo do link). Status 'pending' vencido é
-- reportado como 'expired'.
create or replace function public.obter_convite(p_token uuid)
returns table (
  id uuid, organizacao_id uuid, organizacao_nome text, email extensions.citext,
  papel public.org_role, status public.invite_status, expira_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.organizacao_id, o.nome, c.email, c.papel,
         case when c.status = 'pending' and c.expira_em <= now()
              then 'expired'::public.invite_status else c.status end,
         c.expira_em
    from public.convites c
    join public.organizacoes o on o.id = c.organizacao_id
   where auth.uid() is not null and c.token = p_token;
$$;

-- ─── alterar_papel_membro ───────────────────────────────────────────────────
create or replace function public.alterar_papel_membro(p_organizacao_id uuid, p_user_id uuid, p_papel public.org_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_exige_ativo();
  if not public.is_org_owner(p_organizacao_id) then
    raise exception 'Apenas o proprietário pode alterar papéis' using errcode = '42501';
  end if;
  if p_papel is null then
    raise exception 'Informe o papel' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.organizacao_membros m
     where m.organizacao_id = p_organizacao_id and m.user_id = p_user_id
  ) then
    raise exception 'Membro não encontrado' using errcode = 'P0001';
  end if;
  if p_papel <> 'owner' then
    perform public.fn_garante_outro_owner(p_organizacao_id, p_user_id);
  end if;
  update public.organizacao_membros
     set papel = p_papel
   where organizacao_id = p_organizacao_id and user_id = p_user_id;
end;
$$;

-- ─── remover_membro ─────────────────────────────────────────────────────────
create or replace function public.remover_membro(p_organizacao_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_exige_ativo();
  if not (public.is_org_owner(p_organizacao_id)
          or (p_user_id = auth.uid() and public.org_papel(p_organizacao_id) is not null)) then
    raise exception 'Apenas o proprietário pode remover membros' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organizacao_membros m
     where m.organizacao_id = p_organizacao_id and m.user_id = p_user_id
  ) then
    raise exception 'Membro não encontrado' using errcode = 'P0001';
  end if;
  perform public.fn_garante_outro_owner(p_organizacao_id, p_user_id);
  delete from public.organizacao_membros
   where organizacao_id = p_organizacao_id and user_id = p_user_id;
end;
$$;

-- ─── listar_membros ─────────────────────────────────────────────────────────
create or replace function public.listar_membros(p_organizacao_id uuid)
returns table (
  user_id uuid, nome text, email extensions.citext, papel public.org_role,
  avatar_path text, created_at timestamptz, ultimo_acesso_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_organizacao_id) then
    raise exception 'Você não participa desta organização' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.nome, p.email, m.papel, p.avatar_path, m.created_at, p.ultimo_acesso_em
      from public.organizacao_membros m
      join public.profiles p on p.id = m.user_id
     where m.organizacao_id = p_organizacao_id
     order by case m.papel when 'owner' then 0 when 'editor' then 1 else 2 end, p.nome;
end;
$$;

-- ─── admin_listar_usuarios ──────────────────────────────────────────────────
create or replace function public.admin_listar_usuarios(
  p_busca  text default null,
  p_status public.user_status default null,
  p_limite integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, email extensions.citext, nome text, papel_global public.app_role,
  status public.user_status, motivo_bloqueio text, created_at timestamptz,
  ultimo_acesso_em timestamptz, organizacoes jsonb, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
  v_like  text;
begin
  perform public.assert_admin();
  if v_busca is not null then
    v_like := '%' || replace(replace(replace(lower(v_busca), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
    select p.id, p.email, p.nome, p.papel_global, p.status, p.motivo_bloqueio, p.created_at,
           p.ultimo_acesso_em,
           coalesce((
             select jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.nome, 'papel', m.papel) order by o.nome)
               from public.organizacao_membros m
               join public.organizacoes o on o.id = m.organizacao_id
              where m.user_id = p.id
           ), '[]'::jsonb),
           count(*) over ()
      from public.profiles p
     where (p_status is null or p.status = p_status)
       and (v_like is null or lower(p.nome) like v_like or lower(p.email::text) like v_like)
     order by (p.status = 'pending') desc, p.created_at desc
     limit greatest(1, least(coalesce(p_limite, 50), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- ─── admin_definir_status_usuario ───────────────────────────────────────────
create or replace function public.admin_definir_status_usuario(
  p_user_id uuid, p_status public.user_status, p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes public.user_status;
begin
  perform public.assert_admin();
  if p_status is null then
    raise exception 'Informe a situação' using errcode = 'P0001';
  end if;
  if p_user_id = auth.uid() and p_status <> 'active' then
    raise exception 'Você não pode bloquear ou suspender a própria conta' using errcode = 'P0001';
  end if;

  select p.status into v_antes from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'Usuário não encontrado' using errcode = 'P0001';
  end if;

  update public.profiles
     set status          = p_status,
         motivo_bloqueio = case when p_status = 'blocked' then nullif(btrim(coalesce(p_motivo, '')), '') else null end,
         aprovado_por    = case when p_status = 'active' then auth.uid() else aprovado_por end,
         aprovado_em     = case when p_status = 'active' then now() else aprovado_em end
   where id = p_user_id;

  perform public.registrar_auditoria(
    case p_status when 'active' then 'aprovar_usuario'
                  when 'blocked' then 'bloquear_usuario'
                  else 'alterar_status_usuario' end,
    'profiles', p_user_id::text,
    jsonb_build_object('status_anterior', v_antes, 'status', p_status, 'motivo', p_motivo));
end;
$$;

-- ─── admin_definir_papel_global ─────────────────────────────────────────────
create or replace function public.admin_definir_papel_global(p_user_id uuid, p_papel public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes public.app_role;
begin
  perform public.assert_admin();
  if p_papel is null then
    raise exception 'Informe o papel' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('pretium.admins'));

  select p.papel_global into v_antes from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'Usuário não encontrado' using errcode = 'P0001';
  end if;

  if v_antes = 'admin' and p_papel <> 'admin' and not exists (
    select 1 from public.profiles p
     where p.papel_global = 'admin' and p.status = 'active' and p.id <> p_user_id
  ) then
    raise exception 'Não é possível rebaixar o último administrador' using errcode = 'P0001';
  end if;

  update public.profiles set papel_global = p_papel where id = p_user_id;

  perform public.registrar_auditoria('alterar_papel', 'profiles', p_user_id::text,
    jsonb_build_object('papel_anterior', v_antes, 'papel', p_papel));
end;
$$;

-- ─── admin_definir_status_organizacao ───────────────────────────────────────
create or replace function public.admin_definir_status_organizacao(p_organizacao_id uuid, p_status public.org_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_status is null then
    raise exception 'Informe a situação' using errcode = 'P0001';
  end if;
  update public.organizacoes set status = p_status where id = p_organizacao_id;
  if not found then
    raise exception 'Organização não encontrada' using errcode = 'P0001';
  end if;
end;
$$;

-- ─── admin_adicionar_membro ─────────────────────────────────────────────────
create or replace function public.admin_adicionar_membro(p_organizacao_id uuid, p_user_id uuid, p_papel public.org_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_papel is null then
    raise exception 'Informe o papel' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.organizacoes o where o.id = p_organizacao_id) then
    raise exception 'Organização não encontrada' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'Usuário não encontrado' using errcode = 'P0001';
  end if;
  if p_papel <> 'owner' then
    perform public.fn_garante_outro_owner(p_organizacao_id, p_user_id);
  end if;

  insert into public.organizacao_membros (organizacao_id, user_id, papel, convidado_por)
  values (p_organizacao_id, p_user_id, p_papel, auth.uid())
  on conflict (organizacao_id, user_id) do update set papel = excluded.papel;

  update public.profiles
     set organizacao_ativa_id = p_organizacao_id
   where id = p_user_id and organizacao_ativa_id is null;
end;
$$;

-- ─── admin_definir_configuracao ─────────────────────────────────────────────
create or replace function public.admin_definir_configuracao(p_chave text, p_valor jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text := btrim(coalesce(p_chave, ''));
  v_valor jsonb := coalesce(p_valor, 'null'::jsonb);
  v_antes jsonb;
begin
  perform public.assert_admin();
  if v_chave !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'Chave de configuração inválida' using errcode = 'P0001';
  end if;

  -- Validação de tipo das chaves conhecidas.
  case v_chave
    when 'admin_emails' then
      if jsonb_typeof(v_valor) <> 'array' or exists (
           select 1 from jsonb_array_elements(v_valor) e
            where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
        raise exception 'admin_emails deve ser uma lista de e-mails' using errcode = 'P0001';
      end if;
      select coalesce(jsonb_agg(distinct lower(btrim(e))), '[]'::jsonb) into v_valor
        from jsonb_array_elements_text(v_valor) e;
    when 'aprovacao_obrigatoria', 'cadastro_aberto' then
      if jsonb_typeof(v_valor) <> 'boolean' then
        raise exception 'Valor deve ser verdadeiro ou falso' using errcode = 'P0001';
      end if;
    when 'uf_padrao' then
      if jsonb_typeof(v_valor) <> 'string' or (v_valor #>> '{}') !~ '^[A-Z]{2}$' then
        raise exception 'UF inválida' using errcode = 'P0001';
      end if;
    when 'aviso_global' then
      if jsonb_typeof(v_valor) not in ('string', 'null') then
        raise exception 'O aviso deve ser um texto' using errcode = 'P0001';
      end if;
    when 'convite_validade_dias' then
      if jsonb_typeof(v_valor) <> 'number' or (v_valor #>> '{}')::numeric not between 1 and 365
         or (v_valor #>> '{}')::numeric <> trunc((v_valor #>> '{}')::numeric) then
        raise exception 'Validade deve ser um número inteiro de 1 a 365 dias' using errcode = 'P0001';
      end if;
    else
      null;
  end case;

  select c.valor into v_antes from public.configuracoes c where c.chave = v_chave;

  insert into public.configuracoes (chave, valor, updated_by)
  values (v_chave, v_valor, auth.uid())
  on conflict (chave) do update set valor = excluded.valor, updated_by = excluded.updated_by;

  perform public.registrar_auditoria('config', 'configuracoes', v_chave,
    jsonb_build_object('antes', v_antes, 'depois', v_valor));
end;
$$;

-- ─── admin_estatisticas ─────────────────────────────────────────────────────
-- Lê tabelas do BACKEND-2 somente via SQL dinâmico protegido por to_regclass.
create or replace function public.admin_estatisticas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_orcamentos bigint := 0;
  v_data_base  jsonb := null;
begin
  perform public.assert_admin();

  if to_regclass('public.orcamentos') is not null then
    execute 'select count(*) from public.orcamentos' into v_orcamentos;
  end if;

  if to_regclass('public.datas_base') is not null then
    execute $q$
      select jsonb_build_object('id', d.id, 'uf', d.uf, 'ano', d.ano, 'mes', d.mes,
                                'regime', d.regime, 'is_demo', d.is_demo)
        from public.datas_base d
       order by d.ano desc, d.mes desc, d.is_demo asc, d.created_at desc
       limit 1
    $q$ into v_data_base;
  end if;

  return jsonb_build_object(
    'usuarios_total',      (select count(*) from public.profiles),
    'usuarios_pendentes',  (select count(*) from public.profiles where status = 'pending'),
    'usuarios_bloqueados', (select count(*) from public.profiles where status = 'blocked'),
    'organizacoes_total',  (select count(*) from public.organizacoes),
    'obras_total',         (select count(*) from public.obras),
    'orcamentos_total',    v_orcamentos,
    'ultima_data_base',    v_data_base
  );
end;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on function public.fn_exige_ativo()                    from public, anon, authenticated;
revoke all on function public.fn_garante_outro_owner(uuid, uuid)  from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.registrar_acesso()',
    'public.criar_organizacao(text, text)',
    'public.definir_organizacao_ativa(uuid)',
    'public.convidar_membro(uuid, text, public.org_role)',
    'public.aceitar_convite(uuid)',
    'public.revogar_convite(uuid)',
    'public.meus_convites()',
    'public.obter_convite(uuid)',
    'public.alterar_papel_membro(uuid, uuid, public.org_role)',
    'public.remover_membro(uuid, uuid)',
    'public.listar_membros(uuid)',
    'public.admin_listar_usuarios(text, public.user_status, integer, integer)',
    'public.admin_definir_status_usuario(uuid, public.user_status, text)',
    'public.admin_definir_papel_global(uuid, public.app_role)',
    'public.admin_definir_status_organizacao(uuid, public.org_status)',
    'public.admin_adicionar_membro(uuid, uuid, public.org_role)',
    'public.admin_definir_configuracao(text, jsonb)',
    'public.admin_estatisticas()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

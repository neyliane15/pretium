-- =============================================================================
-- Pretium — seed de DEMONSTRAÇÃO (dono: BACKEND-2)
--
-- ATENÇÃO: tudo aqui é marcado `is_demo = true` e exibido na interface como
-- "Exemplo – dados de exemplo, importe a tabela oficial". Preços são FICTÍCIOS.
-- Códigos e descrições seguem o padrão SINAPI apenas para familiarizar o usuário; os
-- coeficientes são aproximados e os preços NÃO são os publicados pela Caixa.
-- Não cria usuários nem organizações (o primeiro cadastro vira admin).
-- Idempotente: pode ser executado várias vezes (on conflict do nothing).
-- Especificação: docs/ARQUITETURA.md §10.
-- =============================================================================

do $seed$
declare
  v_ref     date := (date_trunc('month', current_date) - interval '2 months')::date;
  v_ano     smallint := extract(year from v_ref)::smallint;
  v_mes     smallint := extract(month from v_ref)::smallint;
  v_db_nd   uuid;
  v_db_d    uuid;
  v_enc     uuid;
  v_comps   uuid[];
begin
  -- ─── Datas-base de demonstração (RJ, dois regimes, publicadas) ─────────────
  insert into public.datas_base (uf, ano, mes, regime, status, is_demo, descricao, fonte_arquivo, publicada_em)
  values
    ('RJ', v_ano, v_mes, 'nao_desonerado', 'publicada', true,
     format('DEMONSTRAÇÃO – dados de exemplo, importe a tabela oficial (RJ %s/%s – Não desonerado)', lpad(v_mes::text, 2, '0'), v_ano),
     'seed.sql (demonstração)', now()),
    ('RJ', v_ano, v_mes, 'desonerado', 'publicada', true,
     format('DEMONSTRAÇÃO – dados de exemplo, importe a tabela oficial (RJ %s/%s – Desonerado)', lpad(v_mes::text, 2, '0'), v_ano),
     'seed.sql (demonstração)', now())
  on conflict (uf, ano, mes, regime, is_demo) do nothing;

  select id into v_db_nd from public.datas_base
   where uf = 'RJ' and ano = v_ano and mes = v_mes and regime = 'nao_desonerado' and is_demo;
  select id into v_db_d from public.datas_base
   where uf = 'RJ' and ano = v_ano and mes = v_mes and regime = 'desonerado' and is_demo;

  -- ─── Insumos (códigos/descrições no padrão SINAPI; preços fictícios) ───────
  -- preço não desonerado; no desonerado a mão de obra fica 8% menor (exemplo)
  create temporary table seed_insumos (codigo text, descricao text, unidade text, tipo public.insumo_tipo, preco numeric) on commit drop;
  insert into seed_insumos values
    -- mão de obra
    ('4750',  'PEDREIRO', 'H', 'mao_de_obra', 24.50),
    ('6111',  'SERVENTE DE OBRAS', 'H', 'mao_de_obra', 17.80),
    ('1213',  'CARPINTEIRO DE FORMAS', 'H', 'mao_de_obra', 24.50),
    ('378',   'ARMADOR', 'H', 'mao_de_obra', 24.50),
    ('4783',  'PINTOR', 'H', 'mao_de_obra', 24.50),
    ('2436',  'ELETRICISTA', 'H', 'mao_de_obra', 25.90),
    ('2696',  'ENCANADOR OU BOMBEIRO HIDRAULICO', 'H', 'mao_de_obra', 25.90),
    ('246',   'AUXILIAR DE ENCANADOR OU BOMBEIRO HIDRAULICO', 'H', 'mao_de_obra', 18.90),
    ('247',   'AUXILIAR DE ELETRICISTA', 'H', 'mao_de_obra', 18.90),
    ('4760',  'AZULEJISTA OU LADRILHISTA', 'H', 'mao_de_obra', 24.50),
    -- encargos complementares (horista)
    ('37370', 'ALIMENTACAO - HORISTA (ENCARGOS COMPLEMENTARES)', 'H', 'taxa', 3.10),
    ('37371', 'TRANSPORTE - HORISTA (ENCARGOS COMPLEMENTARES)', 'H', 'taxa', 1.15),
    ('37372', 'EXAMES - HORISTA (ENCARGOS COMPLEMENTARES)', 'H', 'taxa', 0.55),
    ('37373', 'SEGURO - HORISTA (ENCARGOS COMPLEMENTARES)', 'H', 'taxa', 0.08),
    -- materiais
    ('1379',  'CIMENTO PORTLAND COMPOSTO CP II-32', 'KG', 'material', 0.85),
    ('370',   'AREIA MEDIA - POSTO JAZIDA/FORNECEDOR (RETIRADO NA JAZIDA, SEM TRANSPORTE)', 'M3', 'material', 125.00),
    ('367',   'AREIA GROSSA - POSTO JAZIDA/FORNECEDOR (RETIRADO NA JAZIDA, SEM TRANSPORTE)', 'M3', 'material', 128.00),
    ('4721',  'PEDRA BRITADA N. 1 (9,5 a 19 MM) POSTO PEDREIRA/FORNECEDOR, SEM FRETE', 'M3', 'material', 115.00),
    ('4718',  'PEDRA BRITADA N. 2 (19 a 38 MM) POSTO PEDREIRA/FORNECEDOR, SEM FRETE', 'M3', 'material', 112.00),
    ('1106',  'CAL HIDRATADA CH-I PARA ARGAMASSAS', 'KG', 'material', 1.10),
    ('7271',  'BLOCO CERAMICO / TIJOLO VAZADO PARA ALVENARIA DE VEDACAO, 8 FUROS NA HORIZONTAL, DE 9 X 19 X 19 CM (L X A X C)', 'UN', 'material', 1.45),
    ('7258',  'TIJOLO CERAMICO MACICO *5 X 10 X 20* CM', 'UN', 'material', 0.95),
    ('37395', 'TELA DE ACO SOLDADA GALVANIZADA/ZINCADA PARA ALVENARIA, FIO D = *1,24 MM, MALHA 15 X 15 MM, (C X L) *50 X 7,5* CM', 'M', 'material', 3.20),
    ('32',    'ACO CA-50, 6,3 MM, VERGALHAO', 'KG', 'material', 9.60),
    ('33',    'ACO CA-50, 8,0 MM, VERGALHAO', 'KG', 'material', 9.10),
    ('34',    'ACO CA-50, 10,0 MM, VERGALHAO', 'KG', 'material', 8.90),
    ('39',    'ACO CA-60, 5,0 MM, VERGALHAO', 'KG', 'material', 9.40),
    ('337',   'ARAME RECOZIDO 18 BWG, 1,25 MM (0,01 KG/M)', 'KG', 'material', 18.50),
    ('5068',  'PREGO DE ACO POLIDO COM CABECA 17 X 21 (2 X 11)', 'KG', 'material', 17.90),
    ('4491',  'PECA DE MADEIRA NATIVA / REGIONAL 7,5 X 7,5 CM (3X3) NAO APARELHADA (P/FORMA)', 'M', 'material', 9.80),
    ('6189',  'TABUA DE MADEIRA NAO APARELHADA *2,5 X 30* CM, CEDRINHO OU EQUIVALENTE DA REGIAO', 'M', 'material', 14.50),
    ('1345',  'CHAPA DE MADEIRA COMPENSADA RESINADA PARA FORMA DE CONCRETO, DE *2,2 X 1,1* M, E = 17 MM', 'M2', 'material', 65.00),
    ('2692',  'DESMOLDANTE PROTETOR PARA FORMAS DE MADEIRA, DE BASE OLEOSA EMULSIONADA EM AGUA', 'L', 'material', 8.50),
    ('6085',  'SELADOR ACRILICO PAREDES INTERNAS/EXTERNAS', 'L', 'material', 12.50),
    ('7356',  'TINTA ACRILICA PREMIUM, COR BRANCO FOSCO', 'L', 'material', 32.00),
    ('3767',  'LIXA EM FOLHA PARA PAREDE OU MADEIRA, NUMERO 120 (COR VERMELHA)', 'UN', 'material', 1.20),
    ('1381',  'ARGAMASSA COLANTE AC I PARA CERAMICAS', 'KG', 'material', 0.95),
    ('9868',  'TUBO PVC, SOLDAVEL, DE 25 MM, AGUA FRIA (NBR-5648)', 'M', 'material', 4.10);

  insert into public.insumos (fonte, codigo, descricao, unidade, tipo, is_demo, classificacao)
  select 'sinapi', s.codigo, s.descricao, s.unidade, s.tipo, true, 'DEMONSTRAÇÃO'
    from seed_insumos s
  on conflict (codigo) where organizacao_id is null do nothing;

  insert into public.insumo_precos (data_base_id, insumo_id, preco, origem_preco)
  select v_db_nd, i.id, s.preco, 'C' from seed_insumos s join public.insumos i on i.codigo = s.codigo and i.organizacao_id is null
  on conflict (data_base_id, insumo_id) do nothing;
  insert into public.insumo_precos (data_base_id, insumo_id, preco, origem_preco)
  select v_db_d, i.id, case when s.tipo = 'mao_de_obra' then round(s.preco * 0.92, 2) else s.preco end, 'C'
    from seed_insumos s join public.insumos i on i.codigo = s.codigo and i.organizacao_id is null
  on conflict (data_base_id, insumo_id) do nothing;

  -- ─── Composições (estrutura analítica de exemplo) ──────────────────────────
  insert into public.composicoes (fonte, codigo, descricao, unidade, grupo, is_demo, observacao) values
    ('sinapi', '88309', 'PEDREIRO COM ENCARGOS COMPLEMENTARES', 'H', 'MÃO DE OBRA', true, 'Exemplo de demonstração'),
    ('sinapi', '88316', 'SERVENTE COM ENCARGOS COMPLEMENTARES', 'H', 'MÃO DE OBRA', true, 'Exemplo de demonstração'),
    ('sinapi', '88262', 'CARPINTEIRO DE FORMAS COM ENCARGOS COMPLEMENTARES', 'H', 'MÃO DE OBRA', true, 'Exemplo de demonstração'),
    ('sinapi', '88245', 'ARMADOR COM ENCARGOS COMPLEMENTARES', 'H', 'MÃO DE OBRA', true, 'Exemplo de demonstração'),
    ('sinapi', '88310', 'PINTOR COM ENCARGOS COMPLEMENTARES', 'H', 'MÃO DE OBRA', true, 'Exemplo de demonstração'),
    ('sinapi', '88264', 'ELETRICISTA COM ENCARGOS COMPLEMENTARES', 'H', 'MÃO DE OBRA', true, 'Exemplo de demonstração'),
    ('sinapi', '88267', 'ENCANADOR OU BOMBEIRO HIDRÁULICO COM ENCARGOS COMPLEMENTARES', 'H', 'MÃO DE OBRA', true, 'Exemplo de demonstração'),
    ('sinapi', '87292', 'ARGAMASSA TRAÇO 1:2:8 (EM VOLUME DE CIMENTO, CAL E AREIA MÉDIA ÚMIDA) PARA EMBOÇO/MASSA ÚNICA/ASSENTAMENTO DE ALVENARIA DE VEDAÇÃO, PREPARO MECÂNICO COM BETONEIRA 400 L', 'M3', 'ARGAMASSAS', true, 'Exemplo de demonstração'),
    ('sinapi', '87313', 'ARGAMASSA TRAÇO 1:3 (EM VOLUME DE CIMENTO E AREIA GROSSA ÚMIDA) PARA CHAPISCO CONVENCIONAL, PREPARO MECÂNICO COM BETONEIRA 400 L', 'M3', 'ARGAMASSAS', true, 'Exemplo de demonstração'),
    ('sinapi', '87301', 'ARGAMASSA TRAÇO 1:4 (EM VOLUME DE CIMENTO E AREIA MÉDIA ÚMIDA) PARA CONTRAPISO, PREPARO MECÂNICO COM BETONEIRA 400 L', 'M3', 'ARGAMASSAS', true, 'Exemplo de demonstração'),
    ('sinapi', '87878', 'CHAPISCO APLICADO EM ALVENARIAS E ESTRUTURAS DE CONCRETO INTERNAS, COM COLHER DE PEDREIRO. ARGAMASSA TRAÇO 1:3 COM PREPARO EM BETONEIRA 400L', 'M2', 'REVESTIMENTO', true, 'Exemplo de demonstração'),
    ('sinapi', '87529', 'MASSA ÚNICA, PARA RECEBIMENTO DE PINTURA, EM ARGAMASSA TRAÇO 1:2:8, PREPARO MECÂNICO COM BETONEIRA 400L, APLICADA MANUALMENTE EM FACES INTERNAS DE PAREDES, ESPESSURA DE 20MM, COM EXECUÇÃO DE TALISCAS', 'M2', 'REVESTIMENTO', true, 'Exemplo de demonstração'),
    ('sinapi', '87535', 'EMBOÇO, PARA RECEBIMENTO DE CERÂMICA, EM ARGAMASSA TRAÇO 1:2:8, PREPARO MECÂNICO COM BETONEIRA 400L, APLICADO MANUALMENTE EM FACES INTERNAS DE PAREDES, ESPESSURA DE 20MM, COM EXECUÇÃO DE TALISCAS', 'M2', 'REVESTIMENTO', true, 'Exemplo de demonstração'),
    ('sinapi', '87503', 'ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS FURADOS NA HORIZONTAL DE 9X19X19CM (ESPESSURA 9CM) DE PAREDES COM ÁREA LÍQUIDA MAIOR OU IGUAL A 6M² SEM VÃOS E ARGAMASSA DE ASSENTAMENTO COM PREPARO EM BETONEIRA', 'M2', 'ALVENARIA DE VEDAÇÃO', true, 'Exemplo de demonstração'),
    ('sinapi', '87630', 'CONTRAPISO EM ARGAMASSA TRAÇO 1:4 (CIMENTO E AREIA), PREPARO MECÂNICO COM BETONEIRA 400 L, APLICADO EM ÁREAS SECAS SOBRE LAJE, ADERIDO, ACABAMENTO NÃO REFORÇADO, ESPESSURA 2CM', 'M2', 'PISOS', true, 'Exemplo de demonstração'),
    ('sinapi', '94965', 'CONCRETO FCK = 25MPA, TRAÇO 1:2,3:2,7 (EM MASSA SECA DE CIMENTO/ AREIA MÉDIA/ BRITA 1) - PREPARO MECÂNICO COM BETONEIRA 400 L', 'M3', 'CONCRETOS', true, 'Exemplo de demonstração'),
    ('sinapi', '88485', 'APLICAÇÃO DE FUNDO SELADOR ACRÍLICO EM PAREDES, UMA DEMÃO', 'M2', 'PINTURAS', true, 'Exemplo de demonstração'),
    ('sinapi', '88489', 'PINTURA LÁTEX ACRÍLICA PREMIUM, APLICAÇÃO MANUAL EM PAREDES, DUAS DEMÃOS', 'M2', 'PINTURAS', true, 'Exemplo de demonstração'),
    ('sinapi', '92778', 'ARMAÇÃO DE PILAR OU VIGA DE ESTRUTURA CONVENCIONAL DE CONCRETO ARMADO UTILIZANDO AÇO CA-50 DE 10,0 MM - MONTAGEM', 'KG', 'ARMAÇÃO', true, 'Exemplo de demonstração')
  on conflict (codigo) where organizacao_id is null do nothing;

  create temporary table seed_itens (comp text, tipo public.composicao_item_tipo, item text, coef numeric, ordem int) on commit drop;
  insert into seed_itens
  -- mão de obra com encargos complementares
  select c.comp, 'insumo', x.item, 1, x.ordem
    from (values ('88309', '4750'), ('88316', '6111'), ('88262', '1213'), ('88245', '378'),
                 ('88310', '4783'), ('88264', '2436'), ('88267', '2696')) c(comp, prof)
    cross join lateral (values (c.prof, 1), ('37370', 2), ('37371', 3), ('37372', 4), ('37373', 5)) x(item, ordem);
  insert into seed_itens values
    ('87292', 'insumo', '1379', 158.0, 1), ('87292', 'insumo', '1106', 156.0, 2), ('87292', 'insumo', '370', 1.16, 3),
    ('87292', 'composicao', '88316', 3.6, 4),
    ('87313', 'insumo', '1379', 486.0, 1), ('87313', 'insumo', '367', 1.23, 2), ('87313', 'composicao', '88316', 3.0, 3),
    ('87301', 'insumo', '1379', 341.0, 1), ('87301', 'insumo', '370', 1.19, 2), ('87301', 'composicao', '88316', 3.0, 3),
    ('87878', 'composicao', '87313', 0.0042, 1), ('87878', 'composicao', '88309', 0.07, 2),
    ('87529', 'composicao', '87292', 0.0238, 1), ('87529', 'composicao', '88309', 0.6, 2), ('87529', 'composicao', '88316', 0.2, 3),
    ('87535', 'composicao', '87292', 0.0238, 1), ('87535', 'composicao', '88309', 0.45, 2), ('87535', 'composicao', '88316', 0.2, 3),
    ('87503', 'insumo', '7271', 27.5, 1), ('87503', 'composicao', '87292', 0.0106, 2), ('87503', 'insumo', '37395', 0.42, 3),
    ('87503', 'composicao', '88309', 0.68, 4), ('87503', 'composicao', '88316', 0.34, 5),
    ('87630', 'composicao', '87301', 0.025, 1), ('87630', 'composicao', '88309', 0.18, 2), ('87630', 'composicao', '88316', 0.09, 3),
    ('94965', 'insumo', '1379', 382.0, 1), ('94965', 'insumo', '370', 0.6847, 2), ('94965', 'insumo', '4721', 0.8255, 3),
    ('94965', 'composicao', '88316', 3.15, 4),
    ('88485', 'insumo', '6085', 0.12, 1), ('88485', 'composicao', '88310', 0.10, 2),
    ('88489', 'insumo', '7356', 0.22, 1), ('88489', 'insumo', '3767', 0.05, 2), ('88489', 'composicao', '88310', 0.32, 3),
    ('92778', 'insumo', '34', 1.10, 1), ('92778', 'insumo', '337', 0.025, 2), ('92778', 'composicao', '88245', 0.07, 3),
    ('92778', 'composicao', '88316', 0.035, 4);

  -- só monta a estrutura em composições de demonstração (nunca altera composições oficiais importadas)
  insert into public.composicao_itens (composicao_id, tipo_item, insumo_id, subcomposicao_id, coeficiente, ordem)
  select c.id, s.tipo,
         case when s.tipo = 'insumo' then i.id end,
         case when s.tipo = 'composicao' then sc.id end,
         s.coef, s.ordem
    from seed_itens s
    join public.composicoes c on c.codigo = s.comp and c.organizacao_id is null and c.is_demo
    left join public.insumos i on s.tipo = 'insumo' and i.codigo = s.item and i.organizacao_id is null
    left join public.composicoes sc on s.tipo = 'composicao' and sc.codigo = s.item and sc.organizacao_id is null
  on conflict (composicao_id, tipo_item, (coalesce(insumo_id, subcomposicao_id))) do nothing;

  -- custo "publicado" de exemplo = custo calculado pela própria estrutura (coerente com §8.2)
  select array_agg(c.id) into v_comps from public.composicoes c
   where c.organizacao_id is null and c.is_demo and c.codigo in (select distinct comp from seed_itens);
  insert into public.composicao_precos (data_base_id, composicao_id, custo)
  select db.id, f.composicao_id, f.custo
    from (values (v_db_nd), (v_db_d)) db(id)
    cross join lateral public.fn_custos_composicoes(v_comps, db.id, null) f
   where f.custo is not null
     and not exists (select 1 from public.composicao_precos cp where cp.data_base_id = db.id)
  on conflict (data_base_id, composicao_id) do nothing;

  -- ─── Encargos sociais de exemplo (horista / mensalista) ────────────────────
  if not exists (select 1 from public.encargos_sociais where organizacao_id is null and is_demo and uf = 'RJ' and regime = 'nao_desonerado') then
    insert into public.encargos_sociais (organizacao_id, nome, uf, regime, vigencia, is_demo)
    values (null, 'DEMONSTRAÇÃO – Encargos sociais RJ – Não desonerado (exemplo)', 'RJ', 'nao_desonerado', v_ref, true)
    returning id into v_enc;
    insert into public.encargos_sociais_itens (encargos_sociais_id, grupo, codigo, descricao, horista, mensalista, ordem) values
      (v_enc, 'A', 'A1', 'INSS', 20.00, 20.00, 1),
      (v_enc, 'A', 'A2', 'SESI', 1.50, 1.50, 2),
      (v_enc, 'A', 'A3', 'SENAI', 1.00, 1.00, 3),
      (v_enc, 'A', 'A4', 'INCRA', 0.20, 0.20, 4),
      (v_enc, 'A', 'A5', 'SEBRAE', 0.60, 0.60, 5),
      (v_enc, 'A', 'A6', 'Salário Educação', 2.50, 2.50, 6),
      (v_enc, 'A', 'A7', 'Seguro Contra Acidentes de Trabalho', 3.00, 3.00, 7),
      (v_enc, 'A', 'A8', 'FGTS', 8.00, 8.00, 8),
      (v_enc, 'B', 'B1', 'Repouso Semanal Remunerado', 17.87, 0, 9),
      (v_enc, 'B', 'B2', 'Feriados', 3.95, 0, 10),
      (v_enc, 'B', 'B3', 'Auxílio-Enfermidade', 0.89, 0.69, 11),
      (v_enc, 'B', 'B4', '13º Salário', 10.98, 8.33, 12),
      (v_enc, 'B', 'B5', 'Licença Paternidade', 0.07, 0.06, 13),
      (v_enc, 'B', 'B6', 'Faltas Justificadas', 0.73, 0.56, 14),
      (v_enc, 'B', 'B7', 'Dias de Chuvas', 1.53, 0, 15),
      (v_enc, 'B', 'B8', 'Auxílio Acidente de Trabalho', 0.11, 0.09, 16),
      (v_enc, 'B', 'B9', 'Férias Gozadas', 9.50, 7.21, 17),
      (v_enc, 'B', 'B10', 'Salário Maternidade', 0.03, 0.03, 18),
      (v_enc, 'C', 'C1', 'Aviso Prévio Indenizado', 5.79, 4.39, 19),
      (v_enc, 'C', 'C2', 'Aviso Prévio Trabalhado', 0.14, 0.10, 20),
      (v_enc, 'C', 'C3', 'Férias Indenizadas', 2.98, 2.26, 21),
      (v_enc, 'C', 'C4', 'Depósito Rescisão Sem Justa Causa', 4.45, 3.38, 22),
      (v_enc, 'C', 'C5', 'Indenização Adicional', 0.49, 0.37, 23),
      (v_enc, 'D', 'D1', 'Reincidência de Grupo A sobre Grupo B', 16.80, 6.25, 24),
      (v_enc, 'D', 'D2', 'Reincidência de Grupo A sobre Aviso Prévio Trabalhado e Reincidência do FGTS sobre Aviso Prévio Indenizado', 0.51, 0.39, 25);
  end if;

  if not exists (select 1 from public.encargos_sociais where organizacao_id is null and is_demo and uf = 'RJ' and regime = 'desonerado') then
    insert into public.encargos_sociais (organizacao_id, nome, uf, regime, vigencia, is_demo)
    values (null, 'DEMONSTRAÇÃO – Encargos sociais RJ – Desonerado (exemplo)', 'RJ', 'desonerado', v_ref, true)
    returning id into v_enc;
    insert into public.encargos_sociais_itens (encargos_sociais_id, grupo, codigo, descricao, horista, mensalista, ordem) values
      (v_enc, 'A', 'A1', 'INSS', 0, 0, 1),
      (v_enc, 'A', 'A2', 'SESI', 1.50, 1.50, 2),
      (v_enc, 'A', 'A3', 'SENAI', 1.00, 1.00, 3),
      (v_enc, 'A', 'A4', 'INCRA', 0.20, 0.20, 4),
      (v_enc, 'A', 'A5', 'SEBRAE', 0.60, 0.60, 5),
      (v_enc, 'A', 'A6', 'Salário Educação', 2.50, 2.50, 6),
      (v_enc, 'A', 'A7', 'Seguro Contra Acidentes de Trabalho', 3.00, 3.00, 7),
      (v_enc, 'A', 'A8', 'FGTS', 8.00, 8.00, 8),
      (v_enc, 'B', 'B1', 'Repouso Semanal Remunerado', 17.87, 0, 9),
      (v_enc, 'B', 'B2', 'Feriados', 3.95, 0, 10),
      (v_enc, 'B', 'B3', 'Auxílio-Enfermidade', 0.89, 0.69, 11),
      (v_enc, 'B', 'B4', '13º Salário', 10.98, 8.33, 12),
      (v_enc, 'B', 'B5', 'Licença Paternidade', 0.07, 0.06, 13),
      (v_enc, 'B', 'B6', 'Faltas Justificadas', 0.73, 0.56, 14),
      (v_enc, 'B', 'B7', 'Dias de Chuvas', 1.53, 0, 15),
      (v_enc, 'B', 'B8', 'Auxílio Acidente de Trabalho', 0.11, 0.09, 16),
      (v_enc, 'B', 'B9', 'Férias Gozadas', 9.50, 7.21, 17),
      (v_enc, 'B', 'B10', 'Salário Maternidade', 0.03, 0.03, 18),
      (v_enc, 'C', 'C1', 'Aviso Prévio Indenizado', 5.79, 4.39, 19),
      (v_enc, 'C', 'C2', 'Aviso Prévio Trabalhado', 0.14, 0.10, 20),
      (v_enc, 'C', 'C3', 'Férias Indenizadas', 2.98, 2.26, 21),
      (v_enc, 'C', 'C4', 'Depósito Rescisão Sem Justa Causa', 4.45, 3.38, 22),
      (v_enc, 'C', 'C5', 'Indenização Adicional', 0.49, 0.37, 23),
      (v_enc, 'D', 'D1', 'Reincidência de Grupo A sobre Grupo B', 7.67, 2.85, 24),
      (v_enc, 'D', 'D2', 'Reincidência de Grupo A sobre Aviso Prévio Trabalhado e Reincidência do FGTS sobre Aviso Prévio Indenizado', 0.49, 0.37, 25);
  end if;
end
$seed$;

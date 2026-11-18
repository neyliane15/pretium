# Instalação pelo SQL Editor do Supabase (sem terminal)

Arquivos gerados a partir de `supabase/migrations` (mesmo conteúdo, na mesma ordem).
No painel do Supabase → **SQL Editor** → **New query**, cole e rode **um arquivo por vez, nesta ordem**:

1. `01_nucleo.sql`
2. `02_sinapi_orcamento.sql`
3. `03_funcoes.sql`
4. `04_dados_exemplo_opcional.sql` (opcional — dados de demonstração, preços fictícios)
5. `05_definir_admin.sql` (troque o e-mail pelo seu, em minúsculas, antes de rodar)

**Já instalou antes?** Rode só `06_atualizacao_busca_sinapi.sql` (busca automática da SINAPI).

Cada arquivo deve ser rodado uma única vez (o 04 pode repetir sem duplicar).
Se usar o caminho por terminal (`supabase db push`), NÃO rode estes arquivos — é um ou outro.

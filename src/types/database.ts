/**
 * Tipo `Database` consumido por `createClient<Database>()`.
 * Composto a partir de db-core.ts (BACKEND-1 / FRONTEND-1) e db-orcamento.ts (BACKEND-2 / FRONTEND-2).
 * NÃO editar as tabelas aqui — edite o arquivo do domínio correspondente.
 *
 * Se o projeto Supabase estiver rodando, `npm run types:gen` gera `database.generated.ts` para
 * conferência (não substitui este contrato automaticamente).
 */
import type { CoreEnums, CoreFunctions, CoreTables } from './db-core';
import type { OrcamentoEnums, OrcamentoFunctions, OrcamentoTables } from './db-orcamento';
import type { Simplify } from './helpers';

type FunctionsDef<F> = {
  [K in keyof F]: F[K] extends { Args: infer A; Returns: infer R } ? { Args: Simplify<A>; Returns: R } : never;
};

export interface Database {
  public: {
    Tables: Simplify<CoreTables & OrcamentoTables>;
    Views: { [_ in never]: never };
    Functions: FunctionsDef<CoreFunctions & OrcamentoFunctions>;
    Enums: Simplify<CoreEnums & OrcamentoEnums>;
    CompositeTypes: { [_ in never]: never };
  };
}

type PublicSchema = Database['public'];
export type TableName = keyof PublicSchema['Tables'];
export type Tables<T extends TableName> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends TableName> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends TableName> = PublicSchema['Tables'][T]['Update'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];
export type RpcName = keyof PublicSchema['Functions'];
export type RpcArgs<T extends RpcName> = PublicSchema['Functions'][T]['Args'];
export type RpcReturns<T extends RpcName> = PublicSchema['Functions'][T]['Returns'];

export type * from './db-core';
export type * from './db-orcamento';
export type { Json } from './helpers';

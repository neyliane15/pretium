/**
 * Utilitários de tipo para montar o `Database` no formato esperado pelo supabase-js v2
 * (mesmo formato gerado por `supabase gen types typescript`).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Relationship {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
}

/** Campos com default no banco (id, timestamps, created_by…) tornam-se opcionais no Insert. */
export type InsertOf<Row, Optional extends keyof Row> = Omit<Row, Optional> & Partial<Pick<Row, Optional>>;

/**
 * Achata interfaces em tipos-objeto. Necessário porque o supabase-js exige
 * `Row extends Record<string, unknown>` e interfaces não têm assinatura de índice implícita.
 */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

export interface TableDef<Row, Insert, Rels extends Relationship[] = []> {
  Row: Simplify<Row>;
  Insert: Simplify<Insert>;
  Update: Simplify<Partial<Insert>>;
  Relationships: Rels;
}

/** Colunas padrão de auditoria temporal. */
export interface Timestamps {
  created_at: string;
  updated_at: string;
}

export type Uuid = string;
/** Data ISO `YYYY-MM-DD`. */
export type IsoDate = string;
/** Timestamp ISO 8601. */
export type IsoDateTime = string;

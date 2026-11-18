export interface ChamadaFrom {
  arquivo: string;
  linha: number;
  tipo: 'from';
  tabela: string;
  select: string[];
  filtros: { metodo: string; coluna?: string; expr?: string | null }[];
  escritas: { op: string; chaves: string[] | null; spread: boolean }[];
  onConflict: string | null;
}
export interface ChamadaRpc { arquivo: string; linha: number; tipo: 'rpc'; funcao: string; params: string[] | null; spread: boolean }
export interface ChamadaStorage { arquivo: string; linha: number; tipo: 'storage'; bucket: string }
export type Chamada = ChamadaFrom | ChamadaRpc | ChamadaStorage;
export const RAIZ: string;
export function extrair(opcoes?: { comChecker?: boolean }): Chamada[];
export function parseSelect(s: string): unknown[];

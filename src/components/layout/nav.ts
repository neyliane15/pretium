import {
  BookOpen, Building, Building2, Calculator, ClipboardList, FileSpreadsheet, HardHat, LayoutDashboard, Layers,
  Package, PencilRuler, Settings2, ShieldCheck, SlidersHorizontal, Upload, Users, UsersRound, type LucideIcon,
} from 'lucide-react';
import { rotas } from '@/routes';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** palavras extras para a busca rápida da Topbar */
  termos?: string;
}

export interface NavGroup {
  titulo: string;
  itens: NavItem[];
  /** grupo visível só para admin */
  admin?: boolean;
}

/** Navegação principal (Sidebar e busca rápida). Dono: FRONTEND-1. */
export const NAV: NavGroup[] = [
  { titulo: 'Visão geral', itens: [{ to: rotas.dashboard, label: 'Painel', icon: LayoutDashboard, end: true, termos: 'inicio dashboard kpi' }] },
  {
    titulo: 'Projetos',
    itens: [
      { to: rotas.obras, label: 'Obras', icon: Building2, termos: 'projetos' },
      { to: rotas.orcamentos, label: 'Orçamentos', icon: Calculator, termos: 'planilha analitico sintetico bdi' },
      { to: rotas.honorarios, label: 'Honorários de projeto', icon: PencilRuler, termos: 'proposta' },
    ],
  },
  {
    titulo: 'Referências',
    itens: [
      { to: rotas.sinapi, label: 'Consulta SINAPI', icon: BookOpen, termos: 'insumos composicoes precos' },
      { to: rotas.composicoesProprias, label: 'Composições próprias', icon: Layers },
      { to: rotas.insumosProprios, label: 'Insumos próprios', icon: Package },
      { to: rotas.encargos, label: 'Encargos sociais', icon: HardHat, termos: 'leis sociais' },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { to: rotas.clientes, label: 'Clientes', icon: UsersRound, termos: 'contratantes' },
      { to: rotas.organizacaoMembros, label: 'Equipe', icon: Users, termos: 'membros convites' },
      { to: rotas.organizacao, label: 'Escritório', icon: Settings2, end: true, termos: 'organizacao empresa logo dados' },
    ],
  },
  {
    titulo: 'Administração',
    admin: true,
    itens: [
      { to: rotas.admin, label: 'Painel admin', icon: ShieldCheck, end: true, termos: 'administracao' },
      { to: rotas.adminUsuarios, label: 'Usuários', icon: Users, termos: 'aprovar bloquear' },
      { to: rotas.adminOrganizacoes, label: 'Organizações', icon: Building, termos: 'escritorios empresas bloquear' },
      { to: rotas.adminSinapi, label: 'Tabelas SINAPI', icon: FileSpreadsheet, end: true, termos: 'datas-base' },
      { to: rotas.adminSinapiImportar, label: 'Importar SINAPI', icon: Upload, termos: 'planilha xlsx csv' },
      { to: rotas.adminAuditoria, label: 'Auditoria', icon: ClipboardList, termos: 'logs' },
      { to: rotas.adminConfiguracoes, label: 'Configurações', icon: SlidersHorizontal, termos: 'cadastro aprovacao aviso admin_emails' },
    ],
  },
];

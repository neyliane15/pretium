import {
  BookOpen, Building2, Calculator, ClipboardList, FileSpreadsheet, HardHat, LayoutDashboard, Layers,
  Package, PencilRuler, ShieldCheck, Users, UsersRound, type LucideIcon,
} from 'lucide-react';
import { rotas } from '@/routes';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavGroup {
  titulo: string;
  itens: NavItem[];
  /** grupo visível só para admin */
  admin?: boolean;
}

/** Navegação principal (Sidebar). Dono: FRONTEND-1. */
export const NAV: NavGroup[] = [
  { titulo: 'Visão geral', itens: [{ to: rotas.dashboard, label: 'Painel', icon: LayoutDashboard, end: true }] },
  {
    titulo: 'Projetos',
    itens: [
      { to: rotas.obras, label: 'Obras', icon: Building2 },
      { to: rotas.orcamentos, label: 'Orçamentos', icon: Calculator },
      { to: rotas.honorarios, label: 'Honorários de projeto', icon: PencilRuler },
    ],
  },
  {
    titulo: 'Referências',
    itens: [
      { to: rotas.sinapi, label: 'Consulta SINAPI', icon: BookOpen },
      { to: rotas.composicoesProprias, label: 'Composições próprias', icon: Layers },
      { to: rotas.insumosProprios, label: 'Insumos próprios', icon: Package },
      { to: rotas.encargos, label: 'Encargos sociais', icon: HardHat },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { to: rotas.clientes, label: 'Clientes', icon: UsersRound },
      { to: rotas.organizacaoMembros, label: 'Equipe', icon: Users },
    ],
  },
  {
    titulo: 'Administração',
    admin: true,
    itens: [
      { to: rotas.admin, label: 'Painel admin', icon: ShieldCheck, end: true },
      { to: rotas.adminSinapi, label: 'Tabelas SINAPI', icon: FileSpreadsheet },
      { to: rotas.adminAuditoria, label: 'Auditoria', icon: ClipboardList },
    ],
  },
];

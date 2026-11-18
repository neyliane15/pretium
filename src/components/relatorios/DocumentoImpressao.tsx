import type { ReactNode } from 'react';
import { BUCKETS } from '@/lib/supabase';
import { useArquivoUrl } from '@/api/core/arquivos';
import { Logo } from '@/components/brand/Logo';
import { formatData, formatDataHora, formatMesAno, formatPercent } from '@/lib/format';
import { LABEL_REGIME } from '@/lib/labels';
import type { Organizacao, RegimeDesoneracao } from '@/types/database';
import './impressao.css';

export interface CabecalhoDoc {
  organizacao: Organizacao | null;
  titulo: string;
  subtitulo?: string;
  obra?: { nome: string; codigo?: string | null; endereco?: string | null; cliente?: string | null; responsavel?: string | null; crea?: string | null; art?: string | null } | null;
  orcamento?: { nome: string; codigo?: string | null; versao?: number; data?: string | null } | null;
  dataBase?: { uf: string; ano: number; mes: number; regime: RegimeDesoneracao; is_demo: boolean } | null;
  bdi?: number | null;
  extras?: [string, ReactNode][];
}

/** Folha A4 com cabeçalho técnico, faixa demo, carimbo e rodapé. */
export function DocumentoImpressao({ cab, paisagem, children }: { cab: CabecalhoDoc; paisagem?: boolean; children: ReactNode }) {
  const logo = useArquivoUrl(BUCKETS.logos, cab.organizacao?.logo_path);
  const org = cab.organizacao;
  const db = cab.dataBase;
  const rotDb = db ? `SINAPI-${db.uf} ${formatMesAno(db.ano, db.mes)}` : '—';
  const meta: [string, ReactNode][] = [
    ['Obra', cab.obra ? `${cab.obra.codigo ? cab.obra.codigo + ' · ' : ''}${cab.obra.nome}` : '—'],
    ['Cliente', cab.obra?.cliente ?? '—'],
    ['Local', cab.obra?.endereco ?? '—'],
    ['Orçamento', cab.orcamento ? `${cab.orcamento.codigo ? cab.orcamento.codigo + ' · ' : ''}${cab.orcamento.nome}${cab.orcamento.versao ? ` · v${cab.orcamento.versao}` : ''}` : '—'],
    ['Data-base', rotDb],
    ['Regime', db ? LABEL_REGIME[db.regime] : '—'],
    ['BDI', cab.bdi !== null && cab.bdi !== undefined ? formatPercent(cab.bdi) : '—'],
    ['Data', formatData(cab.orcamento?.data ?? new Date())],
    ...(cab.extras ?? []),
  ];
  return (
    <article className={`rel-folha${paisagem ? ' paisagem' : ''}`}>
      <header className="rel-cab">
        <div className="flex items-end gap-4">
          {logo.data ? (
            <img src={logo.data} alt={org?.nome ?? 'Logo'} style={{ maxHeight: '14mm', maxWidth: '42mm', objectFit: 'contain' }} />
          ) : (
            <div className="rel-titulo" style={{ fontSize: '11pt' }}>{org?.nome ?? ''}</div>
          )}
          <div>
            <div className="rel-eyebrow">{cab.subtitulo ?? 'Orçamento de obra'}</div>
            <h1 className="rel-titulo">{cab.titulo}</h1>
          </div>
        </div>
        <div className="text-right">
          <div style={{ color: '#1c2023' }}><Logo height={16} /></div>
          <div className="rel-eyebrow mt-1">{rotDb}{db ? ` · ${LABEL_REGIME[db.regime]}` : ''}</div>
        </div>
      </header>
      <dl className="rel-meta">
        {meta.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd title={typeof v === 'string' ? v : undefined}>{v}</dd></div>
        ))}
      </dl>
      {db?.is_demo && <div className="rel-demo">DOCUMENTO GERADO COM DADOS DE EXEMPLO – NÃO OFICIAIS</div>}

      {children}

      <footer>
        <div className="rel-carimbo">
          <div>
            <div className="rel-eyebrow">Empresa</div>
            <div style={{ fontWeight: 600 }}>{org?.razao_social ?? org?.nome ?? '—'}</div>
            <div style={{ fontSize: '7pt', color: '#5b6166' }}>{[org?.cnpj && `CNPJ ${org.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}`, org?.municipio && `${org.municipio}/${org.uf ?? ''}`].filter(Boolean).join(' · ')}</div>
          </div>
          <div>
            <div className="rel-eyebrow">Responsável técnico</div>
            <div style={{ fontWeight: 500 }}>{cab.obra?.responsavel ?? org?.responsavel_tecnico ?? '—'}</div>
            <div className="ass">assinatura</div>
          </div>
          <div>
            <div className="rel-eyebrow">CREA/CAU · ART/RRT</div>
            <div className="m" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '7.5pt' }}>{cab.obra?.crea ?? org?.crea_cau ?? '—'}</div>
            <div className="m" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '7.5pt' }}>{cab.obra?.art ?? '—'}</div>
          </div>
          <div>
            <div className="rel-eyebrow">Referência de preços</div>
            <div style={{ fontWeight: 500 }}>{rotDb}</div>
            <div style={{ fontSize: '7pt', color: '#5b6166' }}>{db ? LABEL_REGIME[db.regime] : ''}{cab.bdi !== null && cab.bdi !== undefined ? ` · BDI ${formatPercent(cab.bdi)}` : ''}</div>
          </div>
        </div>
        <div className="rel-rodape">
          <span>{rotDb}{db ? ` · ${LABEL_REGIME[db.regime]}` : ''}{db?.is_demo ? ' · DADOS DE EXEMPLO' : ''}</span>
          <span>Emitido em {formatDataHora(new Date())} · Pretium</span>
        </div>
      </footer>
    </article>
  );
}

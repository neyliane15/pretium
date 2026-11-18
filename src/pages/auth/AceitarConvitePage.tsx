import { useParams, useNavigate, Link } from 'react-router-dom';
import { Building2, Check, LogOut } from 'lucide-react';
import { Alert, Badge, Button, LoadingBlock, useToast } from '@/components/ui';
import { useAceitarConvite, useConvite } from '@/api/core/organizacao';
import { useAuth } from '@/contexts/AuthContext';
import { formatData } from '@/lib/format';
import { LABEL_ORG_ROLE } from '@/lib/labels';
import { mensagemErro } from '@/lib/supabase';
import { rotas } from '@/routes';
import { AuthLayout } from './AuthLayout';

/** /convite/:token — lê o convite (`obter_convite`) e aceita (`aceitar_convite`). */
export default function AceitarConvitePage() {
  const { token } = useParams<{ token: string }>();
  const { profile, status, signOut } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const { data: convite, isLoading, error } = useConvite(token);
  const aceitar = useAceitarConvite();

  const emailDiferente = convite && profile && convite.email.toLowerCase() !== profile.email.toLowerCase();
  const expirado = convite && (convite.status === 'expired' || new Date(convite.expira_em) < new Date());
  const indisponivel = convite && convite.status !== 'pending';

  return (
    <AuthLayout eyebrow="Convite" titulo="Convite para organização" largura={420}>
      {isLoading ? (
        <LoadingBlock className="min-h-[120px]" label="Carregando convite…" />
      ) : error || !convite ? (
        <Alert variant="danger" title="Convite não encontrado">
          {error ? mensagemErro(error) : 'O link pode estar incorreto ou o convite foi removido.'}
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="corner-marks flex items-center gap-3 rounded-sm border border-border bg-surface-2 p-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-petrol-2 text-sidebar-fg">
              <Building2 className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="truncate font-display text-md font-semibold">{convite.organizacao_nome}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-fg-muted">
                <Badge variant="brand">{LABEL_ORG_ROLE[convite.papel]}</Badge>
                <span>
                  válido até <span className="num">{formatData(convite.expira_em.slice(0, 10))}</span>
                </span>
              </div>
            </div>
          </div>
          <p className="text-sm text-fg-muted">
            Convite enviado para <strong className="font-medium text-fg">{convite.email}</strong>.
          </p>

          {status === 'pending' && <Alert variant="warning">Sua conta ainda aguarda aprovação de um administrador. Aceite o convite após a aprovação.</Alert>}
          {indisponivel && !expirado && <Alert variant="info">Este convite já foi {convite.status === 'accepted' ? 'aceito' : 'revogado'}.</Alert>}
          {expirado && <Alert variant="warning">Este convite expirou. Peça um novo convite ao responsável pela organização.</Alert>}
          {emailDiferente && (
            <Alert variant="warning" title="E-mail diferente">
              Você está conectado como {profile.email}. Entre com a conta {convite.email} para aceitar.
            </Alert>
          )}

          <div className="flex gap-2">
            {emailDiferente ? (
              <Button block leftIcon={<LogOut />} onClick={() => void signOut().then(() => nav(rotas.login, { state: { from: rotas.convite(token!) } }))}>
                Trocar de conta
              </Button>
            ) : (
              <Button
                block
                variant="primary"
                leftIcon={<Check />}
                loading={aceitar.isPending}
                disabled={Boolean(expirado || indisponivel || status !== 'active')}
                onClick={() =>
                  aceitar.mutate(token!, {
                    onSuccess: () => {
                      toast.success('Convite aceito', `Bem-vindo(a) a ${convite.organizacao_nome}.`);
                      nav(rotas.dashboard, { replace: true });
                    },
                    onError: (e) => toast.error('Não foi possível aceitar o convite', mensagemErro(e)),
                  })
                }
              >
                Aceitar e entrar
              </Button>
            )}
          </div>
          <Link to={rotas.dashboard} className="text-center text-xs text-fg-muted hover:text-fg hover:underline">
            Agora não
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}

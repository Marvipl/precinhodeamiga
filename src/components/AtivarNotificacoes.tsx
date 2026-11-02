// F-15: liga as notificações neste aparelho. A tela de Configurações (P6) só posiciona este componente.
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from './Toast';
import {
  ambienteAtual,
  ativarNesteAparelho,
  avaliarSuporte,
  desativarNesteAparelho,
  enviarTeste,
  inscricaoAtual,
  type Suporte,
} from '@/lib/notificacoes';

const AVISOS: Record<Exclude<Suporte, 'pronto'>, string> = {
  sem_chave: 'Aguardando a chave de notificações. O Marcus configura isso uma vez.',
  sem_suporte: 'Este navegador não recebe notificações. Abra o painel no Chrome (Android) ou instale o app na tela inicial.',
  instalar_ios:
    'No iPhone, as notificações só funcionam com o app na tela inicial: toque em Compartilhar, depois em "Adicionar à Tela de Início", e abra o painel por lá.',
  bloqueado: 'As notificações estão bloqueadas neste aparelho. Libere nas configurações do navegador e volte aqui.',
};

export function AtivarNotificacoes() {
  const { perfil } = useAuth();
  const toast = useToast();
  const [suporte, setSuporte] = useState<Suporte>(() => avaliarSuporte(ambienteAtual()));
  const [ativa, setAtiva] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (suporte === 'pronto') inscricaoAtual().then((s) => vivo && setAtiva(s !== null)).catch(() => vivo && setAtiva(false));
    return () => {
      vivo = false;
    };
  }, [suporte]);

  async function fazer(acao: () => Promise<void>, sucesso: string) {
    setOcupado(true);
    try {
      await acao();
      toast(sucesso);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setOcupado(false);
      setSuporte(avaliarSuporte(ambienteAtual()));
      inscricaoAtual().then((s) => setAtiva(s !== null)).catch(() => setAtiva(false));
    }
  }

  const sb = supabase;
  const uid = perfil?.user_id;

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Notificações</h2>
          <p>Lembrete de cada envio do WhatsApp, aviso de post pausado pela Guardiã e mensagens urgentes.</p>
        </div>
        {ativa ? <span className="pill pill-ok">Ativadas neste aparelho</span> : null}
      </div>

      {!sb || !uid ? (
        <p className="muted">Disponível quando o painel estiver ligado ao servidor.</p>
      ) : suporte !== 'pronto' ? (
        <p className="muted">{AVISOS[suporte]}</p>
      ) : ativa === null ? (
        <p className="muted">Verificando este aparelho...</p>
      ) : ativa ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={ocupado} onClick={() => fazer(() => enviarTeste(sb, uid), 'Teste pedido. Chega em até 1 minuto.')}>
            Enviar notificação de teste
          </button>
          <button className="btn btn-ghost" disabled={ocupado} onClick={() => fazer(() => desativarNesteAparelho(sb), 'Notificações desligadas neste aparelho.')}>
            Desligar neste aparelho
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" disabled={ocupado} onClick={() => fazer(() => ativarNesteAparelho(sb, uid), 'Notificações ativadas neste aparelho.')}>
          Ativar notificações neste aparelho
        </button>
      )}

      <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
        Fora dos blocos de revisão, a Atendente só toca para mensagens urgentes. Lembretes de envio e avisos da Guardiã tocam sempre.
        {perfil?.papel === 'operadora' ? ' Se o aparelho não receber, o bot do Telegram manda a mesma mensagem para você.' : ''}
      </p>
    </div>
  );
}

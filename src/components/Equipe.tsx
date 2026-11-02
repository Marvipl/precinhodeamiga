// Quadro "Sua equipe agora" (seção 4.1): uma linha de estado por rotina, só com dados reais.
import { horaLocal } from '@core/formato.ts';
import { lista, useConsulta } from '@/lib/dados';

interface LinhaRotina {
  rotina: string;
  pausada: boolean;
  ultima_execucao: string | null;
  ultimo_erro: string | null;
}

const NOMES: Record<string, string> = {
  'pa-curadoria': 'Caçadora e Redatora',
  'pa-redacao': 'Redatora',
  'pa-atendente': 'Atendente',
  'pa-analista': 'Analista',
  'pa-radar': 'Radar',
  'pa-coach': 'Coach do Plano',
};

export function Equipe() {
  const { data = [] } = useConsulta<LinhaRotina[]>(
    ['agente_rotinas'],
    async (sb) => lista<LinhaRotina>(await sb.from('agente_rotinas').select('rotina, pausada, ultima_execucao, ultimo_erro').order('rotina')),
    [],
    { refetchInterval: 60_000 },
  );
  return (
    <div className="crew" aria-label="Estado dos agentes">
      <div className="crew-title">Sua equipe agora</div>
      {data.length === 0 ? <div className="crew-row"><span className="dot off" />Aguardando a primeira rodada</div> : null}
      {data.map((r) => {
        const nome = NOMES[r.rotina] ?? r.rotina;
        const [classe, texto] = r.pausada
          ? ['off', 'pausada']
          : r.ultimo_erro
            ? ['err', 'com erro']
            : r.ultima_execucao
              ? ['', `rodou às ${horaLocal(new Date(r.ultima_execucao))}`]
              : ['off', 'ainda não rodou'];
        return (
          <div className="crew-row" key={r.rotina}>
            <span className={`dot ${classe}`} />
            {nome}: {texto}
          </div>
        );
      })}
    </div>
  );
}

// F-14 Configurações: campos por papel. A Lana edita os da operação; os do Marcus aparecem bloqueados para ela.
import { CONFIG, camposDoPapel, type CampoConfig, type ChaveConfig } from '@core/config.ts';
import { AtivarNotificacoes } from '@/components/AtivarNotificacoes';
import { CabecalhoTela } from '@/components/Vazio';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/lib/config';
import { lista, useConsulta } from '@/lib/dados';
import { Campo } from './Campo';
import { Integracoes } from './Integracoes';
import { Nichos } from './Nichos';
import { Tetos } from './Tetos';

const GRUPOS: Array<{ grupo: CampoConfig['grupo']; titulo: string; texto: string }> = [
  { grupo: 'operacao', titulo: 'Operação', texto: 'Horários, canais, artes do Status e temas da Atendente.' },
  { grupo: 'regras', titulo: 'Regras', texto: 'Parâmetros da seção 5 com os valores iniciais do documento de produto.' },
  { grupo: 'agentes', titulo: 'Agentes', texto: 'Pausa geral e expiração dos trabalhos dos agentes.' },
];

function useChavesSalvas() {
  return useConsulta<string[]>(
    ['configuracoes', 'salvas'],
    async (sb) => lista<{ chave: string }>(await sb.from('configuracoes').select('chave')).map((l) => l.chave),
    [],
  );
}

export default function Configuracoes() {
  const { perfil } = useAuth();
  const papel = perfil?.papel ?? 'operadora';
  const dono = papel === 'dono';
  const { data: config, isLoading } = useConfig();
  const { data: salvas = [] } = useChavesSalvas();
  const editaveis = new Set(camposDoPapel(papel).map((c) => c.chave));

  return (
    <section className="view" aria-labelledby="h-config">
      <CabecalhoTela
        eyebrow="Ajustes"
        titulo="Configurações"
        lead={dono ? 'Tudo que muda com o tempo, sem mexer no código.' : 'Nichos, horários, canais e temas da Atendente. Os campos do Marcus aparecem bloqueados.'}
      />
      {isLoading || !config ? <p className="carregando">Carregando...</p> : null}
      <div className="stack">
        <AtivarNotificacoes />
        <Nichos />
        {config
          ? GRUPOS.map((g) => {
              const campos = (Object.keys(CONFIG) as ChaveConfig[]).filter((n) => CONFIG[n].grupo === g.grupo);
              return (
                <div className="card" key={g.grupo}>
                  <div className="card-head">
                    <h2>{g.titulo}</h2>
                    <p>{g.texto}</p>
                  </div>
                  <ul className="reqs">
                    {campos.map((n) => (
                      <Campo
                        key={n}
                        nome={n}
                        valor={config[n]}
                        editavel={editaveis.has(CONFIG[n].chave)}
                        salvo={salvas.includes(CONFIG[n].chave)}
                      />
                    ))}
                  </ul>
                </div>
              );
            })
          : null}
        {dono ? <Tetos /> : null}
        {dono ? <Integracoes /> : null}
      </div>
    </section>
  );
}

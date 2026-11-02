// Publicar (F-08 tela, F-09, F-16 tela): posts do bloco, checagem da Guardiã, artes do Status e post manual.
// O Telegram sai sozinho pelo servidor. No WhatsApp não existe envio automático (regra 5.1.2):
// a Lana copia, cola e marca como enviado.
import { dataLocal } from '@core/formato.ts';
import { quantidadeArtes } from '@core/arte/status.ts';
import { CabecalhoTela, Vazio } from '@/components/Vazio';
import { Icone } from '@/components/Icone';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/lib/config';
import { modoLocal } from '@/lib/supabase';
import { agruparPorPost, resumoGuardia, tituloDoBloco, type Tom } from './estado';
import { usePostsDoDia } from './dados';
import { PostCard } from './PostCard';
import { ArtesStatus } from './ArtesStatus';
import { PostManual } from './PostManual';
import './publicar.css';

const ICONE_TOM: Record<Tom, 'check' | 'alert' | 'info'> = { ok: 'check', warn: 'alert', std: 'info', info: 'info' };

export default function Pagina() {
  const hoje = dataLocal();
  const { perfil } = useAuth();
  const config = useConfig().data;
  const envios = usePostsDoDia(hoje);
  const posts = agruparPorPost(envios.data ?? []);
  const eLana = perfil?.papel === 'operadora';
  const cadencia = config?.cadenciaInicial ?? 6;
  const titulo = config ? tituloDoBloco({ noite: config.blocoNoite, almoco: config.blocoAlmoco }) : 'Publicar';

  return (
    <section className="view" aria-labelledby="h-publicar">
      <CabecalhoTela
        eyebrow="Redatora e Agendadora"
        titulo={titulo}
        lead="No canal do Telegram o post sai sozinho. No canal do WhatsApp é você quem envia: copie o texto pronto e cole. Um toque por post."
      />
      <div className="grid-2">
        <div className="stack">
          <div className="posts">
            {envios.isLoading ? (
              <p className="carregando">Carregando...</p>
            ) : envios.isError ? (
              <div className="aviso erro" role="alert">
                <Icone nome="alert" />
                <span>Não foi possível carregar os posts: {(envios.error as Error).message}</span>
              </div>
            ) : posts.length === 0 ? (
              <Vazio titulo="Sem posts hoje">
                {modoLocal
                  ? 'Aguardando dados.'
                  : 'Os posts aparecem aqui quando você aprova ofertas na aba Ofertas ou cria um post manual.'}
              </Vazio>
            ) : (
              posts.map((p) => <PostCard key={p.post.id} p={p} data={hoje} userId={perfil?.user_id ?? ''} eLana={eLana} />)
            )}
          </div>
          {eLana || modoLocal ? (
            <PostManual data={hoje} fraseMax={config?.fraseMaxCaracteres ?? 140} />
          ) : (
            <p className="muted small">Só a Lana cria post manual e marca envios do WhatsApp.</p>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Checagem da Guardiã</h2>
                <p>Antes de qualquer post sair</p>
              </div>
            </div>
            <ul className="guard">
              {resumoGuardia(posts, cadencia).map((i) => (
                <li key={i.texto} className={i.tom === 'std' ? 'info' : i.tom}>
                  <Icone nome={ICONE_TOM[i.tom]} />
                  <span>{i.texto}</span>
                </li>
              ))}
            </ul>
          </div>
          <ArtesStatus data={hoje} quantidade={quantidadeArtes(config?.artesStatusPorDia)} />
        </div>
      </div>
    </section>
  );
}

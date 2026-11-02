import { useEffect, useMemo } from 'react';
import { Icone } from '@/components/Icone';
import { useToast } from '@/components/Toast';
import { modoLocal } from '@/lib/supabase';
import { useArtesDoDia, useGerarArtes, useMarcarArteBaixada, type ArteDoDia } from './dados';
import { baixarArquivo, copiarTexto, svgParaPng } from './png';

function Arte({ arte, data, indice }: { arte: ArteDoDia; data: string; indice: number }) {
  const toast = useToast();
  const marcar = useMarcarArteBaixada(data);
  const url = useMemo(() => (arte.svg ? URL.createObjectURL(new Blob([arte.svg], { type: 'image/svg+xml' })) : null), [arte.svg]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);

  async function baixar() {
    if (!arte.svg) return;
    try {
      baixarArquivo(await svgParaPng(arte.svg), `status-${data}-${indice + 1}.png`);
      marcar.mutate(arte.id);
    } catch (e) {
      toast(`Não foi possível baixar: ${(e as Error).message}`);
    }
  }

  async function legenda() {
    toast((await copiarTexto(arte.legenda)) ? 'Legenda copiada, com o link de entrada.' : 'Não deu para copiar a legenda.');
  }

  return (
    <div className="art-real">
      {url ? <img src={url} alt={`Arte ${indice + 1} do Status`} /> : <div className="art"><div className="pic">Arte indisponível</div></div>}
      <button type="button" className="btn btn-primary btn-sm" onClick={baixar} disabled={!arte.svg}>
        <Icone nome="down" />
        {arte.baixada_em ? 'Baixar de novo' : 'Baixar arte'}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={legenda}>
        <Icone nome="copy" />
        Copiar legenda
      </button>
    </div>
  );
}

export function ArtesStatus({ data, quantidade }: { data: string; quantidade: number }) {
  const toast = useToast();
  const artes = useArtesDoDia(data);
  const gerar = useGerarArtes(data);
  const lista = artes.data ?? [];

  function preparar(refazer: boolean) {
    gerar.mutate(
      { refazer },
      {
        onSuccess: (r) => toast(r.aviso ?? (r.geradas > 0 ? `${r.geradas} arte(s) prontas.` : 'As artes de hoje já estavam prontas.')),
        onError: (e) => toast(`Não foi possível preparar as artes: ${e.message}`),
      },
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Status do WhatsApp</h2>
          <p>{lista.length > 0 ? `${lista.length} arte(s) prontas, uma por oferta` : `${quantidade} artes por dia, uma por oferta aprovada`}</p>
        </div>
      </div>
      {artes.isLoading ? (
        <p className="carregando">Carregando...</p>
      ) : lista.length === 0 ? (
        <div className="empty" role="status">
          <h3>Sem artes hoje</h3>
          <p>{modoLocal ? 'Aguardando dados.' : 'As artes saem das ofertas aprovadas de hoje, pelas maiores notas.'}</p>
        </div>
      ) : (
        <div className="arts">
          {lista.map((a, i) => (
            <Arte key={a.id} arte={a} data={data} indice={i} />
          ))}
        </div>
      )}
      <p className="muted small" style={{ marginTop: 12 }}>
        A arte e a legenda levam só o link de entrada do canal, nunca link de oferta. Você baixa e posta no Status.
      </p>
      {!modoLocal ? (
        <div className="post-actions" style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => preparar(false)} disabled={gerar.isPending}>
            {lista.length > 0 ? 'Completar artes do dia' : 'Preparar artes do dia'}
          </button>
          {lista.length > 0 ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => preparar(true)} disabled={gerar.isPending}>
              Refazer artes
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

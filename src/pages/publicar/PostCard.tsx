import { useState } from 'react';
import { horaLocal } from '@core/formato.ts';
import { Icone } from '@/components/Icone';
import { useToast } from '@/components/Toast';
import {
  concluido,
  enviosCancelaveis,
  podeMarcarEnviado,
  precisaRevisar,
  seloGuardia,
  textoCanal,
  textoParaCopiar,
  type EnvioLinha,
  type PostDoBloco,
} from './estado';
import { lerReais } from './manual';
import { copiarTexto } from './png';
import { useAtualizarPreco, useCancelarPost, useMarcarEnviado } from './dados';

const ROTULO_CANAL = { tg: 'Canal no Telegram', wa: 'Canal do WhatsApp' } as const;

function Canal({ envio }: { envio: EnvioLinha }) {
  const t = textoCanal(envio);
  return (
    <div className="ch">
      <b>{ROTULO_CANAL[envio.canal]}</b>
      <span className={t.tom}>{t.texto}</span>
    </div>
  );
}

export function PostCard({ p, data, userId, eLana }: { p: PostDoBloco; data: string; userId: string; eLana: boolean }) {
  const toast = useToast();
  const marcar = useMarcarEnviado(data);
  const cancelar = useCancelarPost(data);
  const atualizar = useAtualizarPreco(data);
  const [preco, setPreco] = useState('');
  const selo = seloGuardia(p);
  const revisar = precisaRevisar(p);
  const texto = textoParaCopiar(p);
  const semProduto = !p.post.produto_id;

  async function copiar() {
    toast((await copiarTexto(texto)) ? 'Texto copiado. Cole no canal do WhatsApp.' : 'Não deu para copiar. Segure no texto e copie.');
  }

  function enviar() {
    if (!p.wa) return;
    marcar.mutate(
      { envioId: p.wa.id, userId },
      { onSuccess: () => toast('Marcado como enviado.'), onError: (e) => toast(`Não foi possível marcar: ${e.message}`) },
    );
  }

  function republicar() {
    const valor = preco.trim() ? lerReais(preco) : undefined;
    if (valor === null || (semProduto && valor === undefined)) {
      toast('Informe o preço atual, por exemplo 39,90.');
      return;
    }
    atualizar.mutate(
      { post_id: p.post.id, ...(valor !== undefined ? { preco_atual: valor } : {}) },
      {
        onSuccess: () => {
          setPreco('');
          toast('Texto remontado com o preço atual e checado de novo pela Guardiã.');
        },
        onError: (e) => toast(`Não foi possível atualizar: ${e.message}`),
      },
    );
  }

  function cancelarPost() {
    if (!window.confirm('Cancelar este post nos dois canais? Ele não sai mais hoje.')) return;
    cancelar.mutate(p, { onSuccess: () => toast('Post cancelado.'), onError: (e) => toast(`Não foi possível cancelar: ${e.message}`) });
  }

  return (
    <article className={`post${concluido(p) ? ' sent' : ''}`}>
      <header className="post-head">
        <span className="time">{horaLocal(new Date(p.horario))}</span>
        <h3>{p.post.titulo}</h3>
        {p.post.tipo === 'manual' ? <span className="pill pill-std">Post manual</span> : null}
        <span className={`pill pill-${selo.tom}`}>{selo.texto}</span>
      </header>
      <div className="bubble">
        <pre className="post-text">{texto}</pre>
      </div>
      <div className="channels">
        {p.tg ? <Canal envio={p.tg} /> : null}
        {p.wa ? <Canal envio={p.wa} /> : null}
      </div>
      <div className="post-actions">
        {p.wa && p.wa.estado !== 'cancelado' ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={copiar}>
            <Icone nome="copy" />
            Copiar texto
          </button>
        ) : null}
        {eLana && podeMarcarEnviado(p) ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={enviar} disabled={marcar.isPending}>
            Marcar como enviado
          </button>
        ) : null}
        {!revisar && enviosCancelaveis(p).length > 0 ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={cancelarPost} disabled={cancelar.isPending}>
            Cancelar post
          </button>
        ) : null}
      </div>
      {revisar ? (
        <div className="revisar">
          {eLana ? (
            <>
              <div className="field">
                <label htmlFor={`preco-${p.post.id}`}>Preço atual (R$)</label>
                <input
                  id={`preco-${p.post.id}`}
                  className="input"
                  inputMode="decimal"
                  placeholder={semProduto ? 'Obrigatório' : 'Último preço visto'}
                  value={preco}
                  onChange={(e) => setPreco(e.target.value)}
                />
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={republicar} disabled={atualizar.isPending}>
                Atualizar preço e publicar
              </button>
            </>
          ) : (
            <p className="muted small">A Lana revisa o preço deste post.</p>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={cancelarPost} disabled={cancelar.isPending}>
            Cancelar post
          </button>
        </div>
      ) : null}
    </article>
  );
}

// Card de uma oferta (F-03): foto, nicho, nota, de/por, comissão estimada, motivos, alertas
// e a prévia do post completo. Ações (F-04) só para quem decide (a Lana).
import { useState } from 'react';
import { reais, porcento } from '@core/formato.ts';
import { comissaoEstimada, estaExpirada, MOTIVOS_PULO, textoForaDoNicho, validarFrase, type Canal, type OfertaFila } from '@core/ofertas/fila.ts';
import { mostraDePor, previaDoPost, type RegrasPrevia } from '@core/ofertas/previa.ts';
import { Icone } from '@/components/Icone';
import type { AcaoOferta } from './dados';

type Modo = 'normal' | 'editar' | 'pular';

export interface PropsCartao {
  oferta: OfertaFila;
  regras: RegrasPrevia;
  fraseMax: number;
  podeDecidir: boolean;
  ocupado: boolean;
  agora: Date;
  agir: (a: AcaoOferta) => Promise<boolean>;
}

export function CartaoOferta({ oferta: o, regras, fraseMax, podeDecidir, ocupado, agora, agir }: PropsCartao) {
  const [modo, setModo] = useState<Modo>('normal');
  const [canais, setCanais] = useState<Record<Canal, boolean>>({ wa: true, tg: true });
  const [frase, setFrase] = useState(o.frase ?? '');
  const [motivo, setMotivo] = useState('');

  const expirada = estaExpirada(o, agora);
  const escrevendo = o.estado === 'aguardando_redacao';
  const comissao = comissaoEstimada(o.preco_atual, o.comissao_taxa);
  const dePor = mostraDePor(o, regras);
  const fraseOk = validarFrase(frase, fraseMax);
  const tamanho = [...frase.replace(/\s+/g, ' ').trim()].length;
  const previa = previaDoPost({ titulo: o.produto.nome, preco_atual: o.preco_atual, preco_referencia: o.preco_referencia, dias_historico: o.dias_historico, cupom: o.cupom, prazo: o.prazo, frase: modo === 'editar' ? (fraseOk.ok ? fraseOk.valor : frase) : o.frase }, regras);
  const canaisMarcados = (Object.keys(canais) as Canal[]).filter((c) => canais[c]);
  const id = `o-${o.id}`;

  async function aprovar() {
    await agir({ acao: 'aprovar', oferta_id: o.id, canais: canaisMarcados });
  }
  async function salvarFrase() {
    if (!fraseOk.ok) return;
    if (await agir({ acao: 'editar_frase', oferta_id: o.id, frase: fraseOk.valor })) setModo('normal');
  }
  async function pular() {
    if (await agir({ acao: 'pular', oferta_id: o.id, motivo: motivo.trim() || null })) setModo('normal');
  }

  return (
    <article className={`offer${expirada ? ' offer-expirada' : ''}`} aria-labelledby={`${id}-nome`}>
      <div className="thumb">{o.produto.imagem_url ? <img src={o.produto.imagem_url} alt="" loading="lazy" /> : <span>Sem foto</span>}</div>
      <div className="offer-body">
        <div className="offer-top">
          <span className="offer-pills">
            <span className="pill pill-plum">{o.produto.nicho_nome ?? 'Sem nicho'}</span>
            {o.origem === 'pedido' ? <span className="pill pill-sun">Pedido</span> : null}
            {expirada ? <span className="pill pill-warn">Expirada</span> : null}
          </span>
          {o.nota !== null ? (
            <span className="score" title="Nota da oferta (0 a 100)">
              {o.nota}
              <small>/100</small>
            </span>
          ) : null}
        </div>
        <h3 id={`${id}-nome`}>{o.produto.nome}</h3>
        <p className="price">
          {dePor ? (
            <>
              De <s>{reais(o.preco_referencia as number)}</s> por <strong>{reais(o.preco_atual)}</strong>
            </>
          ) : (
            <>
              Por <strong>{reais(o.preco_atual)}</strong>
            </>
          )}
        </p>
        <div className="comm">
          {o.comissao_extra ? (
            <span className="pill pill-extra">Comissão Extra{o.comissao_taxa ? ` ${porcento(o.comissao_taxa)}` : ''}</span>
          ) : (
            <span className="pill pill-std">{o.comissao_taxa ? `Comissão padrão ${porcento(o.comissao_taxa)}` : 'Comissão padrão'}</span>
          )}
          {comissao !== null ? (
            <span>
              Cerca de <b>{reais(comissao)}</b> por venda
            </span>
          ) : (
            <span>Comissão por venda: aguardando dados</span>
          )}
        </div>
        <ul className="reasons">
          {o.motivos.map((m, i) => (
            <li key={`m${i}`} className="ok">
              <Icone nome="check" />
              {m}
            </li>
          ))}
          {o.fora_nicho_principal ? (
            <li className="neutral">
              <Icone nome="info" />
              {textoForaDoNicho(o.produto.nicho_nome)}
            </li>
          ) : null}
          {o.alertas.map((a, i) => (
            <li key={`a${i}`} className="warn">
              <Icone nome="alert" />
              <span>
                {a.texto}
                {a.trecho ? <> Trecho: <mark>{a.trecho}</mark></> : null}
              </span>
            </li>
          ))}
          {escrevendo ? (
            <li className="neutral">
              <Icone nome="pen" />A Redatora está escrevendo outra versão. Ela volta para cá em alguns minutos.
            </li>
          ) : null}
        </ul>

        <div className="previa">
          <span className="previa-rotulo">Prévia do post{o.frase_editada ? ' (frase editada por você)' : ''}</span>
          <div className="bubble">
            <pre>{previa}</pre>
          </div>
        </div>

        {podeDecidir && !expirada && modo === 'editar' ? (
          <div className="field">
            <label htmlFor={`${id}-frase`}>Frase do post</label>
            <textarea id={`${id}-frase`} rows={3} value={frase} onChange={(e) => setFrase(e.target.value)} aria-describedby={`${id}-conta`} />
            <small id={`${id}-conta`} className={fraseOk.ok ? 'conta' : 'conta conta-erro'}>
              {tamanho} de {fraseMax} caracteres{tamanho === 0 ? '. Sem frase, o post sai sem ela.' : ''}
            </small>
            <div className="offer-actions">
              <button type="button" className="btn btn-primary" disabled={ocupado || !fraseOk.ok} onClick={salvarFrase}>
                Salvar frase
              </button>
              <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => { setFrase(o.frase ?? ''); setModo('normal'); }}>
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {podeDecidir && !expirada && modo === 'pular' ? (
          <div className="field">
            <label htmlFor={`${id}-motivo`}>Por que pular? (opcional, ensina a Caçadora)</label>
            <div className="f-chips motivos-pulo">
              {MOTIVOS_PULO.map((m) => (
                <button key={m} type="button" className="chip" aria-pressed={motivo === m} onClick={() => setMotivo(motivo === m ? '' : m)}>
                  {m}
                </button>
              ))}
            </div>
            <input id={`${id}-motivo`} type="text" className="campo" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ou escreva o motivo" />
            <div className="offer-actions">
              <button type="button" className="btn btn-primary" disabled={ocupado} onClick={pular}>
                Pular oferta
              </button>
              <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => setModo('normal')}>
                Voltar
              </button>
            </div>
          </div>
        ) : null}

        {podeDecidir && !expirada && modo === 'normal' ? (
          <>
            <fieldset className="canais-aprovar">
              <legend>Publicar em</legend>
              <label className="switch">
                <input type="checkbox" checked={canais.wa} onChange={(e) => setCanais({ ...canais, wa: e.target.checked })} />
                WhatsApp
              </label>
              <label className="switch">
                <input type="checkbox" checked={canais.tg} onChange={(e) => setCanais({ ...canais, tg: e.target.checked })} />
                Telegram
              </label>
            </fieldset>
            <div className="offer-actions">
              <button type="button" className="btn btn-primary" disabled={ocupado || canaisMarcados.length === 0} onClick={aprovar}>
                Aprovar
              </button>
              <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => setModo('pular')}>
                Pular
              </button>
            </div>
            <div className="offer-actions offer-actions-2">
              <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => { setFrase(o.frase ?? ''); setModo('editar'); }}>
                <Icone nome="pen" />
                Editar frase
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado || escrevendo} onClick={() => void agir({ acao: 'outra_versao', oferta_id: o.id })}>
                <Icone nome="loop" />
                Outra versão
              </button>
              <a className="btn btn-ghost btn-sm" href={o.produto.url_produto} target="_blank" rel="noopener noreferrer">
                <Icone nome="arrow" />
                Ver na Shopee
              </a>
            </div>
          </>
        ) : null}

        {!podeDecidir || expirada ? (
          <div className="offer-actions">
            <a className="btn btn-ghost btn-sm" href={o.produto.url_produto} target="_blank" rel="noopener noreferrer">
              <Icone nome="arrow" />
              Ver na Shopee
            </a>
          </div>
        ) : null}
        {canaisMarcados.length === 0 && podeDecidir && !expirada && modo === 'normal' ? <p className="aviso-canal">Marque pelo menos um canal para aprovar.</p> : null}
      </div>
    </article>
  );
}

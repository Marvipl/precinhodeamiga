// Ofertas para aprovar (F-03, F-04, F-05).
import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { reais } from '@core/formato.ts';
import { contarAprovadas, estadoDaTela, estaExpirada, filtrarOfertas, FILTROS_INICIAIS, interpretarPedido, naFila, ordenarFila, podeDecidir, rotuloAprovadas, type Filtros } from '@core/ofertas/fila.ts';
import { CabecalhoTela, Vazio } from '@/components/Vazio';
import { Icone } from '@/components/Icone';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/lib/config';
import { modoLocal } from '@/lib/supabase';
import { CartaoOferta } from './CartaoOferta';
import { CHAVE_OFERTAS, ErroAcao, useAcaoOferta, useNichos, useOfertasDoDia, usePedidosAbertos, type AcaoOferta } from './dados';
import './ofertas.css';

const TOAST: Record<AcaoOferta['acao'], string> = {
  aprovar: 'Aprovada. O post já está montado e agendado.',
  pular: 'Pulada. A Caçadora aprende com isso.',
  editar_frase: 'Frase salva. A prévia já mostra o texto novo.',
  outra_versao: 'Pedido enviado à Redatora. A nova versão volta para esta fila.',
  pedir_produto: 'Pedido enviado à Caçadora.',
};

const ESTADO_PEDIDO: Record<string, string> = {
  procurando: 'Caçadora procurando',
  opcoes_encontradas: 'Opções encontradas',
};

export default function Pagina() {
  const { perfil } = useAuth();
  const decide = podeDecidir(perfil?.papel);
  const toast = useToast();
  const qc = useQueryClient();
  const { data: cfg } = useConfig();
  const ofertas = useOfertasDoDia();
  const { data: nichos = [] } = useNichos();
  const { data: pedidos = [] } = usePedidosAbertos();
  const acao = useAcaoOferta();
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [pedido, setPedido] = useState('');
  const [erroPedido, setErroPedido] = useState('');

  const agora = new Date();
  const todas = ofertas.data ?? [];
  const regras = { historicoCurtoDias: cfg?.historicoCurtoDias ?? 7, descontoRealMinimo: cfg?.descontoRealMinimo ?? 0.1 };
  const fraseMax = cfg?.fraseMaxCaracteres ?? 140;

  const naFilaHoje = useMemo(() => ordenarFila(todas.filter((o) => naFila(o) && !estaExpirada(o, agora))), [todas]); // eslint-disable-line react-hooks/exhaustive-deps
  const expiradas = useMemo(() => todas.filter((o) => o.estado === 'expirada' || (naFila(o) && estaExpirada(o, agora))), [todas]); // eslint-disable-line react-hooks/exhaustive-deps
  const visiveis = filtrarOfertas(naFilaHoje, filtros);
  const visiveisExpiradas = filtrarOfertas(expiradas, filtros);
  const aprovadas = contarAprovadas(todas);
  const estado = estadoDaTela({ carregando: ofertas.isLoading, total: todas.length, naFila: naFilaHoje.length });
  const nichosNaFila = nichos.filter((n) => todas.some((o) => o.produto.nicho_id === n.id));

  async function agir(a: AcaoOferta): Promise<boolean> {
    if (modoLocal) {
      toast('Modo local: as ações funcionam quando o Supabase estiver ligado.');
      return false;
    }
    setOcupada('oferta_id' in a ? a.oferta_id : 'pedido');
    try {
      const r = await acao.mutateAsync(a);
      if (a.acao === 'aprovar' && r.aviso) toast('Aprovada. O post será montado assim que a montagem estiver ligada.');
      else if (a.acao === 'pedir_produto' && r.job_id === null) toast('Pedido guardado. A Caçadora procura na próxima rodada.');
      else toast(TOAST[a.acao]);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível concluir.');
      if (e instanceof ErroAcao && e.expirada) void qc.invalidateQueries({ queryKey: CHAVE_OFERTAS });
      return false;
    } finally {
      setOcupada(null);
    }
  }

  async function enviarPedido(ev: FormEvent) {
    ev.preventDefault();
    const p = interpretarPedido(pedido);
    if (!p.ok) {
      setErroPedido(p.erro);
      return;
    }
    setErroPedido('');
    if (await agir({ acao: 'pedir_produto', texto: pedido })) setPedido('');
  }

  return (
    <section className="view" aria-labelledby="h-ofertas">
      <CabecalhoTela
        eyebrow="Caçadora de Ofertas"
        titulo="Ofertas para aprovar"
        lead="Cada oferta passou pelos critérios do plano: desconto real, loja bem avaliada, comissão e nicho. Você aprova o texto, não só o produto."
        acoes={<span className="pill pill-plum num" aria-live="polite">{rotuloAprovadas(aprovadas)}</span>}
      />

      {!decide ? (
        <p className="nota-dono" role="note">
          Você vê a fila como a Lana vê. Aprovar, pular e pedir outra versão ficam com ela.
        </p>
      ) : null}

      <form className="ask" onSubmit={enviarPedido} noValidate>
        <input
          type="text"
          autoComplete="off"
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          placeholder="Peça para a Caçadora. Ex.: procure [produto] até R$ [valor]"
          aria-label="Pedido para a Caçadora"
          aria-invalid={erroPedido ? true : undefined}
          aria-describedby={erroPedido ? 'erro-pedido' : undefined}
        />
        <button className="btn btn-primary" type="submit" disabled={ocupada === 'pedido'}>
          <Icone nome="search" />
          Procurar
        </button>
      </form>
      {erroPedido ? (
        <p id="erro-pedido" className="erro-campo" role="alert">
          {erroPedido}
        </p>
      ) : null}
      {pedidos.length ? (
        <ul className="pedidos-abertos" aria-label="Seus pedidos à Caçadora">
          {pedidos.map((p) => (
            <li key={p.id}>
              <span>
                {p.texto}
                {p.preco_max !== null ? ` até ${reais(Number(p.preco_max))}` : ''}
              </span>
              <span className={`pill ${p.estado === 'opcoes_encontradas' ? 'pill-ok' : 'pill-std'}`}>{ESTADO_PEDIDO[p.estado] ?? p.estado}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {todas.length ? (
        <div className="filters" role="group" aria-label="Filtrar ofertas">
          <input
            className="busca"
            type="search"
            value={filtros.busca}
            onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
            placeholder="Buscar nas ofertas"
            aria-label="Buscar nas ofertas"
          />
          <button type="button" className="chip" aria-pressed={filtros.nichoId === null} onClick={() => setFiltros({ ...filtros, nichoId: null })}>
            Todos os nichos
          </button>
          {nichosNaFila.map((n) => (
            <button key={n.id} type="button" className="chip" aria-pressed={filtros.nichoId === n.id} onClick={() => setFiltros({ ...filtros, nichoId: n.id })}>
              {n.nome}
            </button>
          ))}
          <label className="switch">
            <input type="checkbox" checked={filtros.soExtra} onChange={(e) => setFiltros({ ...filtros, soExtra: e.target.checked })} />
            Só Comissão Extra
          </label>
        </div>
      ) : null}

      {estado === 'carregando' ? (
        <div className="empty" role="status" aria-busy="true">
          <h3>Carregando as ofertas do dia</h3>
        </div>
      ) : null}

      {estado === 'vazio' ? (
        <Vazio titulo="Nenhuma oferta para hoje ainda">A Caçadora volta na próxima rodada. A fila do dia chega depois da coleta da madrugada.</Vazio>
      ) : null}

      {estado === 'tudo_revisado' ? (
        <Vazio titulo="Tudo revisado">As aprovadas já estão agendadas. A Caçadora volta a procurar na próxima rodada.</Vazio>
      ) : null}

      {estado === 'com_ofertas' ? (
        <>
          <p className="contador" aria-live="polite">
            {naFilaHoje.length === 1 ? '1 oferta para revisar' : `${naFilaHoje.length} ofertas para revisar`}
            {visiveis.length !== naFilaHoje.length ? ` (${visiveis.length} no filtro)` : ''}
          </p>
          {visiveis.length ? (
            <div className="offers">
              {visiveis.map((o) => (
                <CartaoOferta key={o.id} oferta={o} regras={regras} fraseMax={fraseMax} podeDecidir={decide} ocupado={ocupada === o.id} agora={agora} agir={agir} />
              ))}
            </div>
          ) : (
            <Vazio titulo="Nada neste filtro">Mude a busca, o nicho ou desligue "Só Comissão Extra".</Vazio>
          )}
        </>
      ) : null}

      {visiveisExpiradas.length ? (
        <details className="expiradas">
          <summary>{visiveisExpiradas.length === 1 ? '1 oferta expirou enquanto estava na fila' : `${visiveisExpiradas.length} ofertas expiraram enquanto estavam na fila`}</summary>
          <div className="offers">
            {visiveisExpiradas.map((o) => (
              <CartaoOferta key={o.id} oferta={o} regras={regras} fraseMax={fraseMax} podeDecidir={decide} ocupado={false} agora={agora} agir={agir} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

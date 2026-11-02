// Coleta diária da Shopee (F-02), montagem das candidatas e criação do job diário da curadoria (Fluxo A, A.3).
// Sem Deno.*: dependências por parâmetro, para rodar no Deno e nos testes (Node).
import { resolverConfig } from '../core/config.ts';
import { contrato } from '../core/contratos/index.ts';
import { entradaCuradoria, melhoresCandidatas, montarCandidata, type Candidata, type EntradaCuradoria } from '../core/curadoria/candidata.ts';
import { tamanhoFila } from '../core/curadoria/nota.ts';
import { dataLocal, somarDias } from '../core/formato.ts';
import { criarJob } from '../jobs/runtime.ts';
import type { JobStore } from '../jobs/store.ts';
import type { ClienteShopee, OfertaShopee } from '../shopee/tipos.ts';
import type { ColetaStore, NichoColeta } from './store.ts';

/** [SUPOSIÇÃO S-P1-2] Até 2 páginas de 20 ofertas por palavra-chave por dia (cabe nos limites e no tempo da função). */
export const PAGINAS_POR_PALAVRA = 2;
export const OFERTAS_POR_PAGINA = 20;
/** Pulos considerados pela Caçadora (combinado com o contrato curadoria/v1). */
export const DIAS_PULOS = 14;
export const MAX_PULOS = 50;

export interface ResultadoColeta {
  data: string;
  modo: 'real' | 'simulado';
  palavras: number;
  ofertas: number;
  produtos: number;
  erros: { palavra: string; erro: string }[];
}

export interface OpcoesColeta {
  store: ColetaStore;
  cliente: ClienteShopee;
  agora?: Date;
  /** Palavras avulsas (ex.: pedido de produto), sem nicho. Se informadas, só elas são buscadas. */
  palavras?: string[];
  paginas?: number;
}

function ordenarNichos(n: NichoColeta[]): NichoColeta[] {
  // O nicho principal vem primeiro: um produto achado por duas palavras fica no principal.
  return [...n].filter((x) => x.ativo && !x.bloqueado).sort((a, b) => Number(b.principal) - Number(a.principal) || a.nome.localeCompare(b.nome));
}

export async function coletar(o: OpcoesColeta): Promise<ResultadoColeta> {
  const agora = o.agora ?? new Date();
  const hoje = dataLocal(agora);
  const paginas = o.paginas ?? PAGINAS_POR_PALAVRA;
  const buscas: { palavra: string; nichoId: string | null }[] = o.palavras
    ? o.palavras.map((p) => ({ palavra: p.trim(), nichoId: null })).filter((b) => b.palavra)
    : ordenarNichos(await o.store.lerNichos()).flatMap((n) => n.palavras_chave.map((p) => ({ palavra: p.trim(), nichoId: n.id })).filter((b) => b.palavra));

  const vistos = new Map<string, { oferta: OfertaShopee; nichoId: string | null }>();
  const erros: ResultadoColeta['erros'] = [];
  let ofertas = 0;
  for (const b of buscas) {
    try {
      for (let pagina = 1; pagina <= paginas; pagina++) {
        const r = await o.cliente.buscarOfertas({ palavraChave: b.palavra, pagina, limite: OFERTAS_POR_PAGINA });
        ofertas += r.ofertas.length;
        for (const item of r.ofertas) {
          const k = `${item.shopee_shop_id}:${item.shopee_item_id}`;
          if (!vistos.has(k)) vistos.set(k, { oferta: item, nichoId: b.nichoId });
        }
        if (!r.temMais) break;
      }
    } catch (e) {
      erros.push({ palavra: b.palavra, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  for (const { oferta, nichoId } of vistos.values()) {
    const id = await o.store.salvarProduto(oferta, nichoId);
    if (oferta.preco > 0) await o.store.registrarPreco(id, hoje, oferta.preco);
  }

  const res: ResultadoColeta = { data: hoje, modo: o.cliente.modo, palavras: buscas.length, ofertas, produtos: vistos.size, erros };
  const sufixo = o.cliente.modo === 'simulado' ? ' (modo simulado)' : '';
  const texto = buscas.length
    ? `Coleta da Shopee: ${vistos.size} produtos de ${buscas.length} palavras-chave${sufixo}${erros.length ? `, ${erros.length} com erro` : ''}.`
    : 'Coleta da Shopee: nenhuma palavra-chave configurada. Cadastre nichos e palavras-chave em Configurações.';
  await o.store.registrarAtividade('cacadora', texto, '/ofertas');
  return res;
}

export interface OpcoesEntrada {
  store: ColetaStore;
  agora?: Date;
}

/** Monta a entrada do contrato curadoria/v1: as 30 melhores candidatas do dia, pedidos, nichos e pulos recentes. */
export async function montarEntradaCuradoria(o: OpcoesEntrada): Promise<{ entrada: EntradaCuradoria; eliminados: number; avaliados: number }> {
  const agora = o.agora ?? new Date();
  const hoje = dataLocal(agora);
  const cfg = resolverConfig(await o.store.lerConfig());
  const regras = {
    janelaHistoricoDias: cfg.janelaHistoricoDias,
    descontoRealMinimo: cfg.descontoRealMinimo,
    historicoCurtoDias: cfg.historicoCurtoDias,
    pesosNota: cfg.pesosNota,
    lojaNotaMinima: cfg.lojaNotaMinima,
    lojaAvaliacoesMinimas: cfg.lojaAvaliacoesMinimas,
  };
  const linhas = await o.store.produtosDoDia(hoje, somarDias(hoje, -cfg.janelaHistoricoDias));
  const boas: Candidata[] = [];
  let eliminados = 0;
  for (const l of linhas) {
    const r = montarCandidata(l.produto, l.precos, hoje, regras, agora);
    if (r.ok) boas.push(r.candidata);
    else eliminados += 1;
  }
  const nichos = (await o.store.lerNichos()).filter((n) => n.ativo && !n.bloqueado).map((n) => ({ id: n.id, nome: n.nome, principal: n.principal }));
  // V1: cadência fixa nos dois canais (pacote P3); a regra de redução por canal entra na V2.
  const cad = cfg.cadenciaInicial;
  const entrada: EntradaCuradoria = {
    data: hoje,
    tamanho_fila: tamanhoFila({ wa: cad, tg: cad }, cfg.folgaFila),
    candidatas: melhoresCandidatas(boas, Math.min(cfg.candidatasParaIa, 30)),
    pedidos: await o.store.pedidosAbertos(),
    nichos,
    pulos_recentes: await o.store.pulosDesde(somarDias(hoje, -DIAS_PULOS), MAX_PULOS),
  };
  return { entrada: entradaCuradoria.parse(entrada), eliminados, avaliados: linhas.length };
}

export type ResultadoJobCuradoria =
  | { criado: true; job_id: string; candidatas: number }
  | { criado: false; motivo: 'ja_existe' | 'sem_candidatas' | 'contrato_ausente'; job_id?: string; candidatas: number };

export const CONTRATO_CURADORIA = 'curadoria/v1';

/** Cria o job diário `curadoria:<data>` (05:37). Idempotente pela chave única. */
export async function criarJobCuradoria(o: OpcoesEntrada & { jobs: JobStore }): Promise<ResultadoJobCuradoria> {
  const { entrada, eliminados, avaliados } = await montarEntradaCuradoria(o);
  const n = entrada.candidatas.length;
  if (n === 0) {
    await o.store.registrarAtividade('cacadora', `Curadoria de ${entrada.data}: nenhuma candidata (${avaliados} produtos avaliados, ${eliminados} eliminados).`, '/ofertas');
    return { criado: false, motivo: 'sem_candidatas', candidatas: 0 };
  }
  // O contrato curadoria/v1 é do pacote da fila de ofertas. Sem ele registrado, não há como validar o retorno.
  if (!contrato(CONTRATO_CURADORIA)) return { criado: false, motivo: 'contrato_ausente', candidatas: n };
  const { job, criado } = await criarJob(o.jobs, { rotina: 'pa-curadoria', contrato: CONTRATO_CURADORIA, entrada, chave_unica: `curadoria:${entrada.data}` });
  if (!criado) return { criado: false, motivo: 'ja_existe', job_id: job.id, candidatas: n };
  await o.store.registrarAtividade('cacadora', `Curadoria de ${entrada.data}: ${n} candidatas enviadas para escolha (fila de ${entrada.tamanho_fila}).`, '/ofertas');
  return { criado: true, job_id: job.id, candidatas: n };
}

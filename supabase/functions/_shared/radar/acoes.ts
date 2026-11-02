// Ações da Lana sobre os lugares do Radar (F-21). As regras ficam em core/radar; aqui só se aplica e grava.
import { dataLocal } from '../core/formato.ts';
import { gerarOrigem } from '../core/radar/entrada.ts';
import { podeDivulgarHoje, proximaVezPermitida } from '../core/radar/agenda.ts';
import { transicionar, type AcaoLugar, type EstadoLugar } from '../core/radar/lugares.ts';

export interface LugarAcao {
  id: string;
  nome: string;
  estado: EstadoLugar;
  proibe_links: boolean;
  origem: string | null;
  dias_permitidos: number[];
  intervalo_dias: number | null;
}

export interface StoreRadar {
  lerLugar: (id: string) => Promise<LugarAcao | null>;
  origensUsadas: () => Promise<string[]>;
  /** Instante (ISO) da última divulgação neste lugar. */
  ultimaDivulgacao: (lugarId: string) => Promise<string | null>;
  atualizarLugar: (id: string, campos: Record<string, unknown>) => Promise<void>;
  inserirDivulgacao: (d: { lugar_id: string; origem: string; divulgado_em: string; registrado_por: string | null }) => Promise<void>;
  atividade: (texto: string) => Promise<void>;
}

export type PedidoAcao = {
  lugar_id: string;
  acao: AcaoLugar | 'divulguei';
  dias_permitidos?: number[];
  intervalo_dias?: number;
};

export type RespostaAcao =
  | { ok: true; estado: EstadoLugar; origem: string | null; proxima: string | null }
  | { ok: false; status: number; motivo: string };

const ACOES = ['adicionar', 'descartar', 'ja_pedi', 'aprovou', 'recusou', 'divulguei'];

export async function aplicarAcao(store: StoreRadar, p: PedidoAcao, quem: string | null, agora = new Date()): Promise<RespostaAcao> {
  if (!p || typeof p.lugar_id !== 'string' || !ACOES.includes(p.acao)) return { ok: false, status: 400, motivo: 'pedido inválido' };
  const l = await store.lerLugar(p.lugar_id);
  if (!l) return { ok: false, status: 404, motivo: 'lugar não encontrado' };
  const hoje = dataLocal(agora);
  const iso = agora.toISOString();

  if (p.acao === 'divulguei') {
    if (!l.origem || l.intervalo_dias == null) return { ok: false, status: 409, motivo: 'Só lugares aprovados recebem divulgação.' };
    const ultima = await store.ultimaDivulgacao(l.id);
    const agenda = { dias_permitidos: l.dias_permitidos, intervalo_dias: l.intervalo_dias, ultima_divulgacao: ultima ? dataLocal(new Date(ultima)) : null };
    const pode = podeDivulgarHoje({ ...agenda, estado: l.estado }, hoje);
    if (!pode.ok) return { ok: false, status: 409, motivo: pode.motivo };
    await store.inserirDivulgacao({ lugar_id: l.id, origem: l.origem, divulgado_em: iso, registrado_por: quem });
    await store.atividade(`Divulgação registrada em "${l.nome}". A Audiência acompanha as 48 horas seguintes.`);
    return { ok: true, estado: l.estado, origem: l.origem, proxima: proximaVezPermitida({ ...agenda, ultima_divulgacao: hoje }, hoje) };
  }

  const t = transicionar(l, p.acao, { dias_permitidos: p.dias_permitidos, intervalo_dias: p.intervalo_dias });
  if (!t.ok) return { ok: false, status: 409, motivo: t.motivo };

  const campos: Record<string, unknown> = { estado: t.estado };
  let origem = l.origem;
  if (p.acao === 'ja_pedi') campos.pedido_em = iso;
  if (p.acao === 'recusou') campos.recusado_em = iso;
  if (p.acao === 'descartar') campos.descartado_em = iso;
  if (p.acao === 'aprovou') {
    origem = l.origem ?? gerarOrigem(l.nome, new Set(await store.origensUsadas()));
    campos.aprovado_em = iso;
    campos.origem = origem;
    campos.dias_permitidos = [...new Set(p.dias_permitidos!)].sort((a, b) => a - b);
    campos.intervalo_dias = p.intervalo_dias;
  }
  await store.atualizarLugar(l.id, campos);

  let proxima: string | null = null;
  if (t.estado === 'aprovado') {
    const ultima = await store.ultimaDivulgacao(l.id);
    proxima = proximaVezPermitida(
      {
        dias_permitidos: campos.dias_permitidos as number[],
        intervalo_dias: campos.intervalo_dias as number,
        ultima_divulgacao: ultima ? dataLocal(new Date(ultima)) : null,
      },
      hoje,
    );
    await store.atividade(`Lugar aprovado: "${l.nome}" ganhou o link de entrada próprio.`);
  }
  return { ok: true, estado: t.estado, origem, proxima };
}

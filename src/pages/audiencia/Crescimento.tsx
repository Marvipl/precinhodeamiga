// Gráfico de crescimento (só depois de duas semanas de registros): total por dia de cada canal.
import type { PontoCrescimento } from '@core/audiencia/index.ts';
import { dataCurta } from '@core/formato.ts';

const L = 320;
const A = 160;
const M = { e: 36, d: 8, t: 8, b: 22 };
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function Crescimento({ serie }: { serie: PontoCrescimento[] }) {
  const valores = serie.flatMap((p) => [p.wa, p.tg]).filter((v): v is number => v !== null);
  const max = Math.max(1, ...valores);
  const x = (i: number) => M.e + (i * (L - M.e - M.d)) / Math.max(1, serie.length - 1);
  const y = (v: number) => M.t + (A - M.t - M.b) * (1 - v / max);
  const linha = (k: 'wa' | 'tg') =>
    serie
      .map((p, i) => (p[k] === null ? null : `${x(i).toFixed(1)},${y(p[k] as number).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');
  const ultimo = serie[serie.length - 1];
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${L} ${A}`} width="100%" role="img" aria-label={`Seguidores por dia de ${dataCurta(serie[0].data)} a ${dataCurta(ultimo.data)}`}>
        <line x1={M.e} x2={L - M.d} y1={y(0)} y2={y(0)} stroke="var(--line)" />
        <line x1={M.e} x2={L - M.d} y1={y(max)} y2={y(max)} stroke="var(--line)" strokeDasharray="3 3" />
        <text x={M.e - 4} y={y(max) + 4} fontSize="10" textAnchor="end" fill="var(--muted)">{inteiro.format(max)}</text>
        <text x={M.e - 4} y={y(0) + 4} fontSize="10" textAnchor="end" fill="var(--muted)">0</text>
        <text x={M.e} y={A - 6} fontSize="10" fill="var(--muted)">{dataCurta(serie[0].data)}</text>
        <text x={L - M.d} y={A - 6} fontSize="10" textAnchor="end" fill="var(--muted)">{dataCurta(ultimo.data)}</text>
        <polyline points={linha('wa')} fill="none" stroke="var(--good)" strokeWidth="2" />
        <polyline points={linha('tg')} fill="none" stroke="var(--plum)" strokeWidth="2" />
      </svg>
      <figcaption className="tl-legend">
        <span><i style={{ background: 'var(--good)' }} />WhatsApp{ultimo.wa !== null ? `: ${inteiro.format(ultimo.wa)}` : ''}</span>
        <span><i style={{ background: 'var(--plum)' }} />Telegram{ultimo.tg !== null ? `: ${inteiro.format(ultimo.tg)}` : ''}</span>
      </figcaption>
    </figure>
  );
}

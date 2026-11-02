import { describe, expect, it } from 'vitest';
import {
  AVISO_COMISSAO,
  datasParaLista,
  escolherAchados,
  linkEntrada,
  podePedirOutraVersao,
  referenciaRespostas,
  taticasDaSemana,
  temasRepetidos,
  textoConvite,
  textoLista,
  textoRoteiro,
  type DuvidaRegistrada,
} from './regras.ts';
import { montarConteudo } from './montar.ts';
import { redacaoExtra, type EntradaRedacaoExtra } from '../contratos/redacao-extra.ts';
import { contrato } from '../contratos/index.ts';

const DATAS = [
  { id: 'd1', data: '2026-11-11', nome: '11.11' },
  { id: 'd2', data: '2026-11-27', nome: 'Black Friday' },
  { id: 'd3', data: '2026-12-25', nome: 'Natal' },
  { id: 'd0', data: '2026-10-30', nome: 'Data passada' },
];

describe('táticas da semana (F-27)', () => {
  it('convite pessoal usa o link de entrada com origem própria e nunca fala em adicionar', () => {
    const link = linkEntrada('https://exemplo.invalid/', 'convite');
    expect(link).toBe('https://exemplo.invalid/entrar?o=convite');
    const t = textoConvite(link);
    expect(t).toContain(link);
    expect(t).toMatch(/Se quiser, é só seguir/);
  });

  it('lista de data só aparece de hoje até 30 dias antes, em ordem', () => {
    expect(datasParaLista('2026-11-02', DATAS).map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(datasParaLista('2026-11-26', DATAS).map((d) => d.id)).toEqual(['d2', 'd3']);
    expect(datasParaLista('2026-11-28', DATAS).map((d) => d.id)).toEqual(['d3']);
  });

  it('monta as táticas com o estado de cada lista', () => {
    const t = taticasDaSemana({
      hoje: '2026-11-02',
      linkConvite: 'https://exemplo.invalid/entrar?o=convite',
      artesStatusPorDia: 3,
      datasPico: DATAS,
      conteudos: [
        { id: 'c1', tipo: 'lista_data', referencia: 'lista_data:d2', estado: 'em_preparo' },
        { id: 'c0', tipo: 'lista_data', referencia: 'lista_data:d1', estado: 'descartado' },
      ],
    });
    expect(t.map((x) => x.id)).toEqual(['convite', 'radar', 'status', 'lista:d1', 'lista:d2']);
    const l1 = t[3] as Extract<(typeof t)[number], { dataPicoId: string }>;
    const l2 = t[4] as Extract<(typeof t)[number], { dataPicoId: string }>;
    expect(l1.estado).toBe('preparar');
    expect(l2.estado).toBe('em_preparo');
    expect(l2.nota).toContain('27/11');
    expect(t[2].titulo).toBe('3 a 5 achados por dia no Status');
  });
});

describe('respostas da semana (seção 5.13)', () => {
  const agora = new Date('2026-11-09T15:00:00Z');
  const d = (tema: string, contato: string, quando: string): DuvidaRegistrada => ({ tema, contato_ref: contato, pergunta: `Pergunta de teste sobre ${tema}`, criado_em: quando });

  it('só vira post com 3 pessoas diferentes em 7 dias', () => {
    const lista = [
      d('Cupom', 'p1', '2026-11-08T10:00:00Z'),
      d('cupom ', 'p2', '2026-11-07T10:00:00Z'),
      d('Cupom', 'p2', '2026-11-07T11:00:00Z'), // mesma pessoa não conta duas vezes
      d('Prazo de entrega', 'p1', '2026-11-08T10:00:00Z'),
      d('Prazo de entrega', 'p2', '2026-11-08T10:00:00Z'),
      d('Prazo de entrega', 'p3', '2026-11-01T10:00:00Z'), // fora da janela
    ];
    expect(temasRepetidos(lista, agora)).toEqual([]);
    const r = temasRepetidos([...lista, d('Cúpom', 'p3', '2026-11-09T09:00:00Z')], agora);
    expect(r).toHaveLength(1);
    expect(r[0].pessoas).toBe(3);
    expect(r[0].tema).toBe('Cupom');
  });

  it('um post por semana (referência da segunda-feira)', () => {
    expect(referenciaRespostas('2026-11-02')).toBe('respostas_semana:2026-11-02');
    expect(referenciaRespostas('2026-11-08')).toBe('respostas_semana:2026-11-02');
    expect(referenciaRespostas('2026-11-09')).toBe('respostas_semana:2026-11-09');
  });
});

describe('conteúdo extra (F-28)', () => {
  it('achados sem repetir produto, pela nota', () => {
    const a = escolherAchados(
      [
        { id: 'o1', nome: 'Produto de teste A', preco: 10, nota: 70, motivos: [], produto_id: 'p1' },
        { id: 'o2', nome: 'Produto de teste A', preco: 9, nota: 80, motivos: [], produto_id: 'p1' },
        { id: 'o3', nome: 'Produto de teste B', preco: 20, nota: null, motivos: [], produto_id: 'p2' },
        { id: 'o4', nome: 'Produto de teste C', preco: 30, nota: 75, motivos: [], produto_id: 'p3' },
      ],
      2,
    );
    expect(a.map((x) => x.id)).toEqual(['o2', 'o4']);
  });

  it('lista usa o preço do banco, ignora item que não veio na entrada e leva o aviso de comissão', () => {
    const t = textoLista({
      titulo: 'Achados de teste',
      abertura: 'Abertura de teste',
      achados: [{ ref: 'o1', nome: 'Produto de teste A', preco: 49.9 }],
      itens: [
        { ref: 'o1', frase: 'Frase de teste' },
        { ref: 'inventado', frase: 'Não deve aparecer' },
      ],
    });
    expect(t).toContain('- Produto de teste A: por R$ 49,90. Frase de teste');
    expect(t).not.toContain('Não deve aparecer');
    expect(t.trim().endsWith(AVISO_COMISSAO)).toBe(true);
  });

  it('roteiro mostra os tempos acumulados', () => {
    const t = textoRoteiro({
      titulo: 'Roteiro de teste',
      cenas: [
        { segundos: 5, mostra: 'Mãos e produto', fala: '' },
        { segundos: 10, mostra: 'Uso', fala: 'Fala de teste' },
      ],
      legenda: '',
    });
    expect(t).toContain('Duração: 15 segundos');
    expect(t).toContain('5s a 15s: Uso\nFala: Fala de teste');
  });

  it('contrato registrado na rotina de redação', () => {
    expect(contrato('redacao-extra/v1')?.rotina).toBe('pa-redacao');
  });

  it('roteiro acima de 30 segundos é recusado pelo contrato', () => {
    const r = redacaoExtra.saida.safeParse({
      tipo: 'roteiro_video',
      titulo: 'Longo demais',
      cenas: [
        { segundos: 20, mostra: 'a', fala: '' },
        { segundos: 15, mostra: 'b', fala: '' },
      ],
      legenda: '',
      alertas: [],
    });
    expect(r.success).toBe(false);
  });

  const ENTRADAS: EntradaRedacaoExtra[] = [
    {
      tipo: 'roteiro_video',
      conteudo_id: '00000000-0000-4000-8000-000000000001',
      versao: 1,
      produto: { ref: 'o1', nome: 'Produto de teste A', preco: 10, motivos: [] },
    },
    {
      tipo: 'lista_data',
      conteudo_id: '00000000-0000-4000-8000-000000000002',
      versao: 1,
      data_pico: { nome: 'Data de teste', data: '2026-11-27' },
      achados: [{ ref: 'o1', nome: 'Produto de teste A', preco: 10, motivos: [] }],
    },
    {
      tipo: 'respostas_semana',
      conteudo_id: '00000000-0000-4000-8000-000000000003',
      versao: 1,
      temas: [{ tema: 'Tema de teste', perguntas: ['Pergunta de teste'] }],
    },
  ];

  it.each(ENTRADAS)('simulado de $tipo é válido, avisa que é simulado e monta', (e) => {
    expect(redacaoExtra.entrada.safeParse(e).success).toBe(true);
    const s = redacaoExtra.simular(e);
    expect(redacaoExtra.saida.safeParse(s).success).toBe(true);
    const m = montarConteudo(e, s);
    expect(m.texto).toMatch(/simulad/i);
    if (e.tipo !== 'roteiro_video') expect(m.texto).toContain(AVISO_COMISSAO);
  });

  it('saída de outro tipo é recusada', () => {
    expect(() => montarConteudo(ENTRADAS[0], redacaoExtra.simular(ENTRADAS[2]))).toThrow();
  });

  it('outra versão: liberada fora do preparo e no preparo travado', () => {
    const agora = new Date('2026-11-02T12:00:00Z');
    expect(podePedirOutraVersao('pronto', '2026-11-02T11:59:00Z', agora)).toBe(true);
    expect(podePedirOutraVersao('em_preparo', '2026-11-02T11:30:00Z', agora)).toBe(false);
    expect(podePedirOutraVersao('em_preparo', '2026-11-02T10:30:00Z', agora)).toBe(true);
  });
});

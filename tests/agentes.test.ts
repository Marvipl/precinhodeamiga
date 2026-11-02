// Repositório dos agentes (Anexo A.5 e A.6): esquemas, montagem, avaliações e scripts de envio.
import { describe, expect, it } from 'vitest';
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { CONTRATOS } from '../supabase/functions/_shared/core/contratos/index.ts';
import { AGENTES, ROTINAS, type IdRotina } from '../supabase/functions/_shared/core/agentes.ts';
import { esquemaDoContrato, slugContrato } from '../scripts/agentes/esquemas.ts';
import { ARQUIVO_DA_ROTINA, MARCADOR, instrucaoDaRotina, montarRepositorio } from '../scripts/agentes/montar.ts';
import { avaliarCaso, checarCriterio, numerosDoTexto, valoresNoCaminho } from '../scripts/agentes/avaliar.ts';
import { lerAvaliacoes, lerFontes, PASTA_AGENTES, RAIZ } from '../scripts/agentes/fontes.ts';
import { validar, validarContra } from '../agentes/scripts/validar.mjs';

const avaliacoes = lerAvaliacoes();

describe('contratos em JSON Schema', () => {
  it('todo contrato registrado tem rotina com arquivo de instrução', () => {
    for (const c of CONTRATOS) {
      expect(ROTINAS[c.rotina], c.id).toBeDefined();
      expect(fs.existsSync(path.join(PASTA_AGENTES, 'agentes', `${ARQUIVO_DA_ROTINA[c.rotina]}.md`)), c.id).toBe(true);
    }
  });

  it('a resposta simulada de cada caso passa no zod e no JSON Schema gerado', () => {
    for (const c of CONTRATOS) {
      const js = esquemaDoContrato(c);
      for (const caso of avaliacoes.find((a) => a.contrato === c.id)?.casos ?? []) {
        expect(validarContra(js as never, caso.entrada, 'entrada'), `${c.id}/${caso.nome} entrada`).toEqual([]);
        const saida = c.simular(caso.entrada);
        expect(c.saida.safeParse(saida).success).toBe(true);
        expect(validarContra(js as never, saida, 'saida'), `${c.id}/${caso.nome} saída`).toEqual([]);
      }
    }
  });

  it('o JSON Schema recusa o que o zod recusa (ping/v1)', () => {
    const ping = CONTRATOS.find((c) => c.id === 'ping/v1')!;
    const js = esquemaDoContrato(ping);
    for (const ruim of [{}, { eco: 3 }, { eco: 'x'.repeat(501) }, null, []]) {
      expect(ping.saida.safeParse(ruim).success).toBe(false);
      expect(validarContra(js as never, ruim, 'saida').length).toBeGreaterThan(0);
    }
  });

  it('slug do contrato vira nome de arquivo', () => {
    expect(slugContrato('curadoria/v1')).toBe('curadoria-v1');
    expect(slugContrato('analista-print/v1')).toBe('analista-print-v1');
  });
});

describe('validador sem dependências', () => {
  const esquema = {
    type: 'object',
    properties: {
      nivel: { type: 'integer', minimum: 1, maximum: 4 },
      tipo: { type: 'string', enum: ['a', 'b'] },
      itens: { type: 'array', maxItems: 2, items: { type: 'string', minLength: 1 } },
      opcional: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      data: { type: 'string', format: 'date' },
    },
    required: ['nivel'],
    additionalProperties: false,
  };
  it('aceita valor válido', () => {
    expect(validar(esquema, { nivel: 2, tipo: 'a', itens: ['x'], opcional: null, data: '2026-11-02' })).toEqual([]);
  });
  it('aponta cada problema com o caminho', () => {
    const erros = validar(esquema, { nivel: 5.5, tipo: 'c', itens: ['', 'y', 'z'], opcional: 3, data: '02/11', extra: true });
    expect(erros.join('\n')).toMatch(/\$\.nivel: esperado integer/);
    expect(erros.join('\n')).toMatch(/\$\.tipo: valor fora/);
    expect(erros.join('\n')).toMatch(/\$\.itens: máximo de 2 itens/);
    expect(erros.join('\n')).toMatch(/\$\.itens\[0\]: mínimo de 1/);
    expect(erros.join('\n')).toMatch(/\$\.opcional: não corresponde/);
    expect(erros.join('\n')).toMatch(/\$\.data: data inválida/);
    expect(erros.join('\n')).toMatch(/\$\.extra: campo não previsto/);
    expect(validar(esquema, {})).toEqual(['$.nivel: obrigatório']);
  });
  it('conta caracteres, não bytes', () => {
    expect(validar({ type: 'string', maxLength: 3 }, 'ção')).toEqual([]);
  });
  it('resolve referências locais', () => {
    const e = { definitions: { s: { type: 'string' } }, type: 'array', items: { $ref: '#/definitions/s' } };
    expect(validar(e, ['a'])).toEqual([]);
    expect(validar(e, [1]).length).toBe(1);
  });
});

describe('montagem do repositório precinho-agentes', () => {
  const repo = montarRepositorio(lerFontes());

  it('tem CLAUDE.md curto com as regras do Anexo A.5', () => {
    const c = repo['CLAUDE.md'];
    expect(c.split('\n').length).toBeLessThan(30);
    expect(c).toMatch(/routine-fire-payload/);
    expect(c).toMatch(/Nunca/);
    expect(c).toMatch(/publique/);
    expect(c).toMatch(/altere, crie ou apague arquivos/);
  });

  it('tem um arquivo de instrução por rotina e para Redatora e Guardiã', () => {
    for (const r of Object.keys(ROTINAS) as IdRotina[]) expect(repo[`agentes/${ARQUIVO_DA_ROTINA[r]}.md`], r).toBeDefined();
    expect(repo['agentes/redatora.md']).toBeDefined();
    expect(repo['agentes/guardia.md']).toBeDefined();
  });

  it('cada instrução tem tom ou critérios, a seção "Nunca" e exemplos fictícios', () => {
    for (const [p, txt] of Object.entries(repo).filter(([p]) => p.startsWith('agentes/'))) {
      expect(txt, p).toMatch(/## Nunca/);
      expect(txt, p).toMatch(/[Ee]xemplo/);
      expect(txt, p).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('o "Nunca" de cada agente de IA repete o da seção 5.17', () => {
    const porArquivo: Record<string, string> = { cacadora: 'cacadora', redatora: 'redatora', guardia: 'guardia', analista: 'analista', coach: 'coach', radar: 'radar', atendente: 'atendente' };
    for (const a of AGENTES.filter((x) => x.id in porArquivo)) {
      const txt = repo[`agentes/${porArquivo[a.id]}.md`];
      const nunca = a.nunca.replace(/^Finge ser você/, 'Finge ser a Lana').replace('Passa do tempo que você informou', 'Passa do tempo que a Lana informou').replace('fora dos seus canais', 'fora dos canais da Lana');
      expect(txt, a.id).toContain(nunca);
    }
  });

  it('tem esquema e exemplo de cada contrato, índice e rotinas com a instrução fixa', () => {
    for (const c of CONTRATOS) {
      const js = JSON.parse(repo[`contratos/${slugContrato(c.id)}.schema.json`]);
      expect(js.contrato).toBe(c.id);
      expect(js.saida).toBeDefined();
      expect(repo['contratos/INDICE.md']).toContain(`\`${c.id}\``);
    }
    expect(JSON.parse(repo['contratos/ping-v1.exemplo.json']).saida.eco).toBe(JSON.parse(repo['contratos/ping-v1.exemplo.json']).entrada.mensagem);
    for (const r of Object.keys(ROTINAS) as IdRotina[]) expect(repo['ROTINAS.md']).toContain(instrucaoDaRotina(r));
    expect(instrucaoDaRotina('pa-curadoria')).toBe('Execute o trabalho do bloco `<routine-fire-payload>` seguindo `agentes/cacadora.md`.');
  });

  it('não leva as avaliações nem arquivos de tipo para os agentes', () => {
    expect(Object.keys(repo).some((p) => p.startsWith('avaliacoes/'))).toBe(false);
    expect(Object.keys(repo).some((p) => p.endsWith('.d.mts'))).toBe(false);
    expect(repo[MARCADOR]).toBeDefined();
  });

  it('nenhum arquivo traz endereço de envio ao WhatsApp nem segredo', () => {
    for (const [p, txt] of Object.entries(repo)) {
      expect(txt, p).not.toMatch(/api\.whatsapp|graph\.facebook|wa\.me/i);
      expect(txt, p).not.toMatch(/sk-ant-|service_role_key\s*=/i);
    }
  });
});

describe('avaliações', () => {
  it('casos usam só dados fictícios e contratos com nome válido', () => {
    for (const a of avaliacoes) {
      expect(a.contrato).toMatch(/^[a-z0-9-]+\/v\d+$/);
      expect(a.casos.length).toBeGreaterThan(0);
      expect(new Set(a.casos.map((c) => c.nome)).size).toBe(a.casos.length);
    }
  });

  it('todos os casos passam com as respostas simuladas', () => {
    for (const a of avaliacoes) {
      const c = CONTRATOS.find((x) => x.id === a.contrato);
      if (!c) continue; // contrato de outro pacote ainda não registrado
      for (const caso of a.casos) expect(avaliarCaso(c, caso, c.simular(caso.entrada)).falhas, `${a.contrato}/${caso.nome}`).toEqual([]);
    }
  });

  it('caminhos com listas', () => {
    const v = { ofertas: [{ frase: 'a' }, { frase: 'b' }], resumo: 'x' };
    expect(valoresNoCaminho(v, 'ofertas[].frase')).toEqual(['a', 'b']);
    expect(valoresNoCaminho(v, 'resumo')).toEqual(['x']);
    expect(valoresNoCaminho(v, 'nada[].x')).toEqual([]);
  });

  it('critérios: tamanho, aviso de comissão, promessa, emoji e itens', () => {
    const s = { ofertas: [{ frase: 'Produto de teste A, o menor preço do Brasil' }, { frase: 'Boa escolha' }], post: 'Por R$ 10 | Link com comissão' };
    expect(checarCriterio({ tipo: 'tamanhoMax', campo: 'ofertas[].frase', max: 20 }, {}, s)).toHaveLength(1);
    expect(checarCriterio({ tipo: 'contem', campo: 'post', texto: 'Link com comissão' }, {}, s)).toEqual([]);
    expect(checarCriterio({ tipo: 'contem', campo: 'ausente', texto: 'Link com comissão' }, {}, s)).toEqual(['ausente ausente']);
    expect(checarCriterio({ tipo: 'semPromessa', campo: 'ofertas[].frase' }, {}, s)).toEqual(['ofertas[].frase tem promessa "menor preço"']);
    expect(checarCriterio({ tipo: 'semPromessa', campo: 'post' }, {}, { post: 'Está correto e garante espaço' })).toEqual([]);
    expect(checarCriterio({ tipo: 'semEmoji', campo: 'post' }, {}, { post: 'Oi 🎉' })).toHaveLength(1);
    expect(checarCriterio({ tipo: 'maxItens', campo: 'ofertas', max: 1 }, {}, s)).toHaveLength(1);
    expect(checarCriterio({ tipo: 'minItens', campo: 'ofertas', min: 3 }, {}, s)).toHaveLength(1);
  });

  it('critério de número inventado (seção 5.17: resumo da Analista)', () => {
    expect(numerosDoTexto('De R$ 1.234,56 por 99, 22% e 3.5')).toEqual(['1234.56', '99', '22', '3.5']);
    const entrada = { cliques: 120, anterior: 95, nota: 'comissão de R$ 7,37' };
    const ok = { resumo: 'Os cliques subiram de 95 para 120. Comissão de R$ 7,37.' };
    const ruim = { resumo: 'Os cliques subiram 26%.' };
    expect(checarCriterio({ tipo: 'semNumeroInventado', campo: 'resumo' }, entrada, ok)).toEqual([]);
    expect(checarCriterio({ tipo: 'semNumeroInventado', campo: 'resumo' }, entrada, ruim)).toEqual(['resumo tem número que não está na entrada: 26']);
  });

  it('saída fora do contrato falha antes dos critérios', () => {
    const ping = CONTRATOS.find((c) => c.id === 'ping/v1')!;
    const r = avaliarCaso(ping, { nome: 't', entrada: { mensagem: 'a' }, criterios: [] }, { eco: 1 });
    expect(r.falhas[0]).toMatch(/saída fora do contrato/);
  });
});

describe('scripts do repositório gerado', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'precinho-agentes-'));
  const destino = path.join(tmp, 'repo');
  const gerar = spawnSync(process.execPath, [path.join(RAIZ, 'scripts/gerar-agentes.ts'), destino], { encoding: 'utf8' });

  it('gera a pasta e se recusa a apagar pasta alheia', () => {
    expect(gerar.status, gerar.stderr).toBe(0);
    expect(fs.existsSync(path.join(destino, 'contratos/ping-v1.schema.json'))).toBe(true);
    const alheia = path.join(tmp, 'alheia');
    fs.mkdirSync(alheia);
    fs.writeFileSync(path.join(alheia, 'importante.txt'), 'x');
    const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts/gerar-agentes.ts'), alheia], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(fs.existsSync(path.join(alheia, 'importante.txt'))).toBe(true);
    // gerar de novo por cima preserva .git
    fs.mkdirSync(path.join(destino, '.git'), { recursive: true });
    fs.writeFileSync(path.join(destino, '.git', 'HEAD'), 'ref');
    expect(spawnSync(process.execPath, [path.join(RAIZ, 'scripts/gerar-agentes.ts'), destino]).status).toBe(0);
    expect(fs.existsSync(path.join(destino, '.git', 'HEAD'))).toBe(true);
  });

  function servidor(status: number) {
    const recebidos: { auth?: string; corpo: unknown }[] = [];
    const srv = http.createServer((req, res) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        recebidos.push({ auth: req.headers.authorization, corpo: JSON.parse(b) });
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(status === 200 ? { ok: true } : { erro: 'nonce inválido' }));
      });
    });
    return new Promise<{ url: string; recebidos: typeof recebidos; fechar: () => void }>((ok) =>
      srv.listen(0, '127.0.0.1', () => {
        const porta = (srv.address() as { port: number }).port;
        ok({ url: `http://127.0.0.1:${porta}/functions/v1/agente-resultado`, recebidos, fechar: () => srv.close() });
      }),
    );
  }

  function rodar(args: string[], env: Record<string, string> = {}) {
    return new Promise<{ status: number | null; out: string; err: string }>((ok) => {
      const p = spawn(process.execPath, [path.join(destino, 'scripts/enviar-resultado.mjs'), ...args], { env: { ...process.env, AGENT_CALLBACK_TOKEN: '', ...env } });
      let out = '';
      let err = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (err += d));
      p.on('close', (status) => ok({ status, out, err }));
    });
  }

  function arquivos(retorno: string, saida: unknown) {
    const payload = path.join(tmp, `payload-${Math.random()}.json`);
    const s = path.join(tmp, `saida-${Math.random()}.json`);
    fs.writeFileSync(payload, JSON.stringify({ contrato: 'ping/v1', job_id: '00000000-0000-4000-8000-000000000001', nonce: 'nonce-ficticio', retorno, entrada: { mensagem: 'oi' } }));
    fs.writeFileSync(s, JSON.stringify(saida));
    return [payload, s];
  }

  it('envia saída válida com job_id, nonce e token', async () => {
    const srv = await servidor(200);
    const r = await rodar(arquivos(srv.url, { eco: 'oi' }), { AGENT_CALLBACK_TOKEN: 'token-de-teste' });
    srv.fechar();
    expect(r.status, r.err).toBe(0);
    expect(srv.recebidos).toEqual([{ auth: 'Bearer token-de-teste', corpo: { job_id: '00000000-0000-4000-8000-000000000001', nonce: 'nonce-ficticio', saida: { eco: 'oi' } } }]);
  });

  it('não envia saída fora do contrato', async () => {
    const srv = await servidor(200);
    const r = await rodar(arquivos(srv.url, { eco: 5 }));
    srv.fechar();
    expect(r.status).toBe(1);
    expect(r.err).toMatch(/fora do contrato ping\/v1/);
    expect(srv.recebidos).toHaveLength(0);
  });

  it('--so-validar não envia nada', async () => {
    const srv = await servidor(200);
    const r = await rodar([...arquivos(srv.url, { eco: 'oi' }), '--so-validar']);
    srv.fechar();
    expect(r.status).toBe(0);
    expect(srv.recebidos).toHaveLength(0);
  });

  it('erro 4xx é definitivo e não repete', async () => {
    const srv = await servidor(403);
    const r = await rodar(arquivos(srv.url, { eco: 'oi' }));
    srv.fechar();
    expect(r.status).toBe(1);
    expect(r.err).toMatch(/recusado \(403\)/);
    expect(srv.recebidos).toHaveLength(1);
  });

  it('recusa endpoint sem https fora da máquina local', async () => {
    const r = await rodar(arquivos('http://exemplo.invalid/retorno', { eco: 'oi' }));
    expect(r.status).toBe(1);
    expect(r.err).toMatch(/https/);
  });
});

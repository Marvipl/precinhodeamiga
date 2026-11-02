// Validador de JSON Schema (subconjunto gerado por zod-to-json-schema), sem dependências.
// Uso como módulo: validar(esquema, valor) -> lista de erros (vazia = válido).
// Uso na linha de comando: node scripts/validar.mjs <esquema.json> <valor.json> [entrada|saida]

function tipoDe(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function confereTipo(t, v) {
  const real = tipoDe(v);
  if (t === 'number') return real === 'number' || real === 'integer';
  return real === t;
}

function resolver(raiz, esquema) {
  let e = esquema;
  const vistos = new Set();
  while (e && typeof e.$ref === 'string') {
    if (vistos.has(e.$ref)) throw new Error(`referência circular: ${e.$ref}`);
    vistos.add(e.$ref);
    if (!e.$ref.startsWith('#')) throw new Error(`referência externa não suportada: ${e.$ref}`);
    const partes = e.$ref.slice(1).split('/').filter(Boolean).map((p) => decodeURIComponent(p.replace(/~1/g, '/').replace(/~0/g, '~')));
    e = partes.reduce((acc, p) => (acc == null ? undefined : acc[p]), raiz);
    if (e === undefined) throw new Error(`referência não encontrada: ${esquema.$ref}`);
  }
  return e;
}

function igual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validarNo(raiz, esquemaBruto, v, caminho, erros) {
  if (esquemaBruto === true || esquemaBruto === undefined) return;
  if (esquemaBruto === false) {
    erros.push(`${caminho}: não permitido`);
    return;
  }
  const e = resolver(raiz, esquemaBruto);

  if (e.anyOf || e.oneOf) {
    const opcoes = e.anyOf ?? e.oneOf;
    const ok = opcoes.some((op) => {
      const sub = [];
      validarNo(raiz, op, v, caminho, sub);
      return sub.length === 0;
    });
    if (!ok) erros.push(`${caminho}: não corresponde a nenhuma das opções`);
  }
  if (e.allOf) for (const op of e.allOf) validarNo(raiz, op, v, caminho, erros);
  if (e.not) {
    const sub = [];
    validarNo(raiz, e.not, v, caminho, sub);
    if (sub.length === 0) erros.push(`${caminho}: valor não permitido`);
  }

  if (e.type !== undefined) {
    const tipos = Array.isArray(e.type) ? e.type : [e.type];
    if (!tipos.some((t) => confereTipo(t, v))) {
      erros.push(`${caminho}: esperado ${tipos.join(' ou ')}, veio ${tipoDe(v)}`);
      return;
    }
  }
  if ('const' in e && !igual(e.const, v)) erros.push(`${caminho}: esperado ${JSON.stringify(e.const)}`);
  if (e.enum && !e.enum.some((x) => igual(x, v))) erros.push(`${caminho}: valor fora de ${JSON.stringify(e.enum)}`);

  if (typeof v === 'string') {
    const n = [...v].length;
    if (e.minLength !== undefined && n < e.minLength) erros.push(`${caminho}: mínimo de ${e.minLength} caracteres`);
    if (e.maxLength !== undefined && n > e.maxLength) erros.push(`${caminho}: máximo de ${e.maxLength} caracteres (tem ${n})`);
    if (e.pattern !== undefined && !new RegExp(e.pattern, 'u').test(v)) erros.push(`${caminho}: fora do padrão ${e.pattern}`);
    if (e.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) erros.push(`${caminho}: uuid inválido`);
    if (e.format === 'uri' || e.format === 'url') {
      try {
        new URL(v);
      } catch {
        erros.push(`${caminho}: URL inválida`);
      }
    }
    if (e.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) erros.push(`${caminho}: data inválida (AAAA-MM-DD)`);
    if (e.format === 'date-time' && Number.isNaN(Date.parse(v))) erros.push(`${caminho}: data e hora inválidas`);
  }

  if (typeof v === 'number') {
    if (e.minimum !== undefined && v < e.minimum) erros.push(`${caminho}: mínimo ${e.minimum}`);
    if (e.maximum !== undefined && v > e.maximum) erros.push(`${caminho}: máximo ${e.maximum}`);
    if (e.exclusiveMinimum !== undefined && typeof e.exclusiveMinimum === 'number' && v <= e.exclusiveMinimum) erros.push(`${caminho}: precisa ser maior que ${e.exclusiveMinimum}`);
    if (e.exclusiveMaximum !== undefined && typeof e.exclusiveMaximum === 'number' && v >= e.exclusiveMaximum) erros.push(`${caminho}: precisa ser menor que ${e.exclusiveMaximum}`);
    if (e.multipleOf !== undefined && Math.abs(v / e.multipleOf - Math.round(v / e.multipleOf)) > 1e-9) erros.push(`${caminho}: precisa ser múltiplo de ${e.multipleOf}`);
  }

  if (Array.isArray(v)) {
    if (e.minItems !== undefined && v.length < e.minItems) erros.push(`${caminho}: mínimo de ${e.minItems} itens`);
    if (e.maxItems !== undefined && v.length > e.maxItems) erros.push(`${caminho}: máximo de ${e.maxItems} itens (tem ${v.length})`);
    if (Array.isArray(e.items)) {
      e.items.forEach((sub, i) => i < v.length && validarNo(raiz, sub, v[i], `${caminho}[${i}]`, erros));
      if (e.additionalItems === false && v.length > e.items.length) erros.push(`${caminho}: itens demais`);
    } else if (e.items !== undefined) {
      v.forEach((x, i) => validarNo(raiz, e.items, x, `${caminho}[${i}]`, erros));
    }
  }

  if (tipoDe(v) === 'object') {
    const props = e.properties ?? {};
    for (const k of e.required ?? []) if (!(k in v)) erros.push(`${caminho}.${k}: obrigatório`);
    for (const [k, x] of Object.entries(v)) {
      if (k in props) validarNo(raiz, props[k], x, `${caminho}.${k}`, erros);
      else if (e.additionalProperties === false) erros.push(`${caminho}.${k}: campo não previsto no contrato`);
      else if (e.additionalProperties && typeof e.additionalProperties === 'object') validarNo(raiz, e.additionalProperties, x, `${caminho}.${k}`, erros);
    }
  }
}

/** Valida `valor` contra `esquema`. Devolve a lista de erros (vazia = válido). */
export function validar(esquema, valor) {
  const erros = [];
  validarNo(esquema, esquema, valor, '$', erros);
  return erros;
}

/** Valida a saída (ou a entrada) contra o arquivo de contrato gerado (com `saida` e `entrada`). */
export function validarContra(contratoJson, valor, parte = 'saida') {
  const esquema = contratoJson[parte];
  if (!esquema) return [`contrato sem a parte "${parte}"`];
  return validar(esquema, valor);
}

const ehCli = typeof process !== 'undefined' && process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (ehCli) {
  const fs = await import('node:fs');
  const [arqEsquema, arqValor, parte = 'saida'] = process.argv.slice(2);
  if (!arqEsquema || !arqValor) {
    console.error('uso: node scripts/validar.mjs <contrato.schema.json> <valor.json> [entrada|saida]');
    process.exit(2);
  }
  const esquema = JSON.parse(fs.readFileSync(arqEsquema, 'utf8'));
  const valor = JSON.parse(fs.readFileSync(arqValor, 'utf8'));
  const erros = esquema[parte] ? validarContra(esquema, valor, parte) : validar(esquema, valor);
  if (erros.length) {
    console.error(`Inválido:\n- ${erros.join('\n- ')}`);
    process.exit(1);
  }
  console.log('Válido.');
}

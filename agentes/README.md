# precinho-agentes

Repositório usado pelas rotinas do Claude Code da Precinho de Amiga (Anexo A.5 do documento de produto).
Gerado a partir da pasta `agentes/` do repositório `precinhodeamiga` com `npm run agentes:gerar`. Não edite aqui: edite lá e gere de novo.

## Conteúdo

| Caminho | O que é |
|---|---|
| `CLAUDE.md` | Regras gerais de todo agente |
| `agentes/<nome>.md` | Instrução de cada agente: tom, critérios, o que nunca fazer, exemplos fictícios |
| `contratos/<contrato>.schema.json` | JSON Schema da entrada e da saída, igual ao que o endpoint de retorno valida |
| `contratos/<contrato>.exemplo.json` | Entrada fictícia e saída no formato certo |
| `contratos/INDICE.md` | Contrato, rotina e arquivo do agente |
| `ROTINAS.md` | Instrução fixa de cada rotina, para colar em claude.ai/code/routines |
| `scripts/enviar-resultado.mjs` | Valida a saída contra o contrato e envia ao endpoint de retorno |
| `scripts/ler-entrada.mjs` | Busca a entrada quando o payload veio sem ela |
| `scripts/validar.mjs` | Validador de JSON Schema sem dependências |

## Passo a passo dentro de uma rotina

```bash
# 1. Salve o JSON do bloco <routine-fire-payload> em /tmp/payload.json
# 2. Se o payload tiver "leitura" e não tiver "entrada":
node scripts/ler-entrada.mjs /tmp/payload.json > /tmp/entrada.json
# 3. Faça o trabalho e escreva só o objeto da saída em /tmp/saida.json
# 4. Valide sem enviar (opcional) e envie:
node scripts/enviar-resultado.mjs /tmp/payload.json /tmp/saida.json --so-validar
node scripts/enviar-resultado.mjs /tmp/payload.json /tmp/saida.json
```

O envio só acontece se a saída passar no contrato, porque uma saída fora do contrato marca o trabalho como erro e não tem segunda chance.

## Token

O endpoint exige o `AGENT_CALLBACK_TOKEN`. Ele chega pelo segredo de rede do ambiente de nuvem. Se o ambiente expuser o valor como variável `AGENT_CALLBACK_TOKEN`, o script manda o cabeçalho `Authorization: Bearer`; se o segredo de rede injetar o cabeçalho sozinho, o script envia sem ele. Nunca escreva o token em arquivo.

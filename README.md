# Precinho de Amiga

Painel web (PWA, celular primeiro) em que oito agentes de IA fazem o trabalho repetitivo da operação de afiliada da Lana, e ela só aprova, envia e segue um roteiro curto.
Fonte da verdade: [`docs/entrada/DOCUMENTO-DE-PRODUTO.md`](docs/entrada/DOCUMENTO-DE-PRODUTO.md). Protótipo: `docs/entrada/mock/precinho-de-amiga.html`.

## Rodar

```bash
npm install
npm run dev        # painel em http://localhost:5173 (modo local sem Supabase: sem login, estados vazios)
npm run check      # typecheck + testes (inclui migrações no PGlite) + deno check das funções + build
```

Com Supabase: copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

## Estrutura

| Pasta | O que é |
|---|---|
| `src/` | Painel (React). `src/pages/<tela>/index.tsx` = uma tela; `src/app/rotas.tsx` = abas; `src/lib/` = Supabase, login, dados, configuração |
| `src/styles/global.css` | CSS do mock (mesmas classes: `.card`, `.offer`, `.post`, `.pill-*`, ...) |
| `supabase/migrations/` | Banco (Postgres + RLS em todas as tabelas) |
| `supabase/functions/<nome>/index.ts` | Edge Functions (Deno), finas: só ligam HTTP e ambiente ao código compartilhado |
| `supabase/functions/_shared/core/` | Regras de negócio puras (sem I/O), usadas pelo painel (`@core/...`) e pelas funções. Testadas com Vitest |
| `supabase/functions/_shared/jobs/` | Orquestração dos agentes (F-13): fila, disparo, modo simulado, retorno |
| `supabase/functions/_shared/processadores/` | Gravam no banco a saída validada de cada contrato de agente |
| `tests/` | Testes de integração (migrações no PGlite) |
| `docs/decisions.md` | Decisões e suposições |
| `docs/HUMANO.md` | O que depende do dono (contas, chaves, domínio) |
| `docs/pacotes.md` | Divisão do trabalho em pacotes paralelos |

## Agentes (F-13)

Toda IA roda em rotinas do Claude Code disparadas por API. Uma função cria um job (`criarJob`) com `chave_unica`; o pg_cron chama `agente-disparar` a cada minuto; no modo `simulado` (padrão) a resposta pré-gravada do contrato é processada na hora, sem chamar a API. No modo `real` a rotina devolve o resultado em `agente-resultado` com `job_id` + `nonce`. Ver Anexo A.4 do documento.

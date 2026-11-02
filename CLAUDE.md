# Regras para quem desenvolve neste repositório

- Fonte da verdade: `docs/entrada/DOCUMENTO-DE-PRODUTO.md`. Quando o mock divergir, o documento vence.
- Nunca invente dado real. Nada entre colchetes do mock vira fixture com cara de real. Telas sem dado mostram estado vazio em palavras ("aguardando dados").
- Fixtures e respostas simuladas usam só dados claramente fictícios (ex.: "Produto de teste A").
- Regras da seção 5 ficam em código puro em `supabase/functions/_shared/core/`, com testes. A IA escolhe e escreve; o código decide limite, cálculo e permissão.
- Regras invioláveis (seção 5.1): nenhum caminho de código envia mensagem ao WhatsApp; todo post tem "Link com comissão"; "ver na Shopee" usa o link comum; nada público sem aprovação da Lana.
- Interface em português do Brasil, sem emojis, alvos de toque de 44 px, classes do mock (`src/styles/global.css`).
- Antes de abrir PR: `npm run check` precisa passar.
- Migrações novas: arquivo novo em `supabase/migrations/` com prefixo de data e hora único (`AAAAMMDDHHMMSS_nome.sql`). Nunca edite migração já mesclada. RLS em toda tabela nova.
- Edge Function nova: pasta em `supabase/functions/<nome>/index.ts` fina; lógica em `_shared/`. Se ela não usa login do Supabase, acrescente o bloco em `supabase/config.toml` com `verify_jwt = false` e valide o próprio token.
- Contrato de agente novo: `core/contratos/<nome>.ts` + uma linha em `core/contratos/index.ts`; processador em `_shared/processadores/<nome>.ts` + uma linha em `processadores/index.ts`.
- Itens que dependem do dono vão para `docs/HUMANO.md` (seção "Itens acrescentados pelos pacotes"). Suposições novas vão para `docs/decisions.md`.

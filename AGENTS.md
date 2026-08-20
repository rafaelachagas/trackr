<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Vendas / Gasto / ROAS

Antes de tocar em `vendas`, `gastos`, o webhook da Hotmart, a sync da Meta, ou o join do performance-v2, leia [docs/VENDAS-ATRIBUICAO-ROAS.md](docs/VENDAS-ATRIBUICAO-ROAS.md). Regra de ouro: código de gasto (Meta) nunca escreve em `vendas`; código de venda (Hotmart) nunca escreve em `gastos`. Eles só se encontram na leitura, pela chave de `lib/meta-chave.ts`.
<!-- END:nextjs-agent-rules -->

# HelpDesk — Frontend (`apps/frontend`)

**Estado:** pasta reservada. Nenhuma aplicação foi criada ainda; não há código executável nem dependências instaladas.

## Objetivo
Interface web responsiva (mobile first) do HelpDesk, com rotas e layouts por papel (Solicitante, Técnico e Admin), consumindo exclusivamente a API própria.

## Stack prevista
React + Vite + TypeScript + Tailwind CSS. ECharts e GSAP somente quando houver telas funcionais (M8). Versões serão fixadas na decisão ADR-10 / HD-008.

## Organização prevista
Conforme `docs/04-arquitetura.md`: `src/app`, `src/assets`, `src/components`, `src/features`, `src/hooks`, `src/layouts`, `src/lib`, `src/routes`, `src/styles` e `tests/`.

## Próximos passos
- **HD-010** — inicializar React/Vite/TypeScript/Tailwind nesta pasta (mediante aprovação). Atenção: o gerador do Vite pode recusar uma pasta não vazia; este README deve ser preservado ou mesclado.
- **HD-014** — lint, formatação e testes do frontend.

Referências: `docs/04-arquitetura.md`, `docs/07-telas-e-design.md`, `docs/15-m1-plano-de-execucao.md`.

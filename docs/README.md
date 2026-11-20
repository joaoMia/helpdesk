# HelpDesk documentation

This index separates current operating references from architecture, guides, and delivery history. Numbered filenames are intentionally kept at their existing paths: agent instructions, Skills, and cross-document links refer to them directly.

## Current contracts and operation

- [Functional contract](v1-contrato.md) — current product scope and consolidated behavior.
- [Project workflow](37-workflow-projetos.md) — current project lifecycle, permissions, plan versions, progress, history, and conversation.
- [Project forms](38-formularios-reais-projetos.md) — project categories and versioned request forms.
- [Private project attachments](39-anexos-privados-projetos.md) — attachment ownership and access.
- [Local operation and recovery](v1-operacao-local.md) — local setup, test isolation, backups, and restoration constraints.
- [Development provisioning](22-provisionamento-desenvolvimento.md) — safe creation and recovery of local development accounts.
- [Conventional commits](40-conventional-commits.md) — commit format when commits are authorized.

## Requirements and architecture

- [Vision and scope](01-visao-e-escopo.md), [requirements and permissions](02-requisitos-e-permissoes.md), and [business rules](03-regras-de-negocio.md).
- [Architecture](04-arquitetura.md), [data model](05-modelagem-de-dados.md), and [API contracts](06-contratos-api.md).
- [Screens and design](07-telas-e-design.md), [dashboards](08-dashboards.md), [working time and pending periods](09-tempos-pendencias.md), and [security and tests](10-seguranca-e-testes.md).
- [Architecture area and diagrams](architecture/README.md), including [system architecture](architecture/diagramas/arquitetura.mmd), [ticket flow](architecture/diagramas/fluxo-chamado.mmd), [ticket states](architecture/diagramas/estados-chamado.mmd), and [conceptual data model](architecture/diagramas/dados-conceituais.mmd).

## Guides and historical records

- [Guides index](guides/README.md) and [history index](history/README.md).
- [Screenshots area](screenshots/README.md) records the policy for adding genuine captures.

## Documentation conventions

The current contract and current module workflow take precedence over historical delivery notes. Historical documents retain their IDs, dates, and links so that decisions and implementation history remain traceable. The diagrams have a dedicated `architecture/` area. Numbered documents and `planning/backlog.csv` retain their canonical paths because agent instructions and cross-document links depend on them; the guides and history indexes classify them without duplicating or moving their contents.

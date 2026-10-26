# HelpDesk — Contratos compartilhados (`packages/contracts`)

**Estado DEV-001:** workspace ESM com Zod 4, enums e tipos derivados para a base interna em revisão. Não libera endpoints nem conclui a HD-006.

## Objetivo

Concentrar contratos compartilhados entre frontend e backend: esquemas Zod, tipos TypeScript derivados e enums públicos (status, prioridades, papéis), evitando divergência entre cliente e API.

## Consumo e validação

`npm run build --workspace @helpdesk/contracts` gera JavaScript/declarações em dist/, ignorado. Backend consome @helpdesk/contracts; seus scripts de preparação compilam este pacote. Não importar fontes por caminhos exclusivos do Windows. Sem dependência de Prisma ou mocks.

Inclui os três papéis, quatro estados, prioridades, definições tipadas de campos, entrada estrita de um serviço e snapshot da saída. Testes ficam no backend. Payload não aceita estado, prioridade, atribuição, solicitante ou snapshot do cliente.

## Limites

Campos/versionamento continuam em revisão. Anexos/condições da prévia não são funcionalidades persistidas. OpenAPI e autenticação dependem das decisões próprias; nenhuma rota de escrita foi exposta. RN-006 substituída na DEV-001: não há campos de preço/cobrança; snapshots preservam nomes, categoria e formulário.

Referências: `docs/04-arquitetura.md`, `docs/06-contratos-api.md`.

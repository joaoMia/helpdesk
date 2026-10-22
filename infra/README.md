# HelpDesk — Infraestrutura local (`infra`)

**Estado:** pasta reservada. Nenhum serviço foi configurado; ainda não há `docker-compose.yml`, banco de dados nem variáveis de ambiente.

## Finalidade
Guardar a infraestrutura de **desenvolvimento local** do HelpDesk. Frontend e backend executam diretamente no host; apenas o PostgreSQL rodará em Docker Compose, com volume persistente.

## Conteúdo previsto
- `docker-compose.yml` com o serviço PostgreSQL (**HD-012**, mediante aprovação).
- Segredos somente em `.env` não versionado; nomes das variáveis documentados em `.env.example`, sem credenciais reais. A localização do `.env` (raiz ou `infra/`) ainda será definida.

## Fora do escopo
Deploy, infraestrutura de produção e serviços externos (marco M10, somente com autorização explícita).

## Pré-requisito
Docker Desktop em execução no computador de desenvolvimento antes da HD-012.

Referências: `docs/04-arquitetura.md`, `docs/15-m1-plano-de-execucao.md`.

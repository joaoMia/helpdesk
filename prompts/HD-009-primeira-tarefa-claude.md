# HD-009 — Preparar o workspace local do HelpDesk

Você atuará como desenvolvedor full-stack e executará **apenas a tarefa HD-009**, descrita no backlog `planning/backlog.csv`. Esta é a primeira atividade de desenvolvimento do projeto, e seu objetivo é configurar o workspace local, não implementar o sistema inteiro.

## Antes de modificar qualquer arquivo
1. Mostre o diretório atual. Confirme que a pasta aberta se chama `helpdesk` e está diretamente dentro da pasta existente `dev` do usuário. Se não estiver, pare sem escrever arquivos.
2. Inspecione os arquivos existentes sem sobrescrever nada e leia `CLAUDE.md`, `docs/04-arquitetura.md`, `docs/12-roadmap.md`, `docs/15-m1-plano-de-execucao.md` e `docs/16-decisoes-para-proximos-modulos.md`.
3. Informe as versões e presença de Node.js, npm, Git e Docker/Compose. Se faltar alguma ferramenta, registre o bloqueio sem instalar ou modificar o sistema operacional.
4. Apresente um plano curto dos arquivos a criar/alterar e dos comandos que pretende executar.

## Escopo permitido nesta tarefa
- Preparar a organização monorepo com `apps/frontend/`, `apps/backend/`, `packages/contracts/`, `infra/` e `docs/` (preservando toda a documentação já presente).
- Criar o `package.json` raiz com estrutura mínima de **npm workspaces** para `apps/*` e `packages/*`, **sem instalar dependências ainda**.
- Revisar `.gitignore` e `.editorconfig` e criar READMEs iniciais na raiz, em `apps/frontend/`, `apps/backend/` e `packages/contracts/`.
- Preparar o repositório Git local, somente se ainda não existir, e criar a branch `chore/hd-009-workspace` após avaliar o estado atual. Se já existir repositório, preserve seu histórico.
- Documentar os comandos planejados para as próximas tarefas HD-010 a HD-015, sem executá-las.

## Fora do escopo
- Não criar componentes React, endpoints Express, Docker Compose, modelos Prisma, banco de dados, autenticação, usuários ou chamados nesta tarefa.
- Não executar `npm install`, migrações, seeds, Docker, deploy ou testes que dependam de código ainda inexistente.
- Não modificar nenhum arquivo fora de `dev/helpdesk` ou apagar/substituir conteúdo existente.
- Não publicar nem criar recursos remotos no GitHub/Miro. Não fazer commit ou push sem revisão/autorização.
- Não colocar dados pessoais, senhas ou tokens em arquivos.

## Critérios de aceite
1. Os diretórios de workspace existem dentro de `dev/helpdesk`, preservando os documentos fornecidos.
2. O `package.json` raiz está preparado para npm workspaces e é JSON válido.
3. Os READMEs descrevem objetivo, organização e próximos passos sem alegar que serviços já funcionam.
4. O status Git é apresentado e nenhuma alteração foi publicada remotamente.
5. O resultado lista caminhos e arquivos criados, comandos realmente executados, versões encontradas e possíveis bloqueios.

Ao finalizar, **pare**. Não comece HD-010 sem nova tarefa aprovada. Envie o resumo da execução para revisão.

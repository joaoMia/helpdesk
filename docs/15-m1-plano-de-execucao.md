# 15 — Plano de execução M1: Fundação do HelpDesk

**Estado:** liberado para preparar a fundação local; features de negócio permanecem bloqueadas até as decisões correspondentes.

## Pré-condições
- Diretório correto `<PASTA_DEV_EXISTENTE>/helpdesk` confirmado; sem apagar arquivos pré-existentes.
- Acesso a terminal local, editor e Claude Code configurado pelo usuário.
- Diagnóstico de Node.js, npm, Git, Docker Engine/Compose; se algo faltar, parar a ação dependente e orientar instalação, sem mudar o SO unilateralmente.

## Decisões técnicas provisórias deste marco
- Monorepositório com `apps/frontend`, `apps/backend`, `packages/contracts`, `docs`, `infra`.
- **npm workspaces** para evitar ferramentas extras no primeiro bootstrap.
- Frontend executado no host por Vite. Backend Express no host; PostgreSQL em Docker Compose com volume persistente.
- Prisma será instalado em uma versão estável compatível com a versão Node LTS escolhida e fixada; verificar a documentação vigente antes de escolher. Não inventar migrations de domínio.
- Layout e dados de negócio não são implementados no M1.

## Sequência de tarefas independentes dentro de M1
A primeira execução é **somente HD-009 (workspace Git e READMEs)**; o prompt em `prompts/HD-009-primeira-tarefa-claude.md` proíbe a criação de aplicação nesta tarefa. A sequência abaixo representa o marco inteiro, distribuído pelas tarefas HD-009 a HD-015, e **não** deve ser realizada toda de uma vez.

1. Confirmar diretório de trabalho correto e auditar arquivos existentes.
2. Identificar versões de Node/npm/Git/Docker e eventuais conflitos de portas. Se faltar componente, reportar e solicitar ação do usuário.
3. Criar `package.json` raiz com npm workspaces, scripts previsíveis (dev, build, lint, test, typecheck, se aplicáveis) e lockfile.
4. Criar React/Vite/TypeScript em `apps/frontend` e Express/TypeScript em `apps/backend` com GET `/health` que retorne JSON de integridade do processo. Sem autenticação, ORM models nem dados pessoais neste marco.
5. Preparar PostgreSQL no `infra/docker-compose.yml`, com segredos por `.env` não versionado e `.env.example` com nomes de variáveis, sem credenciais reais.
6. Configurar Prisma/cliente para conexão de desenvolvimento (sem entidades de negócio nem migrations inventadas), caso a infraestrutura permita.
7. Configurar Jest + Supertest com teste do endpoint `/health`; frontend com lint e typecheck básicos.
8. Criar `README.md` atualizado na raiz e em cada aplicação, incluindo comandos de execução local e solução de problemas.
9. Não iniciar módulos de login, cadastro, triagem, pendência, métricas, dashboards ou uploads.

## Critérios de aceite do marco M1 completo (não apenas HD-009)
- `git status` mostra apenas arquivos deste projeto; sem segredos.
- Frontend abre localmente e exibe uma página neutra de placeholder técnico, sem apresentar dados simulados como reais.
- API responde GET `/health` com status 200 e objeto JSON documentado.
- PostgreSQL é iniciado via Compose e mantém dados em volume; secrets são privados.
- Testes do endpoint `/health`, lint, typecheck e builds básicos passam; falhas e itens não executados são declarados.
- READMEs reproduzem o ambiente a partir de checkout limpo.
- Nenhuma conta externa, deployment ou outro diretório foi modificado.

## O que devolver ao ChatGPT após executar
Caminho absoluto do projeto (pode ocultar nome pessoal da pasta se desejar); versões instaladas; árvore de pastas gerada; diffs/resumo dos arquivos; saídas de teste/build; eventuais conflitos; decisões técnicas tomadas.

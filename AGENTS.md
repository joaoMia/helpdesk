# AGENTS.md — HelpDesk

## Contexto e limite de atuação

Continue o HelpDesk existente: aplicação web responsiva de suporte de TI para solicitantes, técnicos e administradores. A fundação local possui frontend técnico, API com healthcheck e PostgreSQL em Docker; módulos de negócio ainda não foram implementados. A liberação do marco M1 exige autorização por tarefa e não libera funcionalidades de negócio automaticamente.

Trabalhe exclusivamente em `C:\dev\helpdesk`. Confirme o diretório real antes de qualquer alteração. Não modifique projetos irmãos, configurações do sistema ou arquivos fora dessa raiz. Se o caminho ou o estado do repositório divergir das pré-condições da tarefa, interrompa e informe.

## Fontes de verdade e compatibilidade

Use esta hierarquia para os requisitos do projeto:

1. Documentação oficial em [docs/](docs/), decisões explicitamente aprovadas e limites da fase atual.
2. Instrução explícita da tarefa na conversa ou issue aprovada, com seus critérios de aceite.
3. Contratos e testes versionados, quando existirem.
4. Figma como referência visual somente após validação dos quadros.

Consulte o [README](README.md), o [backlog](planning/backlog.csv), o [plano M1](docs/15-m1-plano-de-execucao.md) e os documentos relevantes à tarefa. Propostas em [ADRs pendentes](docs/13-decisoes-pendentes.md) e [decisões dos próximos módulos](docs/16-decisoes-para-proximos-modulos.md) não são aprovações. Se houver conflito material, apresente-o antes de implementar a parte dependente; não resolva regras de negócio por suposição.

O [CLAUDE.md](CLAUDE.md) e a [Skill do Claude](.claude/skills/helpdesk-task/SKILL.md) permanecem referências compartilhadas de trabalho. Este arquivo orienta o Codex e não cria outra especificação funcional. A instrução explícita vigente do responsável prevalece sobre orientações operacionais antigas, inclusive sobre branches e PRs.

## Arquitetura e organização previstas

Siga a [arquitetura](docs/04-arquitetura.md), sem reinicializar o projeto:

- `apps/frontend/`: React, Vite, TypeScript e Tailwind; ECharts e GSAP quando houver telas funcionais e tarefa autorizada.
- `apps/backend/`: Node.js, Express, TypeScript, Zod e JWT; fluxo routes → controller → service/use-case → repository. Regras nos serviços, autorização na API.
- `packages/contracts/`: contratos Zod e tipos compartilhados, ainda sem pacote inicializado.
- `infra/`: PostgreSQL local via Docker Compose; aplicações previstas no host.
- `docs/` e `planning/`: especificação, diagramas, decisões e backlog.

Utilize npm workspaces conforme o `package.json` existente. Versões de Node, Prisma e demais ferramentas dependem da HD-008/ADR-10 e de compatibilidade verificada; não fixe versões nem instale pacotes por inferência desta lista. Não invente modelos, migrations ou seeds.

## Desenvolvimento incremental e autorizações

- Uma tarefa autorizada por vez. Apresente diagnóstico e plano sucinto antes de editar; a [Skill do Codex](.agents/skills/helpdesk-task/SKILL.md) organiza esse fluxo em cinco fases.
- Respeite a autorização já concedida na sessão para o escopo específico; não a amplie para tarefas seguintes, operações remotas ou dependências não aprovadas.
- Se a execução ainda não estiver autorizada, entregue o plano e aguarde aprovação. Peça decisão quando uma ambiguidade alterar requisitos ou escopo.
- Preserve trabalho existente, documentação, Skills e arquivos fora do escopo. Não descarte alterações de terceiros.
- Instalações, migrações, seeds, integrações externas, deploy e mudanças de ambiente exigem autorização específica; a presença de comandos na documentação não autoriza executá-los.

## Qualidade, permissões e segurança

Siga os [requisitos e permissões](docs/02-requisitos-e-permissoes.md), as [regras de negócio](docs/03-regras-de-negocio.md), as [regras de tempos e pendências](docs/09-tempos-pendencias.md) e a [estratégia de segurança e testes](docs/10-seguranca-e-testes.md).

- Use TypeScript e validação Zod nos limites da API; respeite contratos e tratamento central de erros. Mantenha código de domínio fora dos controllers.
- Valide papel e vínculo com o recurso no backend para `REQUESTER`, `TECHNICIAN` e `ADMIN`, inclusive em agregações. Controles na interface não concedem permissão; poderes de supervisão pendentes não devem ser presumidos.
- Preserve abertura sem técnico ou horário, estado `OPEN` sem prioridade ou responsável, classificação sem atribuição e início atômico. Respeite os quatro estados oficiais e as transições documentadas.
- Preserve snapshots de serviços e pendências, retomada condicionada à interação válida do solicitante, jornadas versionadas, pausas e os dois indicadores de tempo útil. Não acrescente reabertura, transferência ou SLA sem decisão aprovada.
- Não grave ou exponha senhas, tokens, hashes de senha, credenciais ou dados sensíveis em arquivos versionados, logs, screenshots ou respostas. Use variáveis de ambiente e exemplos sem valores reais quando autorizados; mantenha arquivos de segredos ignorados pelo Git.
- Execute testes relevantes, lint, typecheck e build conforme o código e os scripts existentes. Para alterações documentais, valide referências, escopo e diff. Não instale ferramentas ou crie aplicações para viabilizar verificações desta etapa.
- Relate falhas e verificações não executadas; nunca declare testes aprovados sem executá-los. Respeite `.editorconfig` e `.gitattributes`, inclusive a política do CSV.

## Convenções Git

- Trabalhe na `main` para tarefas rotineiras. Crie ou alterne para outra branch somente mediante autorização específica; não remova branches antigas por iniciativa própria.
- Commits, exclusões de arquivos ou referências, merges e pushes exigem autorização explícita, salvo quando já permitidos no escopo vigente. Não deduza autorização de publicação da autorização para editar.
- Escreva mensagens de commit em português e identifique a tarefa, por exemplo: `HD-010: configurar aplicação frontend`. Preserve a identidade aprovada; não altere autoria histórica sem autorização.
- Não acrescente coautoria, trailers ou atribuição à IA sem solicitação explícita. Preserve coautorias existentes quando a tarefa não autorizar alterá-las.
- Revise o staging e o diff antes de um commit autorizado. Reescrita de histórico, force push e operações destrutivas não fazem parte do fluxo rotineiro e exigem autorização específica.

## Critérios de aceite e entrega

Conclua somente o escopo aprovado, com critérios de aceite demonstrados, validações pertinentes relatadas, ausência de segredos e diff restrito aos arquivos autorizados. Confira `git status`, incluindo arquivos novos, e o estado da branch ao finalizar.

Entregue: tarefa e resultado; arquivos criados, alterados ou removidos; comandos realmente executados; testes e verificações com resultados; itens não executados e motivo; riscos e pendências; estado final do Git; operações que ainda dependem de aprovação. Aguarde revisão e não inicie outra tarefa automaticamente.

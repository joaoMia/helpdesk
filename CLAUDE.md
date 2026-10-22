# CLAUDE.md — Instruções de trabalho do HelpDesk

## Autorização vigente
O responsável autorizou **somente a fundação do marco M1**, mediante instrução explícita por tarefa. Não iniciar funcionalidades de negócio, integrações externas, deploy ou alterações em contas remotas até ordem específica.

## Limite físico
- O projeto deve ficar dentro da pasta `helpdesk` localizada na pasta existente `dev` do usuário.
- Antes de cada trabalho, confirmar o diretório real com o terminal. Se não estiver na pasta correta, **parar sem escrever nada**.
- Não alterar outros projetos irmãos, a pasta `dev` como um todo nem configurações de sistema sem autorização.

## Fonte de verdade
1. Requisitos e regras em `docs/`, decisões explicitamente aprovadas e limitações desta fase.
2. Tarefa atual no arquivo `prompts/` ou issue aprovada.
3. Contratos e testes versionados.
4. Figma como referência visual, apenas depois de validar seus quadros.

## Stack pretendida
Frontend React/Vite/TypeScript/Tailwind; backend Node.js/Express/TypeScript/JWT/Zod/Jest; PostgreSQL/Docker Compose; Prisma após verificar compatibilidade. Monorepo simples por npm workspaces; sem ferramentas desnecessárias. GSAP, ScrollTrigger, ScrollSmoother e ECharts serão incorporados quando houver telas funcionais, não na primeira tarefa.

## Regras de negócio irrevogáveis sem aprovação
- Solicitante abre chamado sem escolher técnico ou horário.
- Chamado novo: `OPEN`, sem prioridade e sem responsável.
- Técnico classifica prioridade sem assumir. Assumir altera estado para `IN_PROGRESS` de maneira atômica.
- Estados: `OPEN`, `IN_PROGRESS`, `PENDING`, `CLOSED`.
- Pendências têm regras de contagem e retomada por interação do solicitante.
- Expediente padrão/personalizado e pausas determinam o tempo útil, além das pendências.
- Dois indicadores: abertura->encerramento e primeiro início->encerramento, medidos apenas em períodos contabilizáveis.
- Dashboards específicos para solicitante, técnico e admin, com filtros no backend.

## Método obrigatório por tarefa
1. Apresentar diagnóstico e plano sucinto antes de editar.
2. Implementar somente o escopo solicitado; não presumir regras abertas.
3. Nunca publicar segredos em Git, logs, arquivos, screenshots ou respostas.
4. Executar testes/lint/typecheck pertinentes e relatar exatamente o que executou.
5. Não fazer push, deploy, apagar arquivos existentes, operar GitHub/Miro, ou mudar configurações do sistema sem autorização específica.
6. Fornecer resumo, arquivos modificados, comandos, testes, limitações e pendências ao terminar.

## Skill de trabalho supervisionado
As tarefas aprovadas podem usar `.claude/skills/helpdesk-task/SKILL.md` (invocação manual `/helpdesk-task HD-XXX`). A Skill complementa estas regras; não concede autorizações adicionais. Para começar, use `prompts/00-primeira-conversa-com-claude.md`, somente diagnóstico.

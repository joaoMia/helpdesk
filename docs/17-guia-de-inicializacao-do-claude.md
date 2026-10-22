# 17 — Início seguro com Claude Code (versão 1.5)

## Ordem de início
1. Localize a pasta `dev` já existente em seu computador.
2. Crie `dev/helpdesk` se não existir; confirme que está vazia ou revise arquivos antes de sobrescrever.
3. Extraia o **conteúdo** de `HelpDesk_Kit_Claude_v1_5.zip` em `dev/helpdesk/`, sem criar uma subpasta com o nome do ZIP.
4. Confira que a raiz contém `CLAUDE.md`, `README.md`, `docs/`, `planning/` e `.claude/skills/helpdesk-task/SKILL.md`.
5. Inicie Claude Code no modo **Local**, apontando a pasta do projeto para `dev/helpdesk`. Prefira o modo **Plan** na primeira conversa ou **Ask permissions** quando começar a executar alterações.
6. Solicite somente diagnóstico e plano, sem edições: confirmar o diretório real e o estado do Git; ler `CLAUDE.md`, a Skill, o `README.md`, o backlog e os documentos relevantes, em especial `docs/15-m1-plano-de-execucao.md` e `docs/16-decisoes-para-proximos-modulos.md`; verificar as ferramentas necessárias sem instalar nada; apresentar escopo, riscos e comandos previstos para a tarefa solicitada. Propostas pendentes não são decisões aprovadas.
7. Revise o diagnóstico e o plano antes de autorizar a execução.
8. Para uma tarefa futura, invoque a Skill com `/helpdesk-task HD-XXX`; ela exige plano aprovado antes das mudanças. Use a instrução explícita na conversa ou issue aprovada, a entrada do backlog e os documentos relevantes como especificação. O escopo da HD-009 está em `docs/15-m1-plano-de-execucao.md`.
9. Ao terminar HD-009, traga ao ChatGPT o relatório da execução, alterações e resultado dos comandos para revisão técnica.

## Como funcionam as instruções
- `CLAUDE.md`: regras permanentes que Claude Code considera a cada sessão.
- `.claude/skills/helpdesk-task/SKILL.md`: procedimento opcional para executar uma tarefa por vez, invocado manualmente com `/helpdesk-task HD-XXX`.
- Instrução explícita na conversa ou issue aprovada: solicitação específica e limites da tarefa atual.
- `docs/`: fonte de requisitos, arquitetura, decisões, diagramas e critérios.
- `planning/backlog.csv`: sequência de trabalho.

## Segurança e limitações
- Não forneça senhas da Rocketseat, tokens GitHub/Miro nem credenciais de banco ao chat.
- Usar a pasta de projeto e o modo de permissão correto **não** significa isolamento absoluto do computador. Revise os pedidos de acesso do Claude Code e não autorize comandos fora do necessário.
- `CLAUDE.md` e Skills são instruções, não garantias técnicas de bloqueio; permissões e revisão continuam necessárias.
- Na primeira tarefa, não realizar commit/push, deploy nem conexões externas sem autorização expressa.
- O pacote contém documentação e configuração de agente, ainda **não** contém a aplicação HelpDesk implementada.

# HelpDesk — Início do marco M1 (pacote v1.5 com Skill Claude)

**Etapa:** fundação técnica em ambiente local. **Código da aplicação:** ainda não criado.
**Diretório obrigatório do projeto:** pasta `helpdesk` **dentro** da pasta existente `dev` do proprietário. O caminho absoluto depende do sistema operacional.

## Como começar
1. No computador, localizar a pasta `dev` já existente.
2. Criar uma pasta vazia `helpdesk` dentro dela, caso ainda não exista. Verificar antes para não sobrescrever nada.
3. Descompactar **o conteúdo** deste ZIP na raiz de `dev/helpdesk` (não criar outra pasta aninhada chamada `HelpDesk_Inicio_M1_v1_4`).
4. Abrir exatamente `dev/helpdesk` no VS Code ou no Claude Code Desktop (ambiente local) e verificar o caminho.
5. Ler `docs/15-m1-plano-de-execucao.md`, `docs/16-decisoes-para-proximos-modulos.md` e `CLAUDE.md`.
6. Na primeira sessão, enviar `prompts/00-primeira-conversa-com-claude.md` ao Claude Code para diagnóstico e plano, sem edições.
7. Após revisar e aprovar o plano, iniciar HD-009 com a Skill `/helpdesk-task HD-009` e o prompt `prompts/HD-009-primeira-tarefa-claude.md`.
8. Revisar o resultado do Claude, comandos executados, testes e arquivos antes de commitar ou publicar. Confira `docs/17-guia-de-inicializacao-do-claude.md`.

**Limites:** este pacote contém documentos, backlog e diagramas conceituais; não contém aplicação funcional. Não há acesso ao computador do usuário, nem repositório/board remoto criado.

## Pastas
- `docs/`: requisitos, decisões, arquitetura, regras e diagramas Mermaid.
- `planning/backlog.csv`: 64 tarefas com rastreabilidade e estados iniciais.
- `prompts/`: primeiro prompt para Claude Code (somente preparação técnica).
- `CLAUDE.md`: política do agente para esta fase.

## Estado da aprovação
O responsável aprovou a **estrutura para início**. Isso autoriza somente o marco M1. As decisões funcionais ainda pendentes ficam registradas em `docs/16-decisoes-para-proximos-modulos.md` e não autorizam implementar regras ambíguas.

## Skill do Claude Code
A Skill do projeto está em `.claude/skills/helpdesk-task/SKILL.md`, com invocação manual `/helpdesk-task HD-009`. O `CLAUDE.md` da raiz contém as regras permanentes.

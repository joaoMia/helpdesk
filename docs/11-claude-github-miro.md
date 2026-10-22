# 11 — Método de trabalho com Claude Code, GitHub, Miro e Figma

## Papéis
- Responsável do projeto: aprova decisões e testa a aplicação.
- ChatGPT: engenharia de prompts, requisitos, backlog, revisão de consistência, critérios de aceite.
- Claude Code: desenvolvimento local **somente mediante tarefa aprovada**, testes e documentação; o marco M1 foi liberado pelo responsável.
- GitHub: branches, issues, PRs, releases; Miro: diagramas; Figma: referência de UI.

## Fluxo por tarefa
1. Selecionar issue em estado `Pronto`, com RF/RN, cenários e dependências.
2. Elaborar prompt limitado a essa tarefa; listar escopo permitido/proibido, arquivos esperados, testes.
3. Claude lê `CLAUDE.md` e documentos pertinentes, propõe plano curto e sinaliza riscos.
4. Desenvolver em branch `feat/HD-xxx-descricao` ou `fix/HD-xxx`.
5. Executar typecheck/lint/testes, revisar diff, atualizar documentação e Miro quando necessário.
6. Abrir PR com issue, evidências e checklist; responsável valida e aprova merge.
7. Atualizar status e anotar decisão de arquitetura (ADR) caso necessário.

## Regra para prompts
Nunca usar 'construa o HelpDesk completo'. Uma tarefa = resultado verificável; não introduzir recursos fora do backlog; não mudar regra de negócio por suposição. Nunca pedir ao Claude acesso à conta da Rocketseat ou compartilhar segredos.

## Miro: board sugerido `HelpDesk — Arquitetura e Processos`
Frames: (1) visão geral, (2) mapa de personas/permissões, (3) casos de uso, (4) ERD, (5) máquina de estados, (6) triagem/atribuição, (7) pendência/retomada, (8) calendários/tempos, (9) navegação por papel, (10) roadmap e ADRs. Cada frame deve incluir IDs de RF/RN e versão/data.
Diagramas `.mmd` deste pacote são **referências de origem**, não promessa de importação automática: Claude pode reproduzi-los no Miro via integração autorizada. Revisar o diagrama visual antes de tê-lo por aprovado.

## GitHub Projects
Campos: ID, Título, Épico, Status, Prioridade, Dependências, Requisito, Responsável, Tipo, Critério de aceite. Status: Backlog -> Pronto -> Em desenvolvimento -> Em revisão -> Concluído. Evitar PRs gigantes e commits diretos na main.

## Acesso/segurança
Conectar Miro/GitHub à ferramenta de IA com permissões mínimas, autenticação legítima e revisão de escopos. Usar repositório privado para início. Não entregar tokens, cookies ou senha da Rocketseat. Jamais dar à IA autorização para apagar repositórios/boards sem confirmação.

## Integração do Figma
Link fornecido: https://www.figma.com/pt-br/comunidade/file/1506654636739959765/plataforma-de-chamados . Revisão de quadros desktop/mobile e tokens visuais é pré-requisito para aprovação final de UI.

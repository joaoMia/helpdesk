---
name: helpdesk-task
description: Conduz uma tarefa aprovada do backlog HelpDesk com análise, plano, execução limitada, testes e relatório de revisão. Usar para trabalhar em uma tarefa HD-XXX por vez.
argument-hint: "[ID da tarefa, ex.: HD-009]"
disable-model-invocation: true
---

# Adaptador do HelpDesk para Claude Code

Tarefa solicitada: **$ARGUMENTS**.

Preserve a invocação manual `/helpdesk-task HD-XXX`, os argumentos acima e as instruções do [CLAUDE.md](../../../CLAUDE.md). O frontmatter deste adaptador mantém o controle de invocação próprio do Claude.

Antes de conduzir a tarefa, leia integralmente o [procedimento compartilhado](../../../skills/helpdesk-task/procedimento.md) e siga suas cinco fases. Antes da entrega, leia e aplique o [checklist compartilhado](../../../skills/helpdesk-task/checklist-entrega.md).

Os caminhos equivalentes a partir da raiz do repositório são `skills/helpdesk-task/procedimento.md` e `skills/helpdesk-task/checklist-entrega.md`. Este adaptador não concede autorizações adicionais.

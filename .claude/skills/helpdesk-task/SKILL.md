---
name: helpdesk-task
description: Conduz uma tarefa aprovada do backlog HelpDesk com análise, plano, execução limitada, testes e relatório de revisão. Usar para trabalhar em uma tarefa HD-XXX por vez.
argument-hint: "[ID da tarefa, ex.: HD-009]"
disable-model-invocation: true
---

# Fluxo supervisionado de trabalho — HelpDesk

Tarefa solicitada: **$ARGUMENTS**.

## Regras gerais
- Siga `CLAUDE.md` e a documentação em `docs/`; não substitua decisões aprovadas por suposições.
- Confirme pelo caminho real que está no diretório `helpdesk`, diretamente dentro da pasta `dev` existente. Sem confirmação, não escreva arquivos.
- Leia a entrada correspondente em `planning/backlog.csv`, o prompt específico em `prompts/` se existir e os documentos relevantes.
- Não interprete a presença desta Skill como autorização para implementar outras tarefas.
- Não altere arquivos fora de `dev/helpdesk`, segredos, credenciais, configurações do SO ou outros projetos.
- Não use GitHub ou Miro, não faça push, commit, deploy, instalação de pacotes ou operações destrutivas sem autorização específica.

## Autorização de execução
Se já existe nesta sessão um plano específico para esta tarefa e o usuário aprovou explicitamente sua execução, avance diretamente para a Fase B após verificar que o escopo não mudou. Caso contrário, faça a Fase A e aguarde aprovação. Nunca deduza aprovação apenas pela presença da Skill.

## Fase A — Diagnóstico e plano (sem escrever arquivos)
1. Confirme diretório e `git status` (se houver Git).
2. Identifique objetivo, pré-condições, requisitos, restrições e critérios de aceite da tarefa.
3. Liste arquivos pretendidos e comandos necessários; registre riscos e dependências.
4. Se houver requisito ambíguo que afete o trabalho, proponha uma alternativa, mas não a implemente sem aprovação.
5. Mostre um plano sucinto e **pare, solicitando aprovação explícita da execução**.

## Fase B — Execução (somente após aprovação do plano pelo usuário)
1. Implemente exclusivamente os itens aprovados, preservando documentos e arquivos existentes.
2. Para código, use validação Zod, autorização no backend, TypeScript e testes relevantes quando a tarefa exigir.
3. Não execute ações fora do escopo aprovado; peça nova autorização se aparecer dependência material.
4. Execute verificações compatíveis com o estágio do projeto; jamais apresente testes não executados como aprovados.
5. Confira o `git diff`/`git status` antes da entrega, quando Git estiver disponível.
6. Pare ao concluir a tarefa; não inicie a próxima automaticamente.

## Relatório obrigatório
Entregue sempre: tarefa/escopo, arquivos criados ou alterados, comandos realmente executados, testes e resultados, itens não executados e motivo, riscos ou pendências e sugestão de próxima tarefa (sem iniciá-la).

Para checklist detalhado de revisão, consulte [references/checklist-entrega.md](references/checklist-entrega.md).

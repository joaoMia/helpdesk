---
name: helpdesk-task
description: Conduz uma tarefa específica do HelpDesk com diagnóstico, plano, execução autorizada, validação e entrega para revisão. Use para tarefas HD, CODEX, MAN ou GIT deste repositório, uma por vez.
---

# Tarefa supervisionada do HelpDesk

Identifique a tarefa pela solicitação atual do usuário; não dependa de argumentos ou comandos do Claude. Siga o [AGENTS.md](../../../AGENTS.md) da raiz e use a documentação oficial como fonte das regras. Esta Skill organiza o trabalho e não concede autorização para implementar, commitar ou publicar.

## 1. Diagnóstico

- Confirme o caminho real `C:\dev\helpdesk`, a branch ativa, o HEAD e o estado da working tree, incluindo arquivos novos e staging.
- Confira as pré-condições exigidas pela tarefa. Se ela exigir árvore limpa ou sincronização remota, valide antes de alterar; em divergência, interrompa e apresente o problema. Não descarte trabalho existente nem consulte credenciais para exibi-las.
- Leia a solicitação, o [backlog](../../../planning/backlog.csv) quando houver entrada correspondente e os documentos relevantes. Tarefas de manutenção ou configuração podem ser autorizadas pela conversa sem entrada no backlog; não crie essa entrada automaticamente.
- Identifique objetivo, requisitos, dependências e decisões pendentes. Diferencie regras aprovadas de propostas; não inicie módulos bloqueados por decisão ainda aberta.

## 2. Planejamento

- Apresente escopo, arquivos pretendidos, comandos, riscos e critérios de aceite verificáveis antes de editar.
- Verifique a autorização específica vigente. Se já concedida para esse escopo, prossiga sem pedir a mesma aprovação novamente. Caso contrário, apresente o plano e aguarde aprovação da execução.
- Obtenha decisão antes de implementar uma ambiguidade que altere regra de negócio, escopo ou dependência material. Não considere a Skill, o backlog ou o plano M1 como autorização adicional.

## 3. Execução

- Implemente somente o escopo autorizado dentro da raiz do HelpDesk. Preserve as regras, documentação e configurações existentes, salvo alterações expressamente incluídas na tarefa.
- Trabalhe na `main` por padrão; outra branch exige autorização específica. Não faça commits, exclusões, merges ou pushes sem autorização que abranja essas ações.
- Siga os padrões TypeScript, Zod, autorização por papel e recurso e separação de camadas definidos no AGENTS.md e em docs. Não copie requisitos funcionais para esta Skill nem resolva ADRs por suposição.
- Não instale pacotes, execute migrations/seeds, opere integrações externas ou faça deploy sem autorização específica. Não exponha segredos nem modifique projetos irmãos ou configurações de sistema.
- Em operações Git autorizadas, use mensagens em português com identificação da tarefa. Não acrescente coautoria da IA sem solicitação; preserve a identidade aprovada e os trailers existentes fora do escopo de alteração.

## 4. Validação

- Execute as verificações e testes aplicáveis aos critérios da tarefa e aos scripts disponíveis. Siga a [estratégia de qualidade](../../../docs/10-seguranca-e-testes.md); não invente resultados nem instale dependências sem autorização.
- Em documentos e instruções, confira referências e caminhos, consistência com decisões aprovadas e preservação dos arquivos fora do escopo. Em código, inclua cenários relevantes de negócio, segurança e concorrência quando afetados.
- Revise o diff da working tree e do staging, arquivos novos e `git status`. Execute `git diff --check` e, se houver staging, `git diff --cached --check`; inspecione também arquivos novos, que não aparecem no diff comum.
- Declare falhas, limitações e verificações não executadas. Use o [checklist de entrega](references/checklist-entrega.md) antes do relatório.

## 5. Entrega

- Apresente tarefa/escopo, resultado, arquivos criados/alterados/removidos, comandos executados, validações e resultados, itens não executados e motivo, riscos ou pendências e estado final do Git.
- Se commits ou publicações tiverem sido autorizados e realizados, informe seus hashes e confirme o resultado remoto. Caso contrário, deixe as alterações sem commit para revisão; não faça publicação automática.
- Aguarde revisão e aprovação para ações ainda não autorizadas. Não inicie a próxima tarefa automaticamente.

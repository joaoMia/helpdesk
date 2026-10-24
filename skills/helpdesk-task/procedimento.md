# Procedimento compartilhado — HelpDesk

Este é o procedimento único de manutenção da Skill helpdesk-task para Claude Code e Codex. Os adaptadores de descoberta preservam os metadados e a forma de invocação de cada ferramenta; as regras de execução ficam aqui.

Siga as instruções permanentes de [AGENTS.md](../../AGENTS.md) e [CLAUDE.md](../../CLAUDE.md), a documentação oficial e a autorização vigente da tarefa. Esta Skill não concede autorização para implementar outras tarefas, commitar ou publicar. Não transforme propostas pendentes em decisões aprovadas nem copie requisitos funcionais para a Skill.

## 1. Diagnóstico

- Confirme o caminho real `C:\dev\helpdesk`, diretamente dentro de `C:\dev`, antes de escrever arquivos. Confira branch, HEAD e `git status`, incluindo arquivos novos e staging.
- Confira as pré-condições exigidas pela tarefa. Se ela exigir árvore limpa ou sincronização remota, valide antes de alterar; em divergência, interrompa e apresente o problema. Não descarte trabalho existente nem consulte credenciais para exibi-las.
- Leia a solicitação na conversa ou issue aprovada, a entrada correspondente no [backlog](../../planning/backlog.csv) quando houver e os documentos relevantes. Tarefas de manutenção ou configuração podem ser autorizadas pela conversa sem entrada no backlog; não crie essa entrada automaticamente.
- Identifique objetivo, requisitos, restrições, dependências, critérios de aceite e decisões pendentes. Diferencie regras aprovadas de propostas; não inicie módulos bloqueados por decisão ainda aberta.

## 2. Planejamento

- Apresente escopo, arquivos pretendidos, comandos necessários, riscos e critérios de aceite verificáveis antes de editar. Diagnóstico e planejamento não alteram arquivos.
- Verifique o plano específico e a autorização vigente. Se o usuário já aprovou explicitamente a execução desse escopo na sessão, confirme que ele não mudou e prossiga sem pedir a mesma aprovação novamente. Caso contrário, apresente o plano e aguarde aprovação explícita da execução.
- Se houver ambiguidade que afete regras, escopo ou dependência material, proponha uma alternativa, mas não implemente a parte dependente sem aprovação. Não considere a presença da Skill, o backlog ou o plano M1 como autorização adicional.

## 3. Execução

- Implemente exclusivamente os itens autorizados dentro da raiz do HelpDesk. Preserve regras, documentação, Skills, configurações e trabalho existente, salvo alterações expressamente incluídas na tarefa. Explique mudanças inesperadas.
- Trabalhe na `main` por padrão; outra branch exige autorização específica. Não faça commits, exclusões, merges, pushes ou operações destrutivas sem autorização que abranja essas ações.
- Para código, siga TypeScript, validação Zod, autorização no backend por papel e vínculo com o recurso, separação de camadas e testes relevantes, conforme as instruções permanentes e [docs/](../../docs/). Não resolva ADRs por suposição.
- Não instale pacotes, execute migrations/seeds, opere GitHub, Miro ou outras integrações externas, faça deploy ou altere o sistema operacional sem autorização específica. Não modifique projetos irmãos nem arquivos fora de `C:\dev\helpdesk`.
- Não exponha senhas, tokens, credenciais ou dados sensíveis em código, logs, screenshots ou respostas; não introduza dados pessoais reais sem autorização e necessidade da tarefa.
- Em operações Git autorizadas, use mensagens em português com identificação da tarefa. Não acrescente coautoria da IA sem solicitação; preserve a identidade aprovada e os trailers existentes fora do escopo de alteração.

## 4. Validação

- Execute verificações e testes compatíveis com o estágio do projeto, os critérios da tarefa e os scripts disponíveis. Siga a [estratégia de qualidade](../../docs/10-seguranca-e-testes.md); não invente resultados nem instale dependências sem autorização.
- Em documentos e instruções, confira referências e caminhos, consistência com decisões aprovadas e preservação dos arquivos fora do escopo. Em código, inclua cenários relevantes de negócio, segurança e concorrência quando afetados.
- Revise o diff da working tree e do staging, arquivos novos e `git status`. Execute `git diff --check` e, se houver staging, `git diff --cached --check`; inspecione também arquivos novos, que não aparecem no diff comum.
- Declare falhas, limitações e testes, lint, typecheck ou build não executados, com motivo objetivo. Nunca declare uma verificação aprovada sem executá-la.
- Leia e aplique o [checklist de entrega](checklist-entrega.md) antes do relatório.

## 5. Entrega

- Apresente tarefa/escopo, resultado, arquivos criados/alterados/removidos, comandos realmente executados, testes e verificações com resultados, itens não executados e motivo, riscos ou pendências e estado final do Git.
- Se commits ou publicações tiverem sido autorizados e realizados, informe seus hashes e confirme o resultado remoto. Caso contrário, deixe as alterações sem commit para revisão; não faça publicação automática.
- Informe as ações que ainda dependem de aprovação. Uma sugestão de próxima tarefa, quando pertinente, é somente recomendação e não autorização para iniciá-la.
- Aguarde revisão e aprovação para ações ainda não autorizadas. Pare ao concluir a tarefa; não inicie a próxima automaticamente.

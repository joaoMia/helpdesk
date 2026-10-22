# Checklist de revisão de entrega — HelpDesk

- [ ] A tarefa aprovada está claramente identificada (HD-XXX).
- [ ] Diretório confirmado como `dev/helpdesk`; nenhum arquivo irmão de `helpdesk` foi tocado.
- [ ] A execução respeitou `CLAUDE.md`, os requisitos e as decisões consolidadas.
- [ ] Não foram incluídas funcionalidades de outra tarefa.
- [ ] Arquivos existentes foram preservados e mudanças inesperadas foram explicadas.
- [ ] Não há senhas, tokens ou dados pessoais no código ou logs apresentados.
- [ ] Testes, lint, typecheck ou build exigidos para esta tarefa foram efetivamente executados ou há explicação objetiva para a ausência.
- [ ] Não houve commit, push, deploy, mudança no GitHub/Miro ou alteração do sistema operacional sem aprovação específica.
- [ ] O relatório contém arquivos alterados, comandos e resultados verificáveis.
- [ ] A próxima tarefa foi somente recomendada, nunca iniciada por iniciativa própria.

**HD-009 tem escopo especial:** não instalar dependências nem criar frontend/backend funcionais; verificar o prompt detalhado em `prompts/HD-009-primeira-tarefa-claude.md`.

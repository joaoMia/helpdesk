# Checklist de entrega compartilhado — HelpDesk

- [ ] Tarefa aprovada claramente identificada, por exemplo HD-XXX; autorização, objetivo, dependências e critérios de aceite conferidos.
- [ ] Diretório real confirmado como `C:\dev\helpdesk`; nenhum projeto irmão, arquivo fora da raiz ou configuração de sistema alterado sem autorização específica.
- [ ] Branch e pré-condições respeitadas; trabalho anterior e alterações de terceiros preservados.
- [ ] Somente arquivos e operações do escopo autorizado incluídos; nenhuma funcionalidade de outra tarefa implementada.
- [ ] Requisitos, regras de negócio e decisões consolidadas respeitados; propostas pendentes não viraram regras.
- [ ] Compatibilidade com [AGENTS.md](../../AGENTS.md) e [CLAUDE.md](../../CLAUDE.md) mantida; instruções permanentes e adaptadores preservados fora do escopo de alteração.
- [ ] Arquivos existentes preservados; mudanças inesperadas identificadas e explicadas.
- [ ] Referências e caminhos novos conferidos; nenhum segredo, credencial ou dado pessoal sensível exposto em código, logs, imagens ou relatório.
- [ ] Testes, lint, typecheck e build pertinentes efetivamente executados, ou ausência explicada; falhas, limitações e itens não executados informados.
- [ ] Diff, staging e arquivos novos revisados; estado final do Git conferido.
- [ ] Commits, exclusões, merges, pushes, deploy, instalações, operações GitHub/Miro e alterações do sistema somente quando especificamente autorizados.
- [ ] Mensagens de commits autorizados em português com identificação da tarefa; identidade aprovada e trailers preservados; nenhuma coautoria da IA acrescentada sem solicitação.
- [ ] Relatório contém tarefa/escopo, resultado, arquivos, comandos, validações, limitações, riscos, pendências e ações que dependem de aprovação.
- [ ] Próxima tarefa apenas recomendada quando pertinente, sem início automático; entrega encerrada aguardando revisão.

**HD-009 tem escopo especial:** não instalar dependências nem criar frontend/backend funcionais; verificar o escopo no [plano M1](../../docs/15-m1-plano-de-execucao.md) e a instrução explícita da tarefa na conversa ou issue aprovada.

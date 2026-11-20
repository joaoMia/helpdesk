# 40 — Conventional Commits no HelpDesk

Os próximos commits autorizados seguem [Conventional Commits 1.0.0](https://www.conventionalcommits.org/pt-br/v1.0.0/). Codex e Antigravity usam o mesmo padrão e seguem as [convenções Git do AGENTS.md](../AGENTS.md#convenções-git). A `main` é a branch de trabalho rotineira. Commit e push exigem autorização explícita para cada operação.

## Formato do título

```text
tipo(escopo): descrição
```

- Use tipo e escopo em minúsculas. O escopo é obrigatório no HelpDesk. Escolha a área principal da alteração. Os escopos preferenciais são `auth`, `frontend`, `backend`, `ui`, `chamados`, `projetos`, `catalogo`, `tecnicos`, `dashboard`, `infra` e `docs`.
- Escreva a descrição em português brasileiro e comece com um verbo no infinitivo. Prefira títulos de até 72 caracteres e descreva o que mudou com precisão. Evite títulos genéricos como `ajustes`, `melhorias` ou `correções`.
- Agrupe mudanças que atendam ao mesmo objetivo. Separe funcionalidades diferentes em commits próprios ou justifique no corpo por que precisam ser entregues juntas.

| Tipo       | Uso                                        |
| ---------- | ------------------------------------------ |
| `feat`     | Nova funcionalidade                        |
| `fix`      | Correção de erro                           |
| `refactor` | Alteração estrutural sem mudança funcional |
| `style`    | Formatação sem alteração de comportamento  |
| `perf`     | Melhoria de desempenho                     |
| `test`     | Criação ou atualização de testes           |
| `docs`     | Documentação                               |
| `chore`    | Manutenção e configuração                  |
| `build`    | Alterações no processo de build            |
| `ci`       | Integração contínua                        |

## Corpo e rodapé

- Quando necessário, separe o corpo do título com uma linha em branco. Explique a motivação, o comportamento afetado e os identificadores de tarefas, por exemplo `Tarefa: HD-010`.
- Para uma mudança incompatível, inclua `BREAKING CHANGE: descrição` no rodapé, separado por uma linha em branco. Explique o impacto e a adaptação exigida. O título pode sinalizar a incompatibilidade com `!` antes dos dois-pontos.
- Inclua coautoria ou atribuição à IA somente quando houver solicitação explícita.

## Exemplos

```text
feat(projetos): publicar a primeira versão do plano
fix(chamados): exibir a ação de início para o técnico responsável
refactor(backend): separar a consulta da autorização de mutação
test(auth): cobrir a revogação de sessões
docs(docs): documentar o padrão de mensagens de commit
```

```text
feat(backend)!: renomear o campo de paginação da API

BREAKING CHANGE: clientes devem enviar page em vez de pagina.
```

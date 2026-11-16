# Execução integrada — BLOCOS 03.1, 04, 05 e 06

> Registro de desenvolvimento. Para regras e escopo atuais, consulte o [contrato vigente da v1.0](v1-contrato.md).

Registro incremental da execução autorizada pelo responsável. Não representa conclusão integral de ADRs nem autorização de publicação. Trabalho local sobre `f03e32516bfaac07af5ce4555304d10b9c58c280`, na `main`, sem commit ou push.

## Checkpoint 1 — distribuição sem início

Implementado e validado na execução anterior: visão operacional mínima, busca parcial no servidor, distribuição transacional a técnico habilitado, ficha restrita de triagem e início separado pelo destinatário. A distribuição não preenche o primeiro início nem altera a prioridade. As consultas privadas mantêm ownership; ADMIN não recebe automaticamente classificação ou início operacional.

Migration `20261029234000_distribuicao_sem_inicio` aplicada após backup e validação isolada. O checkpoint registrou 39 testes unitários backend, 173 de integração PostgreSQL e 77 frontend, totalizando 289, além de typecheck, lint, formatação, build e Prisma. Houve validação de atribuição, início pelo destinatário, F5 e telas desktop/mobile em ambiente isolado.

## Checkpoint 2 — gestão administrativa e jornadas

Implementação e validação automatizada disponíveis. Homologação visual pendente por indisponibilidade da ferramenta; a continuação autorizou explicitamente testes alternativos e prosseguimento dos blocos independentes.

Na retomada de 30/10/2026, passaram 39 testes unitários backend, 186 de integração PostgreSQL e 84 frontend (309 no total). Typecheck, lint, formatação, builds, Prisma validate e diff passaram; o histórico aponta quatro migrations atualizadas. Um timeout no teste legado de ACL do Windows exigiu repetição isolada: as sete suítes unitárias passaram sem mudar o código de provisionamento ou o limite de tempo. A validação visual administrativa permanece pendente, portanto o checkpoint 2 ainda não está integralmente concluído.

- APIs `/admin/users`, `/admin/companies`, `/admin/departments`, `/admin/schedules` e `/admin/organization-default`, exclusivamente para ADMIN autenticado, com CSRF, payloads estritos e paginação no servidor. Detalhes e edições usam `/:id`; históricos de jornadas usam `/admin/schedules/:id/versions`.
- Criação administrativa dos três perfis, credencial provisória aleatória com Argon2id e troca inicial obrigatória. A credencial aparece somente na resposta de criação ou redefinição, com `no-store`, sem consulta posterior ou persistência no navegador. Redefinição de outra conta em `/admin/users/:id/reset-password`; a própria senha continua no fluxo autenticado existente.
- Proteção transacional do último ADMIN ativo. Mudanças sensíveis revogam sessões. Não é permitido remover a função técnica ou desativar técnico com chamados não encerrados sob sua responsabilidade; transferência não foi autorizada.
- Empresas e setores sem exclusão física. Setor deve pertencer à empresa; o relacionamento composto também é validado no PostgreSQL. Autoinscrição e edição própria anteriores permanecem preservadas.
- Expedientes com múltiplos intervalos, dias sem expediente, exceções por data e fuso explícito. Sobreposições são rejeitadas. Mudanças de calendário criam novas versões imutáveis e segmentos futuros; não reescrevem períodos anteriores.
- Snapshot organizacional na abertura. Registros anteriores ficam sem vínculo histórico inventado. Jornadas ausentes deixam lacunas explícitas: o motor futuro deve recusar métricas finais incompletas, sem estimar horas corridas.

Migration `20261030001000_organizacao_jornadas` aplicada após backup e validação isolada. Acrescenta sete tabelas, campos opcionais e proteções de integridade; não altera dados legados. A retomada confirmou os checksums das quatro migrations aplicadas e preservação das oito tabelas originais de domínio.

## Proteção de arquivos locais

O `server.fs.deny` do Vite preserva suas exclusões padrão e bloqueia `**/.local/**`, onde ficam backups e artefatos privados de validação. Portas e proxy permanecem iguais. A fixture isolada também conserva essa configuração. Teste HTTP com sentinela sem segredo retornou 403, sem entrega do conteúdo. Isso complementa o armazenamento privado; não substitui autorização de download na futura API de anexos.

## Decisões confirmadas para o BLOCO 06

- O primeiro prazo de SLA de solução começa no **primeiro início de atendimento**, e não na abertura ou classificação. A classificação registra a versão aplicável da política; não inicia antecipadamente a contagem.
- Cada mudança posterior de prioridade reinicia o prazo, preservando o histórico das metas anteriores.
- `RESOLVED → CLOSED` poderá ser executado pelo técnico responsável ou ADMIN, com as mesmas validações de métricas finais e auditoria.

Na retomada anterior, os BLOCOS05/06 ainda estavam pendentes. A continuação integrada implementou comentários, arquivos privados, RESOLVED, SLA, tempos úteis, pendências, fechamento validado e dashboard real. Contratos, segurança e limites estão no [registro dos BLOCOS05/06](31-atendimento-tempos-e-sla.md). A regressão final aprovou **347 testes**: 42 unitários backend, 212 integrações PostgreSQL e 93 frontend. Typecheck, lint, formatação, builds, Prisma e diff aprovados. Seis migrations conferidas; comparação estrutural Prisma/banco vazia. A homologação visual continua pendente.

## Limitação da retomada visual

A ferramenta de inspeção visual encerrou a sessão por não conseguir confirmar a URL do navegador com segurança. Nenhuma ação adicional de interface foi executada após essa interrupção. A validação visual das telas administrativas desta retomada permanece pendente; testes automatizados não substituem esse aceite.

A fixture de navegador da retomada anterior foi encerrada pelo próprio procedimento de limpeza, restrito ao namespace que criou em `helpdesk_test`. A revisão automática bloqueou a limpeza de uma pasta temporária de teste de ACL em `.local`; nenhum dado de desenvolvimento foi excluído. Não há commit, staging ou push. O inventário inicial daquela retomada era27 modificados e32 novos; o inventário atualizado é conferido no relatório final, sem omitir diretórios novos.

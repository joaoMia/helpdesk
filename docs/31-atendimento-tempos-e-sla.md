# BLOCOS 05/06 — atendimento, arquivos privados e tempos úteis

> Registro de desenvolvimento. Para regras e escopo atuais, consulte o [contrato vigente da v1.0](v1-contrato.md).

Escopo autorizado pelo responsável na execução integrada e sua continuação de 30/10/2026. Mantém monorepositório, stack, autenticação, perfis, catálogo, serviço único e snapshots. Não homologa integralmente HD-003 ou decisões de módulos futuros. Sem commit/push/deploy nesta execução.

## Fluxo e autorização

`OPEN → IN_PROGRESS ↔ PENDING → IN_PROGRESS → RESOLVED → CLOSED`. A distribuição pode manter OPEN com responsável e sem primeiro início. Classificação continua separada; ADMIN distribui e administra, mas não se torna técnico nem ganha classificação/início/pendência/solução. Solução: somente responsável TECHNICIAN, em IN_PROGRESS, descrição obrigatória, evento e mudança de estado na mesma transação. Solução e encerramento têm instantes diferentes.

REQUESTER comenta/anexa somente nos próprios chamados em OPEN, IN_PROGRESS ou PENDING. TECHNICIAN comenta/anexa somente nos atribuídos já iniciados em IN_PROGRESS ou PENDING. RESOLVED e CLOSED são somente leitura; descarte de rascunho privado não publicado não altera a conversa ou o histórico. ADMIN lê e supervisiona globalmente, sem escrita operacional de conversa. Técnicos alheios ou livres não ganham detalhes, histórico, respostas ou arquivos. Ausentes/fora do escopo retornam o mesmo404. Autorização e revalidação transacional usam identidade do backend, sessão vigente, usuário ativo e troca inicial concluída.

## Contratos HTTP reais

Todos usam cookies e mecanismos existentes de origem/CORS; mutações exigem CSRF. Entradas são Zod estritas. Prefixo frontend local `/api`, não `/api/v1`.

| Método     | Caminho                             | Autorização / entrada                                                              |
| ---------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| GET        | `/tickets/:id/conversation`         | Leitura do chamado; page/pageSize; comentários, solução e anexos autorizados       |
| POST       | `/tickets/:id/comments`             | Solicitante próprio ou técnico responsável; content, attachmentIds opcionais       |
| POST       | `/tickets/:id/attachments?name=...` | Mesma escrita; corpo application/octet-stream sem compressão de transporte         |
| GET        | `/tickets/:id/attachments/:fileId`  | Leitura do chamado; download ou preview=true somente para PNG seguro               |
| POST       | `/tickets/:id/solution`             | Técnico responsável; description, attachmentIds opcionais; IN_PROGRESS→RESOLVED    |
| GET        | `/tickets/:id/metrics`              | Leitura do chamado; A/B, revisões SLA, pendência ativa e indicador de congelamento |
| POST       | `/tickets/:id/pending`              | Técnico responsável; reasonId e justification; IN_PROGRESS→PENDING                 |
| POST       | `/tickets/:id/resume`               | Técnico responsável; corpo vazio; PENDING→IN_PROGRESS                              |
| POST       | `/tickets/:id/close`                | Responsável ou ADMIN; corpo vazio; RESOLVED→CLOSED com métricas finais válidas     |
| GET        | `/pending-reasons`                  | TECHNICIAN vê ativos; ADMIN consulta/filtro; page/pageSize/search/status           |
| POST/PATCH | `/admin/pending-reasons[/:id]`      | ADMIN; nome, atividade, flags de contagem/retomada                                 |
| GET/POST   | `/admin/sla-policies`               | ADMIN; histórico paginado / nova versão priority,targetMinutes                     |
| GET        | `/admin/dashboard`                  | ADMIN; from/to UTC, companyId,departmentId,technicianId,priority,status            |

409 indica conflito/estado desatualizado/invariantes, inclusive ausência de calendário completo no fechamento; não há retry cego de mutações. Serviço, categoria, formulário, solicitante, snapshot e primeiro início não são substituídos na solução/pendência/fechamento. Histórico público usa DTO whitelist, sem JSON bruto.

## Arquivos

Armazenamento local privado em `.local/storage/attachments`, fora de public, bloqueado no Vite inclusive `/@fs/`. Nomes físicos são UUIDs gerados no servidor, sem utilizar o nome fornecido como caminho. ACL Windows restrita ao usuário executor antes da gravação; diretórios/arquivos POSIX0700/0600. Falha ao confirmar proteção recusa gravação. Reparse/symlinks são recusados; downloads verificam SHA256 e autorização antes da leitura. Respostas no-store/nosniff, CSP sandbox e disposição de conteúdo segura; caminhos e hashes físicos não aparecem no DTO público.

Allowlist inicial: JPEG, PNG, WEBP e GIF decodificados e regravados como PNG sem metadados, com limite de16milhões de pixels e tamanho. GIF é exibido pelo primeiro frame. TXT exige UTF-8 válido, sem controles binários ou marcação ativa; somente download, nunca inline. Extensão precisa corresponder ao conteúdo real. SVG, HTML, executáveis, PDF, Office e arquivos compactados não estão liberados. Não há alegação de antivírus ou scanner corporativo inexistente. Evoluir a allowlist exige validadores adequados.

Limite padrão10MB por arquivo e10 anexos por chamado, configurável com ATTACHMENT_MAX_BYTES/ATTACHMENT_MAX_COUNT nos intervalos documentados em `.env.example`. Upload tem rate limiting por identidade. Falha transacional remove somente o arquivo recém-criado; falha de remoção deixa órfão protegido para reconciliação. Credenciais ou arquivos de outros diretórios nunca são alvos.

Limpeza manual local: `npm run attachments:cleanup:dev --workspace @helpdesk/backend`. Recusa produção/outros bancos. Remove somente arquivos UUID.bin não referenciados, com mais de24h, dentro do armazenamento privado. Não foi executada sobre arquivos reais do desenvolvimento nesta entrega. Imagens têm miniatura, ampliação e fallback de erro; downloads no React podem renovar a sessão antes de buscar o conteúdo.

Biblioteca local acrescentada: sharp0.35.5, Node24 compatível. Decodificação e remoção de metadados seguem sua [documentação oficial](https://sharp.pixelplumbing.com/api-output/); nenhuma CDN ou instalação global.

## Calendários e métricas

Jornadas versionadas, intervalos múltiplos, exceções por data, folgas e fuso IANA explícito. O PostgreSQL converte cada intervalo local com [AT TIME ZONE](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-ZONECONVERT). Interseções consideram limites de cada segmento/versionamento; noites, almoço, pausas e folgas não contam. Na transição de horário de verão aplica-se a interpretação nativa do PostgreSQL para o fuso. Sem substituição por diferença corrida de relógio.

Métrica A: abertura até agora/encerramento. B: primeiro início até agora/encerramento, NULL antes do início. Períodos com snapshot countsTowardSolution=false são descontados somente dentro das janelas úteis; sobreposições são unidas para não duplicar desconto. Pendências true continuam contando. Mudanças futuras de calendário abrem novos segmentos e preservam os anteriores.

Lacunas de cobertura retornam valor desconhecido, sem completar retroativamente. Um chamado legado aberto antes da configuração do calendário poderá ter B e SLA válidos após início, mas A incompleta; seu fechamento permanece bloqueado até uma política explícita de saneamento histórico, fora desta tarefa. Não há exceção administrativa que invente o passado.

Fechamento exige solução, RESOLVED, cobertura de A/B completa e ausência de pendência ativa. Congela snapshot com engineVersion1, asOf UTC, totais inteiros em segundos e IDs dos segmentos/períodos usados. Encerra o segmento ativo, grava closedAt/closedById e evento na mesma transação. Falha de auditoria desfaz tudo. O banco protege métricas finais e alterações posteriores de CLOSED. Legado encerrado sem snapshot final não ganha métricas fictícias.

## SLA

Configuração controlada inicial LOW2400min, MEDIUM960min e HIGH480min úteis. Cada edição cria uma política imutável; não altera vínculos existentes. A classificação vincula versão/meta com startedAt NULL. O primeiro início ativa a contagem. Mudança posterior de prioridade termina a revisão anterior e cria outra, reiniciando o orçamento útil. Mudanças anteriores ao primeiro início não antecipam o relógio. Classificação sem mudança efetiva não cria duplicação nem reinicia SLA.

Classificações legadas anteriores ao módulo não possuem política recuperável: se iniciadas somente após a implantação, vinculam a versão vigente no próprio início, com referência no evento ATTENDANCE_STARTED, sem retroagir a data da classificação. Atendimentos já iniciados sem revisão histórica continuam com SLA desconhecido até uma mudança real de prioridade; não há backfill inventado.

A solução fecha o alvo SLA, congelando consumo e avaliação quando houver calendário completo. SLA e metas anteriores permanecem distintos de A/B, que continuam até CLOSED. Datas históricas e políticas não são reescritas. Não há SLA por simples horas corridas.

## Pendências

Motivo ativo e justificativa obrigatórios. O período guarda nome e flags em snapshot; edições ou desativação do cadastro não o alteram. Índice parcial impede dois períodos ativos; trigger protege histórico e sobreposições. Entrada, mudança de status e evento são transacionais. Retomada manual exige responsável; comentário/anexo novo e confirmado do próprio solicitante só retoma quando a flag histórica permite. Técnico, rascunho, falha de upload ou erro de auditoria não provocam retomada.

## Dashboard e interface

Dashboard ADMIN real usa os componentes ECharts modulares, MotionRegion, AnimatedNumber, estilos, temas e filtros existentes. Não carrega mocks. Agregações SQL filtram no backend; datas são UTC, intervalo inclusivo de dias, limitado tecnicamente a dez anos. Distribuições usam criação no intervalo; evolução usa separadamente criação/solução/encerramento na data correspondente, preservando filtros organizacionais e operacionais. Empresas/setores usam snapshots; “Não informado” representa legado. Identidades de entidades evitam juntar empresas/técnicos homônimos.

Cards de SLA avaliam soluções confirmadas, distinguindo sem avaliação histórica completa. Médias incluem somente métricas finais congeladas, não tempos de chamados em andamento. O detalhe do chamado mostra saldo útil e revisões SLA em andamento. O laboratório e seus gráficos continuam separados, sem assumir persistência real.

Configuração: ADMIN → Gestão de usuários → SLA e pendências. Jornadas em Expedientes. Conversa/solução/pendência e métricas reutilizam o detalhe autorizado; ADMIN abre detalhe pela visão global para supervisão e fechamento, sem poderes técnicos adicionais. Cadastro próprio, troca inicial, sessões e perfil anteriores permanecem.

## Migrations e validação

`20261030101000_comunicacao_solucao`: RESOLVED, comentários, anexos, solução e proteções. `20261030110000_sla_pendencias_metricas`: políticas, revisões, motivos, períodos, métricas finais e imutabilidade. Ambas aditivas, SQL revisado e reproduzido primeiro em helpdesk_test, com backup verificável anterior à aplicação em helpdesk_dev. As quatro migrations anteriores não foram reescritas ou reaplicadas.

Homologação visual dos BLOCOS 04/05/06 pendente por indisponibilidade da ferramenta de navegador. A continuação autorizou testes alternativos e prosseguimento: HTTP real, PostgreSQL isolado, componentes React renderizados, contratos, segurança, tipos, lint, formatação, builds e inspeção dos estilos. Não há alegação de teste visual desktop/mobile ou de animação observada nesta execução. Resultado final: **347 testes aprovados: 42 unitários backend, 212 integrações PostgreSQL e 93 frontend**. Typecheck, lint, formatação, builds, Prisma e diff aprovados. Seis migrations com checksums iguais ao banco, diff estrutural vazio; backups com SHA256 conferidos. Inventário completo e evidências no relatório local.

Fora do escopo: transferência, reabertura, correção retroativa de datas, notificações/e-mail, autenticação alternativa, exclusão/retention de contas, upload de avatar, projetos persistidos, editor completo de formulários e deploy. Entrega corporativa exige HTTPS e homologação da política/armazenamento de arquivos, sem desativar proteções locais.

Atualização autorizada: [refinamento de chat, solução única, administração e catálogo](32-refinamento-chat-solucao-e-catalogo.md). A conversa real utiliza SSE, a solução finaliza o SLA em RESOLVED e a interface operacional não oferece encerramento como segunda ação. O histórico técnico e CLOSED permanecem preservados.

## Data limite de solução apresentada no Chamado

O cartão Atendimento mostra a data e hora limite e a meta da revisão vinculada. A contagem começa no primeiro atendimento ou na mudança de prioridade que abre uma revisão já iniciada. Antes disso, a interface explica que ainda não há um marco de início.

O servidor mede as janelas úteis do período do SLA nos segmentos versionados, desconta as pausas que não contam e projeta o saldo sobre a versão aplicável para o futuro. O prazo pode ser calculado quando a lacuna está somente antes do início do SLA, mesmo que a métrica A ainda esteja incompleta. A projeção respeita fuso, intervalos da jornada e exceções por data. Quando a meta já foi atingida, o prazo é o instante em que o orçamento útil se esgotou nas janelas medidas.

Jornada ausente, lacuna dentro do período do SLA, configuração inválida, suspensão e falta de política têm mensagens distintas. As projeções são somente leitura e mantêm as referências e métricas históricas.

As ações disponíveis ficam no cartão Atendimento. O técnico responsável pode iniciar o chamado já atribuído, colocar em pendência, retomar e adicionar solução conforme o estado. Em RESOLVED, o responsável ou ADMIN autorizado pode confirmar o encerramento se as métricas históricas estiverem completas. O histórico paginado fica em seção própria do detalhe.

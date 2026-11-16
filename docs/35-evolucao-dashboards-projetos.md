# Evolução final da v1.0 pessoal

> Registro da entrega anterior. A limitação de Projetos a solicitação/consulta foi substituída pela aprovação D1–D8 e pelo [workflow vigente](37-workflow-projetos.md).

## Decisões vigentes

Esta etapa substitui a exclusão anterior dos dashboards próprios e de Projetos. ADMIN mantém o dashboard analítico; TECHNICIAN tem indicadores de sua carteira e contagem de disponibilidade da triagem; REQUESTER tem indicadores exclusivamente de seus chamados.

Para Projetos, o responsável decidiu: **manter apenas solicitação e consulta até decidir o fluxo**. Não há autorização de distribuição, execução, estados, etapas, tarefas ou aprovação financeira. REQUESTED identifica o evento de recebimento; não foi criado um status persistente de execução. O protótipo do laboratório continua separado e não representa a implementação real.

## APIs e permissões

- GET /dashboard/me: dashboard.personal, REQUESTER/TECHNICIAN; ticketScope limita agregações, últimos chamados, eventos e revisões de SLA. ADMIN mantém GET /admin/dashboard.
- GET /tickets/:id/operational: tickets.overview, ADMIN/TECHNICIAN; mesma projeção operacional já aprovada. Não retorna assunto, descrição, respostas, chat, snapshots ou anexos. Leitura completa continua limitada pelo escopo de tickets.read.
- POST /projects: projects.request, somente REQUESTER. Título, objetivo e necessidade; identidade obtida da sessão. Registro e evento REQUESTED na mesma transação.
- GET /projects: projects.read, REQUESTER nos próprios e ADMIN global; busca parcial no título/objetivo, paginação PostgreSQL e ordenação determinística.
- GET /projects/:id e /projects/:id/history: mesmo ownership; TECHNICIAN não recebe acesso por presunção.

Payloads estritos Zod, CSRF nas escritas, limites de requisição, sessão ativa e troca inicial concluída continuam obrigatórios. Solicitante não escolhe técnico.

## Persistência de solicitações

Migration aditiva 20261104150000_solicitacoes_projetos: project_requests e project_request_events. Código PR independente do código HD; sem vínculo com chamados. FKs RESTRICT, índices de consulta e triggers de imutabilidade. Registros não possuem status de execução, responsável técnico nem percentual de andamento. Atualização e exclusão não são expostas.

## Navegação e retirada

O número na aba Todos abre o atendimento próprio ou a ficha operacional permitida. Excluir com lixeira reutiliza a retirada global: justificativa obrigatória, ADMIN ou técnico responsável, auditoria e preservação integral do registro. O novo nome não transforma a operação em DELETE físico.

## Visualizações e movimento

ECharts mantém instância e identidade de séries/categorias, utiliza setOption com merge e remoção das séries/eixos obsoletos. UniversalTransition é registrado no build modular. Rosca e rose preservam geometria; transições incompatíveis não prometem morphing perfeito. A tabela acessível permanece disponível.

ScrollTrigger é aplicado aos blocos de MotionRegion, com contexto React e limpeza. O movimento reduzido desativa efeitos. Nenhuma dependência adicional, scroll-jacking ou suavização global interfere no chat. A navegação interna reutiliza o mecanismo existente de rolagem suave e respeita movimento reduzido.

## Calendários, solução e métricas

A API de métricas distingue ausência total de segmentos, lacuna na cobertura e cobertura completa; informa se há calendário aplicável para novos períodos e se a solução tem snapshot mensurável. Soluções antigas sem snapshot não são reconstruídas por estimativa. O painel exibe os tempos até a solução quando o snapshot é completo, separadamente de A/B finais de CLOSED.

Para chamados futuros, configure em Central Administrativa → Expedientes uma versão com fuso, períodos e exceções; associe um padrão da organização ou um expediente à empresa e aos técnicos. Antes do primeiro atendimento, o calendário vem da empresa do solicitante ou do padrão organizacional; após iniciar, usa o expediente direto do técnico, o da empresa do técnico ou o padrão, nessa ordem. Configuração posterior vale para períodos futuros e não preenche lacunas antigas.

No diagnóstico local somente leitura desta etapa, 10 de 11 chamados não tinham segmentos e o único restante tinha cobertura apenas da abertura até o início. Não existia padrão organizacional. Nenhum calendário, usuário, chamado ou métrica existente foi alterado para produzir resultados.

SLA finaliza na solução efetiva validada; A/B finais permanecem de encerramento. As políticas iniciais são LOW 40h, MEDIUM 16h e HIGH 8h úteis. A ausência de cobertura nunca equivale a zero minutos ou meta cumprida.

## Limites e aceite

Projetos: solicitação, consulta, histórico auditável e indicadores de quantidade, sem andamento fictício. Funcionalidades de execução dependem de nova decisão. Ocorrências Compartilhadas continuam canceladas. Nenhum commit, push, release ou deploy faz parte desta etapa.

# Projetos — anexos privados reais (Etapa B1)

Complementa os [formulários reais](38-formularios-reais-projetos.md) e o [workflow](37-workflow-projetos.md). A restrição de publicação de FILE obrigatório da Etapa A foi substituída pelo fluxo seguro desta etapa. A implementação B2 acrescenta anexos separados para mensagens da conversa de Projetos; eles usam a mesma raiz privada da entidade Projeto, com metadados, autorização e ciclo de vida próprios.

## Fluxo

ADMIN pode publicar campos FILE opcionais, obrigatórios e condicionais no editor de categoria. Solicitante escolhe categoria/versão publicada, envia arquivos pelo campo e recebe confirmação do upload privado. Pode remover ou substituir antes de criar. O envio do projeto fica bloqueado enquanto há upload/remoção em andamento. O servidor revalida os campos visíveis, a obrigatoriedade e cada ID de arquivo antes de persistir a solicitação.

Upload temporário vale 24 horas e pertence exatamente ao solicitante, categoria, versão, campo/ID lógico. Até dez temporários ativos por usuário e 10 MB por arquivo. Aceitos os mesmos formatos de Chamados: JPEG, PNG, WEBP, GIF e texto UTF-8. Imagens são decodificadas/reencodificadas como PNG, removendo metadados e payloads extras; GIF usa primeiro quadro. A extensão, assinatura/decodificação e conteúdo são validados pelo mesmo validateAttachment. MIME informado pelo navegador não concede permissão. HTML, SVG, executáveis e formatos não suportados são recusados; texto não é renderizado inline.

Na criação, IDs são verificados contra usuário, categoria, versão, campo e validade. Claim é único e transacional com pedido, snapshot, respostas, auditoria e idempotência. Falha não deixa arquivo reivindicado por um pedido inexistente; os bytes temporários permanecem disponíveis para repetir ou descartar. Campo oculto por condição não é obrigatório nem reivindicado. Não é possível reutilizar arquivo já associado a outro projeto, de outro usuário ou de outro formulário.

Cancelar a abertura/trocar categoria solicita descarte dos temporários conhecidos. Arquivos não descartados por falha de conexão ou campos ocultos expiram e são elegíveis para manutenção. Falha na persistência do upload remove somente o blob recém-criado; eventual falha de remoção deixa órfão privado elegível para a limpeza protegida.

## Armazenamento e manutenção

Reutiliza AttachmentStorage, SHA-256 e validação de Chamados. Os arquivos de Projetos ficam em **.local/storage/project-attachments**, separados de **.local/storage/attachments**. Isso impede que a rotina de órfãos de Chamados remova arquivos de Projetos. Nenhum diretório privado é servido por Vite/public.

Metadados ficam em project_attachments. project_attachment_events preserva upload, descarte, claim, download e expiração. Arquivos reivindicados e eventos são imutáveis no banco. O evento de download só é registrado após autorização e leitura/hash dos bytes; arquivo indisponível produz 503 sem registrar download concluído. Sem exposição de caminhos/chaves físicos nas respostas.

Manutenção local opcional, com destino conferido pelo mesmo guard de desenvolvimento:

```powershell
# Somente análise dos temporários expirados.
node --import tsx apps/backend/scripts/clean-project-attachment-orphans.ts
# Aplicação explícita: expirados não reivindicados e órfãos antigos, só no diretório de Projetos.
node --import tsx apps/backend/scripts/clean-project-attachment-orphans.ts --apply
```

Limpeza bloqueia linhas expiradas não reivindicadas, registra evento e remove seus metadados; usa SKIP LOCKED para não interferir na criação concorrente. Órfãos sem referência só são removidos após 24 horas, respeitando nome canônico, arquivo regular, raiz privada e proteção contra symlink da classe existente. A rotina une as referências de anexos de abertura e de mensagens para que uma limpeza de temporários de um fluxo não remova os bytes referenciados pelo outro. Arquivos de chamados e anexos históricos de projetos não são alvos da rotina.

## API e permissões

| Método/rota                                                                            | Uso                                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| POST /projects/opening-uploads?categoryId=UUID&versionId=UUID&fieldKey=CHAVE&name=NOME | REQUESTER, binário application/octet-stream sem compressão, CSRF, limite e rate limit |
| DELETE /projects/opening-uploads/:fileId                                               | REQUESTER dono; somente temporário não reivindicado; CSRF                             |
| GET /projects/:id/attachments                                                          | Lista autorizada, sem storageKey/hash/caminho                                         |
| GET /projects/:id/attachments/:fileId                                                  | Download autenticado com autorização atual                                            |
| GET /projects/:id/attachments/:fileId?preview=true                                     | Inline somente para PNG sanitizado; demais continuam download                         |

REQUESTER lê apenas seus projetos, TECHNICIAN apenas os atribuídos atualmente, ADMIN possui acesso administrativo explícito. Sessão e conta são revalidadas; o UUID do arquivo não é autorização. Substituir responsável impede novos downloads pelo técnico anterior. Material que já tenha sido legitimamente baixado não pode ser apagado retroativamente do computador do destinatário.

Downloads usam no-store, nosniff, política same-origin e CSP sandbox/default-src none. A interface carrega imagens de forma autenticada com URL de blob revogada ao desmontar; oferece miniatura, ampliação e download. Nome, tamanho e rótulo histórico do campo ficam visíveis. A ação de baixar/ampliar consulta novamente o backend. Não há URLs com tokens nem armazenamento de credenciais no navegador.

## Compatibilidade e validação

Migration aditiva 20261108160000_anexos_projetos acrescenta project_attachments e project_attachment_events, sem modificar migrations anteriores. Modelos Prisma correspondentes, FKs de categoria/versão/projeto/usuário, índices, limites e trigger de claim/imutabilidade. Projetos anteriores sem anexos retornam lista vazia; snapshots e respostas existentes não são reescritos. Planos, responsáveis, execução e progresso D1–D8 permanecem.

Testes PostgreSQL isolados cobrem obrigatoriedade condicional, arquivos inválidos/acima do limite, ownership/IDOR, substituição do técnico, expiração, versão histórica, concorrência, falha de auditoria e recuperação segura. A regressão inclui formulários, workflow e uploads de Chamados. Evidências, contagens efetivamente executadas e limites da homologação visual ficam em .local/evolucao/checkpoint-projetos-anexos.md.

## Conversa operacional de Projetos — Etapa B2

A conversa persiste em `project_conversation_messages`, separada de `ProjectWorkflowUpdate`, eventos de auditoria e versões do plano. `ProjectConversationAttachment` tem vínculo opcional temporário e vínculo imutável à mensagem após claim; os eventos de arquivo são append-only. A migration aditiva `20261108200000_conversa_projetos` não modifica as tabelas B1 nem migrations anteriores.

| Método/rota                                                     | Uso                                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| GET /projects/:id/conversation?page=&pageSize=                  | Histórico cronológico paginado; máximo de 50 por página                            |
| GET /projects/:id/conversation/stream                           | SSE autenticado por cookie; envia invalidação `sync`, com reconexão pelo navegador |
| POST /projects/:id/conversation/messages                        | Mensagem idempotente com `clientMessageId` e IDs dos anexos temporários            |
| POST /projects/:id/conversation/attachments?name=               | Upload temporário binário, até 10 MB, limitado por taxa                            |
| DELETE /projects/:id/conversation/attachments/:fileId           | Descarte de rascunho do próprio autor                                              |
| GET /projects/:id/conversation/attachments/:fileId?preview=true | Download autorizado; inline apenas PNG sanitizado                                  |

REQUESTER participa somente de seu próprio projeto; TECHNICIAN somente do projeto sob responsabilidade atual; ADMIN participa pela permissão explícita `projects.conversation`. O servidor repete a verificação de sessão e do escopo por leitura, escrita, upload, download, prévia e SSE. O stream revalida o token e o escopo a cada 1,5 s; substituição do responsável encerra a conexão e impede novas consultas do técnico anterior. O conteúdo dos frames SSE é apenas invalidação, sem mensagem ou anexo embutido, e cada atualização é carregada por REST com autorização. PostgreSQL fornece a revisão observada, inclusive entre instâncias.

Mensagens usam idempotência persistida por projeto/autor/`clientMessageId`; reuso com payload ou anexos diferentes retorna conflito. O serviço bloqueia a linha do projeto antes de verificar a autorização de escrita, serializando-se com substituição de responsável. COMPLETED e CANCELED permitem leitura, mas não novas mensagens/uploads. O componente de conversa dos Chamados é reutilizado sem habilitar solução/alteração do workflow de Projetos. Anexos de mensagem têm tabela e eventos próprios e não se confundem com campos de arquivo do formulário.

Testes de implementação, endpoints, troca de responsável, SSE entre instâncias, isolamento de projetos, idempotência, anexos e compatibilidade ficam registrados em `.local/evolucao/checkpoint-projetos-chat-sse.md`.

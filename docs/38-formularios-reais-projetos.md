# Categorias e formulários reais de Projetos — Etapa A

Evolução posterior: [Etapa B1 — anexos privados reais](39-anexos-privados-projetos.md) remove a restrição histórica de FILE obrigatório descrita nesta entrega da Etapa A. Chat/SSE permanecem fora da B1.

Evolução autorizada em 08/11/2026. Complementa o [workflow D1–D8](37-workflow-projetos.md) sem alterar responsáveis, planos, atividades ou progresso. A autorização anterior de anexos e conversa permanece registrada, mas sua implementação é a Etapa B e não faz parte desta entrega.

## Administração

ADMIN → Central Administrativa → Formulários de Projetos. Categorias têm UUID estável, chave de referência opcional, nome, descrição, situação e revisão. O catálogo é separado de ServiceCategory/ServiceFormVersion de Chamados. A ação de cadastrar referências cria apenas categorias ausentes; não sobrescreve nomes, descrições, situação ou formulários personalizados. Correspondência ambígua é preservada e reportada.

Referências aprovadas: Desenvolvimento de software; Análise de Dados / Business Intelligence; Infraestrutura de rede; Automações de processos; Integração entre sistemas; Segurança da informação; Melhorias tecnológicas. Chaves: software, bi, network, automation, integration, security, improvement. Campos e tipos derivam da referência normalizada, confrontada com a prévia por testes. Não há opções ou condições iniciais inventadas. Objetivo e necessidade conservam obrigatoriedade do contrato de criação; demais campos iniciais opcionais.

O editor compartilhado permite rascunho, ordem, tipos, opções, obrigatoriedade, condições declarativas, prévia, publicação e consulta de versões. A API de Projetos usa o mesmo editableFormSchema: chaves e IDs únicos, opções distintas e dependência de campo anterior. Rascunhos usam expectedRevision; alteração concorrente retorna 409. Publicações são imutáveis no PostgreSQL e criam versão crescente. A publicação exige um rascunho salvo ainda não publicado.

FILE opcional permanece como definição para a próxima etapa, identificado como indisponível na abertura. **Publicar FILE obrigatório é recusado.** A API não aceita nome/ID de arquivo simulado como resposta válida. Anexos de Chamados continuam funcionando independentemente.

## Solicitação e compatibilidade

Solicitante → Projetos → Solicitar projeto → categoria ativa → formulário publicado → envio. Categoria ou versão desatualizada resulta em conflito e exige nova seleção. O backend valida tipos, obrigatoriedade, opções e condições; respostas ocultas são removidas, e campos desconhecidos são recusados. Os campos originais título/objetivo/necessidade e suas validações são preservados.

POST /projects aceita adicionalmente `form: {categoryId, versionId, answers}`. A chave clientOperationId continua obrigatória. O objeto adicional participa do hash de idempotência. Pedido, evento original, submissão e resultado idempotente são persistidos na mesma transação; falha desfaz tudo. O formulário e as respostas são registrados em uma relação separada, sem modificar a solicitação original imutável.

Consumidores anteriores podem continuar enviando o contrato básico sem form. A interface atual exige categoria e versão publicada. Projetos anteriores sem submissão permanecem acessíveis, com indicação de ausência histórica; não há backfill de respostas. A leitura da submissão é autorizada por autor/responsável atual/ADMIN, conforme o mesmo escopo do workflow. Categoria inativa deixa de aparecer em novas solicitações, mas não oculta snapshots anteriores.

O detalhe mostra a categoria, versão, rótulos históricos e respostas persistidas. Publicar nova versão não modifica snapshots nem respostas antigas. Histórico técnico, versões do plano e atualizações formais permanecem separados do formulário da solicitação.

## APIs

| Método/rota | Permissão |
| --- | --- |
| GET /projects/categories | Três perfis autenticados; não ADMIN recebe somente ativas com versão publicada |
| POST /projects/categories | ADMIN |
| PATCH /projects/categories/:id | ADMIN, expectedRevision |
| POST /projects/categories/bootstrap | ADMIN, corpo vazio, cadastro idempotente |
| GET /projects/categories/:id/form | Leitura; versão histórica por query version somente ADMIN |
| PATCH /projects/categories/:id/form/draft | ADMIN, expectedRevision/definition |
| POST /projects/categories/:id/form/publish | ADMIN, expectedRevision |
| GET /projects/:id/submission | Autor, responsável atual ou ADMIN; null para legado |

Rotas administrativas usam o grant explícito projects.assign (ADMIN) e validação transacional do ator/sessão; consultas usam projects.workflow-read e ownership quando cabível. CSRF, cookies HttpOnly e revogação permanecem. A interface administrativa /admin/usuarios/projetos não deve ser confundida com /admin/projetos; a seleção de página operacional usa caminho ancorado.

## Persistência e operação local

Migration aditiva 20261108120000_formularios_projetos: project_categories, project_category_drafts, project_category_versions, project_form_submissions e project_catalog_events. FKs RESTRICT, unicidade de referência/nome normalizado e versão, vínculo composto categoria/versão e triggers de imutabilidade. Nenhuma migration histórica alterada.

Procedimento opcional de cadastro inicial, **somente no desenvolvimento confirmado**, após aplicação incremental e backup verificável:

```powershell
node --import tsx apps/backend/scripts/sync-development-project-categories.ts
node --import tsx apps/backend/scripts/sync-development-project-categories.ts --apply --backup=.local/backups/ARQUIVO_VERIFICADO.dump
```

O primeiro comando analisa sem gravação. O segundo valida destino helpdesk_dev/public e backup customizado/SHA-256 dentro de .local/backups; usa ADMIN ativo elegível para autoria dos eventos de cadastro inicial, sem criar login ou alterar credenciais. Iniciador do CLI é distinguido no resumo de execução. Não executar em produção. A API de bootstrap usa sessão administrativa normal e não permite habilitar o modo CLI por payload.

Testes direcionados e resultados locais estão no checkpoint-projetos-formularios-reais.md. A Etapa B deverá integrar uploads privados, reivindicação/expiração, download autorizado e chat/SSE; não é automaticamente iniciada por concluir esta etapa.

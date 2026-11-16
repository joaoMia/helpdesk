# Refinamento integrado — chat, solução, administração e catálogo

> Registro de desenvolvimento. Para regras e escopo atuais, consulte o [contrato vigente da v1.0](v1-contrato.md).

Implementação autorizada pelo responsável em 30/10/2026 e sua retomada final. Complementa os [BLOCOS 05/06](31-atendimento-tempos-e-sla.md), sem substituir a arquitetura ou homologar tarefas futuras. Nenhum commit, push ou deploy nesta execução.

## Conversa em tempo real

O detalhe autenticado apresenta conversa por mensagens, com autor, horário, separadores de data, alinhamento por identidade, anexos, estados de envio/erro e rolagem local. A timeline técnica foi retirada dessa interface. TicketEvent e os endpoints autorizados de histórico permanecem íntegros; eventos operacionais não são convertidos em mensagens.

`GET /tickets/:id/conversation/stream` usa SSE, cookies HttpOnly e os mesmos controles de origem/CORS/autenticação/ownership. O frame `sync` carrega somente uma invalidação sem conteúdo privado. O cliente consulta as páginas autorizadas de `/conversation`, ordena e deduplica por ID. Toda conexão nova ressincroniza o PostgreSQL, recuperando também mensagens perdidas durante desconexão; não depende de replay em memória ou de afinidade com uma instância.

ADMIN e TECHNICIAN ativos leem o detalhe, histórico, conversa e anexos vinculados de Chamados não retirados, independentemente de atribuição. Ambos podem enviar mensagens e anexos em OPEN, IN_PROGRESS e PENDING, inclusive antes do início do atendimento. REQUESTER participa dos próprios Chamados nesses estados. RESOLVED/CLOSED são somente leitura. Solução, pausa e retomada continuam limitadas ao responsável, e as agregações de TECHNICIAN à carteira atribuída.

Cada instância consulta a revisão persistida no PostgreSQL a cada 1,5 segundo. Assim uma gravação por outro processo também produz atualização; o custo de consultas por conexão deverá ser medido antes de ampliar o número de usuários. Não há broker externo nem dependência exclusiva de um EventEmitter local. A identidade, JWT, sessão, atividade, troca inicial, perfil e escopo são revalidados nesse ciclo. Revogação encerra a conexão no próximo ciclo, sujeita à disponibilidade do banco. Falha fecha o fluxo sem enviar mensagens. Há limite de oito conexões por usuário/processo, heartbeat e encerramento de consumidor lento. A limitação de conexões HTTP/1 do navegador também se aplica.

O cliente fecha EventSource ao sair da tela/trocar de usuário, cancela a reconexão pendente e ignora respostas de escopos anteriores. Na reconexão utiliza o fluxo existente de renovação de sessão; nenhum token vai na URL ou no storage. Confirmação de mensagem ocorre somente após persistência. O compositor mantém em memória um clientMessageId UUID por tentativa lógica; o backend verifica essa chave dentro da transação e devolve a mensagem já confirmada quando o mesmo conteúdo e vínculos são repetidos. Chave reutilizada com payload diferente recebe409. Em concorrência, a transação impede duas mensagens/eventos para a mesma chave. Não há retry automático de escrita; em falha de transporte inconclusiva a interface orienta consultar a conversa antes de reenviar. Reenvio de anexos com outros IDs não é associado silenciosamente a uma mensagem anterior. O bloqueio de envio em andamento evita clique/Enter duplicados. Textos iguais enviados intencionalmente em operações distintas continuam sendo mensagens distintas.

Referência de protocolo: [Server-Sent Events / MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events). Em futura hospedagem Linux, manter cookies HTTPS, proxy sem buffering para SSE, timeout compatível com heartbeat e armazenamento privado compartilhado entre as instâncias que servem arquivos. Isso não foi apresentado como implantação já validada.

## Anexos no compositor

Os arquivos são selecionados e removidos localmente antes do envio. Durante a operação, `POST /tickets/:id/attachments?name=...&draft=true` cria rascunho privado. A transação de comentário/solução vincula os IDs autorizados e remove a marca de rascunho atomicamente. O rascunho não aparece na conversa nem pode ser baixado pelo outro participante antes dessa confirmação. Upload em rascunho não retoma uma pendência; a mensagem confirmada poderá fazê-lo conforme o snapshot do motivo.

`DELETE /tickets/:id/attachments/:fileId/draft` permite descartar somente rascunho próprio, ainda sem comentário/solução, com autenticação, CSRF e escopo. Não exclui anexos históricos ou já vinculados. Falha no envio tenta limpar somente os rascunhos próprios; uma resposta perdida após sucesso não permite apagar arquivos já vinculados. Abandono/falha de limpeza mantém conteúdo privado, reconciliável pelo comando existente `attachments:cleanup:dev`, que agora também descarta rascunhos não vinculados com mais de 24h. Esse comando não foi executado sobre arquivos de desenvolvimento durante a validação.

A migration `20261030150000_chat_rascunhos` acrescenta apenas `ticket_attachments.is_draft`, obrigatório com default false, e uma constraint impedindo rascunho vinculado. Anexos antigos mantêm visibilidade, IDs e relacionamentos. As seis migrations anteriores não foram modificadas.

Miniaturas e ampliação usam o download autenticado de imagens reprocessadas; documentos permitidos apresentam nome, tamanho, ícone e download. Continua válida a allowlist conservadora JPEG/PNG/WEBP/GIF regravados como PNG e TXT UTF-8 simples. PDF/Office/SVG/HTML/executáveis/compactados não são liberados por esta tarefa. Limites e proteções existentes de tamanho, conteúdo, ACL, SHA256, origem, CSRF e armazenamento fora do Vite permanecem.

## Solução única e temporalidade

A interface operacional oferece somente **Adicionar solução**. Técnico responsável, descrição obrigatória, IN_PROGRESS e anexos próprios são revalidados no backend. Solução, autor/data, vínculos, evento e RESOLVED são transacionais; concorrência ou falha de auditoria não deixa resultado parcial.

O SLA de solução termina no instante de RESOLVED, com política e resultado preservados na revisão. LOW40h/MEDIUM16h/HIGH8h úteis, primeiro início como marco inicial e reinício por nova prioridade continuam vigentes. Não há substituição por horas corridas ou retroatividade.

Uma medição A/B no instante da solução é preservada em `SOLUTION_ADDED.newValue.solutionMetrics` e devolvida opcionalmente em `GET /tickets/:id/metrics`. É distinta dos indicadores finais de CLOSED. Quando faltam calendários históricos, os valores desconhecidos permanecem NULL e `complete=false`; não se inventa cobertura para permitir solução ou fechamento. Eventos anteriores sem essa medição não são reescritos.

Após a solução, o cartão Atendimento oferece **Encerrar chamado** em RESOLVED ao técnico responsável ou ADMIN autorizado. A confirmação usa `POST /tickets/:id/close` e as validações de métricas. A/B oficiais continuam com sua semântica até encerramento definitivo. `finalMetrics` de CLOSED permanece imutável. Envio de mensagens e upload são bloqueados em RESOLVED e CLOSED.

## Administração

Usuários concentra REQUESTER, TECHNICIAN e ADMIN, com filtro de perfil e os controles já autorizados. A aba duplicada Técnicos foi removida; `#/admin/usuarios/tecnicos` redireciona para Usuários. Endpoints de técnicos existentes foram preservados.

Empresa, Setor e Expediente são selects nativos, com todas as páginas autorizadas carregadas internamente, sem busca ou paginação expostas no formulário. Setor continua dependente da empresa; respostas antigas são ignoradas. Filtro de técnico do dashboard e categoria do formulário administrativo também carregam suas opções completas. Paginação real permanece nos rodapés das respectivas tabelas; catálogo com duas listagens possui um controle por listagem, não dois controles para a mesma tabela.

Alteração voluntária de senha fica em Meu perfil. Solicitante e técnico mantêm edição própria autorizada. ADMIN tem página própria somente leitura e acesso à troca de senha existente, sem introduzir edição de perfil administrativo. Troca inicial obrigatória, último ADMIN ativo, redefinição provisória, Argon2id e revogação de sessões permanecem.

## Catálogo inicial local

`npm run catalog:sync:dev` analisa sem gravar. Para aplicar, `npm run catalog:sync:dev -- --apply --backup=C:/dev/helpdesk/.local/backups/<arquivo-verificado>.dump`. A CLI recusa ambientes diferentes de development, destinos remotos, banco diferente de helpdesk_dev e schema diferente de public. Aplicação exige arquivo de backup no diretório privado esperado, assinatura de arquivo dump e SHA256 íntegro. A análise e a aplicação devem ser revisadas antes do uso; o backup desta execução também teve catálogo `pg_restore --list` conferido.

A referência de nomes/descrições/ordem/atividade foi extraída de `initialCatalog()`, contendo seis categorias e 16 serviços, sem campos demonstrativos. O snapshot de referência é testado contra a fonte original. Novos serviços recebem formulário básico versão1 sem campos adicionais.

Sincronização transacional, com lock sobre o catálogo, cria somente ausentes sem ambiguidade. Correspondências são normalizadas por caixa/acentuação/espaços, mas homônimos ou categoria conflitante são ignorados, sem sobrescrita. Mapeamentos de referência são guardados como eventos administrativos de sistema, permitindo preservar futuras renomeações e inatividade sem duplicar. Não há promoção de usuários, importação de chamados fictícios ou alteração dos registros existentes.

Execução real confirmada: cinco categorias de referência existentes; criada uma categoria e 16 serviços; nenhum conflito. Segunda execução:22 encontrados, zero criados e zero ignorados. Totais do banco: sete categorias e 17 serviços, incluindo os registros adicionais anteriores. Equipamentos legados permanece inativo. Existem 16 novos formulários básicos; nenhum campo personalizado da prévia foi importado. Dezesseis serviços no total estão disponíveis pelo filtro serviço ativo + categoria ativa, incluindo o serviço anterior ativo.

## Verificação e pendências

Resultados finais, inventário completo, checksums e roteiro manual ficam em `.local/refinamento/relatorio-final.md`. Testes usam exclusivamente namespaces descartáveis de helpdesk_test. O cadastro inicial é a única população controlada realizada em helpdesk_dev nesta retomada. Auditoria readonly após a carga confirmou os185registros anteriores inalterados.

Validação visual: ferramenta Windows interrompeu a sessão por não confirmar a URL com segurança; não houve contorno. Não se declara homologação visual desktop/mobile, dois temas ou animação observada. Foram utilizados testes de componentes/SSR, HTTP real/SSE e PostgreSQL isolado. Homologação manual permanece necessária. Não há novas dependências, mudanças de infraestrutura, estilos globais, stack, demonstrações, projetos ou módulos fora do refinamento.

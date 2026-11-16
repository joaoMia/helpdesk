# Continuidade controlada — chamados, administração e catálogo

> Registro de desenvolvimento. Para regras e escopo atuais, consulte o [contrato vigente da v1.0](v1-contrato.md).

As decisões explícitas desta continuidade substituem a funcionalidade experimental de Ocorrências Compartilhadas. Chamados, conversas, soluções e métricas permanecem individuais. Rotas, modelos do Prisma Client, contratos, telas, permissões e serviços coletivos foram removidos da aplicação. A migration histórica já aplicada e suas estruturas SQL vazias permanecem inativas; não houve exclusão destrutiva nem edição de migrations antigas.

## Operação e privacidade

A listagem técnica mostra categoria e serviço históricos, nome do solicitante, empresa e setor, além dos metadados operacionais e do responsável. Essa autorização não libera descrição, respostas, anexos, snapshots completos ou histórico privado de chamados alheios. A projeção mínima original continua disponível para os usos que não precisam desse contexto adicional.

Prioridade pode ser definida diretamente na lista por TECHNICIAN autorizado. A classificação continua restrita a OPEN livre, sem atribuição ou início de atendimento. Distribuição, início atômico e suas permissões permanecem separados.

`POST /tickets/:id/retirement`, com `{ reason }`, retira o chamado globalmente das consultas operacionais. Somente ADMIN ou o técnico efetivamente responsável podem executar a operação. `POST /admin/retirements`, exclusivo de ADMIN, aceita `{ kind, id, reason }` para chamado, categoria ou serviço. O backend revalida sessão, papel e vínculo dentro da transação. A retirada registra ator, instante e justificativa; não apaga o chamado nem altera status, snapshots ou eventos anteriores. Categorias retiradas tornam seus serviços indisponíveis. A retirada não oferece uma recuperação operacional nesta interface.

A migration aditiva `20261102150000_retirada_operacional` cria apenas `operational_retirements`, com chaves estrangeiras restritivas, um único alvo por registro e unicidade por recurso. Listas, contagens, detalhes, agregações, abertura, conversa e downloads aplicam o mesmo escopo de retirada. Não se trata de exclusão física.

## Usuários

`DELETE /admin/users/:id` exige ADMIN, CSRF e sessão válida. Só exclui conta sem referências ou sessões. O serviço bloqueia autoexclusão, protege o último ADMIN ativo e revalida vínculos e concorrência na transação. Contas com histórico recebem conflito e devem ser desativadas. O indicador `canDelete` da listagem é apenas informativo; não substitui a autorização no servidor. O evento administrativo permanece preservado.

A Central Administrativa concentra todos os perfis em Usuários. Empresa, setor e expediente usam seletores simples; setor depende da empresa selecionada. Cada listagem mantém sua própria paginação no rodapé. A alteração voluntária de senha permanece em Meu perfil, sem alterar o fluxo obrigatório inicial.

## Solução, datas e comunicação

A única ação operacional de conclusão é **Adicionar solução**. O técnico responsável pode informar `solvedAt` ao registrar a solução; quando ausente, vale o instante real do servidor. A data efetiva deve estar entre os marcos válidos do atendimento e o momento atual. Não pode anteceder início, classificação ou períodos aplicáveis de calendário, SLA e pendências. A validação não permite recalcular soluções históricas já finalizadas por essa rota.

A solução muda IN_PROGRESS para RESOLVED, preserva seus anexos e finaliza o SLA no instante efetivo validado. O registro e a auditoria continuam com o horário real do servidor e distinguem data efetiva de data de lançamento. As métricas A/B mantêm suas semânticas próprias; RESOLVED não vira CLOSED automaticamente. Lacunas históricas de calendário não são substituídas por estimativas.

O chat individual reutiliza SSE e PostgreSQL, cookies HttpOnly e CSRF nas escritas. Mensagens e arquivos só são confirmados após persistência. Reconexão e sincronização não dependem de memória de uma única instância. Anexos continuam privados, vinculados à mensagem ou solução, com prévia autenticada para imagens suportadas e download autorizado para documentos. A auditoria técnica não aparece como mensagem comum. A conversa acompanha a rolagem natural da página, com indicador de novas mensagens quando o usuário está lendo conteúdo anterior.

## Catálogo e formulários

O procedimento de sincronização de desenvolvimento preserva registros existentes, edições manuais, IDs, estados e snapshots. A opção `--forms` cria versões apenas para formulários básicos identificados sem ambiguidade; formulários já configurados são preservados. O serviço Equipamentos legados permanece inativo. A execução exige destino local de desenvolvimento e backup verificável.

**Criação de usuário aceita exatamente um sistema por chamado.** O formulário de referência utiliza `SELECT` obrigatório no campo `systems`. A publicação administrativa do serviço identificado pelo registro auditável de sincronização também exige essa cardinalidade, sem depender de nome mutável ou informação do navegador. Versões anteriores e respostas históricas permanecem imutáveis; a correção publica uma nova versão. O editor continua permitindo campos e condições declarativas e anexos obrigatórios com validação no backend.

O catálogo administrativo permanece exclusivo de ADMIN na navegação. REQUESTER consulta categorias e serviços dentro da abertura em quatro etapas; TECHNICIAN e REQUESTER não recebem página independente de catálogo. O laboratório demonstrativo permanece separado.

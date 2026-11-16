# Formulários dinâmicos — implementação incremental

> Registro de desenvolvimento. Para regras e escopo atuais, consulte o [contrato vigente da v1.0](v1-contrato.md).

Decisão posterior: Criação de usuário exige exatamente um sistema por chamado (`systems` obrigatório do tipo SELECT). A correção publica nova versão e conserva respostas e versões antigas; não altera outros campos configurados manualmente. Consulte a [continuidade controlada](34-continuidade-controlada.md).

## Administração e versões

No catálogo real, a ação **Formulário** abre o editor administrativo do serviço. Apenas ADMIN salva rascunhos e publica versões, usando a autorização `services.update`. Consultas ordinárias usam `services.read` e respeitam disponibilidade do serviço e da categoria.

- `GET /services/:id/form`: versão publicada mais recente; ADMIN também recebe rascunho e resumos históricos.
- `GET /services/:id/form?version=N`: consulta histórica exclusiva de ADMIN.
- `PATCH /services/:id/form/draft`: `{ expectedRevision, definition }`, com revisão inicial zero.
- `POST /services/:id/form/publish`: `{ expectedRevision }` do rascunho salvo.

Uma publicação cria nova versão e novos identificadores de campo, mantendo as chaves declarativas. A revisão do rascunho é monotônica; salvar ou publicar estado desatualizado retorna 409. Repetir publicação sem alteração não cria versão duplicada. O PostgreSQL protege versões publicadas contra alterações, inclusive antes do primeiro uso; os campos só podem ser construídos na transação que cria a versão.

O editor configura texto, texto longo, número, data, data/hora, e-mail, URL HTTP(S), seleção única/múltipla, checkbox e arquivo. Validações compartilhadas rejeitam chaves/IDs/opções duplicados, dependências inexistentes, referências futuras/cíclicas e combinações incompatíveis. Condições são declarativas; não há código executável configurável.

As referências da prévia podem ser carregadas explicitamente no rascunho. Esse carregamento não publica versões nem modifica registros de desenvolvimento automaticamente. A prévia continua separada de respostas e chamados reais.

## Abertura em quatro etapas

Categoria → Serviço → Formulário → Revisão usa a definição publicada real. Revisão e confirmação compartilham a montagem do payload com respostas e `formVersionId`. O servidor valida novamente os campos visíveis, obrigatoriedade e tipos, descarta respostas de campos ocultos e preserva o snapshot completo. Uma nova publicação entre preenchimento e envio retorna `FORM_CHANGED` (409), exigindo revisão dos campos.

## Arquivos anteriores ao chamado

- `POST /tickets/opening-uploads?serviceId=UUID&formVersionId=UUID&fieldKey=CHAVE&name=NOME`: corpo binário `application/octet-stream`, cookies e CSRF obrigatórios; somente REQUESTER.
- `DELETE /tickets/opening-uploads/:id`: descarte pelo próprio solicitante antes da abertura.

O upload usa a validação binária e o armazenamento privado existentes. Aceita imagens suportadas reprocessadas para PNG e texto UTF-8 seguro, até 10 MB por arquivo e dez arquivos pendentes por usuário. Não aceita SVG, HTML, executáveis ou formatos não homologados. Não há URL pública nem download direto de arquivos em estágio.

Cada registro temporário pertence ao solicitante, serviço, versão publicada e campo FILE, com validade de 24 horas. A resposta contém somente ID, nome tratado, MIME, tamanho e expiração. O formulário envia uma lista desses IDs na resposta do campo.

A transação de abertura bloqueia e revalida os uploads, cria chamados/respostas/anexos confirmados e remove os registros temporários reivindicados. Mantém o ID do arquivo na resposta histórica. Falha de auditoria reverte todas as gravações; o arquivo continua disponível no estágio. Reutilização, expiração, duplicação, outro proprietário/campo/serviço/versão são rejeitados. Cliques concorrentes usando o mesmo arquivo não criam dois chamados.

A manutenção autorizada de órfãos inclui os estágios expirados. Arquivos ainda referenciados por estágios válidos ou anexos históricos permanecem protegidos. Falhas de remoção física deixam somente órfãos privados para reconciliação posterior.

## Limites da entrega incremental

Na validação de navegador, um ADMIN publicou a versão 2 de um formulário com arquivo obrigatório; um solicitante preencheu as quatro etapas, recebeu o bloqueio por arquivo ausente e abriu o chamado após upload privado. Respostas, versão e anexo persistiram após F5. Todas as gravações dessa validação ocorreram em namespace descartável de helpdesk_test. Os testes PostgreSQL também verificam a imutabilidade do snapshot anterior após nova publicação. A homologação final do responsável permanece necessária.

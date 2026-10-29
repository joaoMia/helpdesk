# DEV-006 / HD-020 — Perfil real do solicitante

## DEV-006.1 — Senha esquecida no desenvolvimento local

No PowerShell interativo privado do responsável, execute na raiz `npm run requester:reset:dev`, sem argumentos. Informe o e-mail do solicitante, confirme com `REDEFINIR` e digite a nova senha duas vezes, sem eco (12–128 caracteres). Enter na confirmação da operação cancela. Não use pipes, transcrição, redirecionamento ou senhas em comandos. O agente não executa a redefinição real.

Somente development + PostgreSQL loopback helpdesk_dev/public. O comando revalida banco efetivo, REQUESTER ativo e identidade da conta sob lock; mudanças concorrentes de e-mail/hash/perfil/atividade fazem a operação falhar. Atualiza exclusivamente password_hash e revoga todas as sessões desse usuário na mesma transação. Não altera flags, nomes, e-mails, timestamps do usuário ou outras contas. Não gera arquivos, não oferece endpoint e não reutiliza a recuperação de administrador/técnicos. Argon2id e entrada oculta são os mesmos da autenticação/provisionamento. Buffers são zerados; strings JavaScript não têm apagamento garantido pelo runtime. Após o sucesso, entre normalmente com o e-mail e a nova senha. Mecanismo exclusivamente local, sem envio ou verificação de e-mail, não destinado à produção.

Implementação autorizada em 27/10/2026. Continua o cadastro REQUESTER já disponível em POST /auth/register. Não implementa HD-021, avatar, exclusão ou CRUD administrativo.

- GET /users/me: sessão autenticada vigente, usuário ativo e troca inicial concluída; retorna somente `{user}` com o contrato público existente. Todos os perfis podem consultar exclusivamente a própria identidade.
- PATCH /users/me: somente REQUESTER, composição dos guards da HD-018 com users.update-self. JSON estrito aceita name, email e currentPassword. Nenhum identificador ou atributo privilegiado é aceito. Não há endpoint para editar outro usuário.
- Nome usa a validação do cadastro (trim, 2–120 caracteres). E-mail usa trim/lowercase e limite de 254 caracteres. Corpos vazios, nomes/e-mails inválidos e propriedades extras retornam INVALID_INPUT/400.
- Alteração efetiva do e-mail exige senha atual validada pelo Argon2id existente. Falha retorna CURRENT_PASSWORD_INVALID/403. Apenas diferença de caixa/espaços no mesmo endereço não é mudança efetiva.
- Repository aplica filtro pelo ID da sessão, locks de usuário e sessão e revalida papel, atividade, mustChangePassword, expiração/revogação e versão atual de e-mail/hash antes de atualizar. A constraint case-insensitive existente resolve duplicidade concorrente; conflito retorna PROFILE_UNAVAILABLE/409 sanitizado e reverte a transação.
- Mudança do e-mail revoga todas as sessões no mesmo commit (EMAIL_CHANGED), limpa cookies e responde `{user, reauthenticate:true}`. Nome isolado retorna reauthenticate=false. A API não retorna senha, hash, sessão ou tokens. A alteração da senha continua no módulo auth e revoga todas as sessões.
- CORS/origem, cookies e CSRF são reutilizados de auth; PATCH também tem limite de cinco tentativas por IP/15 minutos, inclusive erros e sucessos. Não é limite distribuído de produção.

No React, o solicitante acessa **Meu perfil** em `#/requester/perfil`, no layout autenticado existente. GET consulta dados reais, PATCH salva na API, nome salvo atualiza a identidade exibida. Mudança de e-mail encaminha ao login e exige o endereço novo. Senha atual permanece apenas em memória transitória do formulário e é limpa após a tentativa; não usa localStorage/sessionStorage. O laboratório demonstrativo não participa dessas rotas.

**Pendência corporativa:** alteração e cadastro de e-mail não comprovam propriedade do endereço. Não há mensagem de verificação enviada nem recuperação de acesso implementada. Homologar verificação de e-mail e política de alteração antes da implantação corporativa, conforme ADR-12. Nenhuma ADR pendente é aprovada por esta entrega.

Não houve migration, seed ou alteração de usuários reais durante os testes. Integração usa namespace exclusivo em helpdesk_test. Referências: [requisitos](02-requisitos-e-permissoes.md), [RN-001/RN-004](03-regras-de-negocio.md), [autorização](21-autorizacao-backend.md), [ADR-12](20-adr12-autenticacao.md).

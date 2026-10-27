# ADR-12 — Autenticação real e sessões

**Estado:** aprovada para a DEV-003 em 26/10/2026, conforme decisões expressas do responsável. Não encerra a HD-003 nem aprova exceções de RBAC, recuperação de acesso ou provisionamento administrativo.

## Decisão implementada

- Login por e-mail e senha. E-mail sofre trim/lowercase; índice case-insensitive protege unicidade, inclusive em concorrência. Cadastro público estrito aceita apenas nome/e-mail/senha; perfil REQUESTER e atividade são definidos pela API. Não há verificação de e-mail por envio de mensagem nesta fase.
- Senha de 12 a 128 caracteres Unicode, sem trim/normalização e sem truncamento silencioso, limitada a 256 unidades UTF-16/até 512 bytes UTF-8. Argon2id pela biblioteca argon2: memória 19456 KiB (19 MiB), duas iterações, paralelismo 1 e hash de 32 bytes, com salt aleatório da biblioteca. Atende ao mínimo OWASP; hash+verificação inicial no Windows levou aproximadamente 83 ms. Recalibrar no Server 10 antes do deploy, sem reduzir esse mínimo.
- JWT HS256 por jose, chave aleatória de pelo menos 32 bytes, acesso de 15 minutos. Validar assinatura/algoritmo, typ=at+jwt, issuer=helpdesk-api, audience=helpdesk-web, sub/sid/jti UUID, iat e exp. Perfil não vem do payload do cliente nem serve de autoridade em claims antigas: identidade/atividade/flag são consultadas no banco.
- Refresh opaco com 32 bytes criptograficamente aleatórios, vinculado ao UUID da sessão. Somente SHA-256 do token completo é persistido, com histórico de consumo, expiração e revogação. SHA-256 é usado para token de alta entropia, não para senha. Sessão tem prazo absoluto de sete dias; a rotação não prolonga indefinidamente esse prazo.
- Cookies HttpOnly, SameSite=Strict, Path=/, sem Domain. Em HTTPS são Secure e usam prefixo __Host-. Cookies sem Secure exigem exceção explícita em development/test, origens loopback e conexão loopback HTTP. HTTPS com configuração de cookies inseguros é recusado. Não confiar automaticamente em X-Forwarded-*; terminação TLS/proxy confiável depende da implantação futura.
- Nenhum JWT/refresh em JSON, localStorage ou sessionStorage. Respostas de autenticação usam Cache-Control: no-store e dados públicos explícitos. Apenas o token anti-CSRF é retornado para memória do cliente.

## CSRF, origem e abuso

Signed Double Submit Cookie pela biblioteca csrf-csrf, chave distinta da chave JWT. Token vinculado ao identificador da sessão de refresh; antes do login, nonce aleatório em cookie HttpOnly cria contexto próprio. GET /auth/csrf fornece o token; POST/PATCH exigem também X-CSRF-Token, cookie correspondente e Origin exata permitida. Login/cadastro também são protegidos. Login troca o vínculo/limpa contexto anterior; logout e troca de senha limpam os cookies. Não aceitar token somente do cookie ou corpo.

CORS permite somente origens explícitas em AUTH_ORIGINS, com credenciais; não usa wildcard/reflexão irrestrita. Origem desconhecida e mutação sem Origin são recusadas antes do controller. O proxy Vite mantém frontend/API na mesma origem do navegador. SameSite=Strict pressupõe implantação same-site; liberar origem no CORS não remove essa restrição.

Limites iniciais: login 10 tentativas/IP/15 min e 20/e-mail/15 min; cadastro 5/IP/15 min; refresh 60/IP/min; troca de senha 5/IP/15 min; emissão CSRF 120/IP/min. Incluem sucessos. Usa express-rate-limit, IP direto (proxy não confiado automaticamente) e armazenamento em memória para o processo local. Não é defesa distribuída: antes de múltiplas instâncias/produção, homologar store compartilhado, limites corporativos, proxy confiável e proteção de borda.

Senha errada, conta inexistente e conta inativa retornam a mesma mensagem de login. Hash dummy evita um caminho rápido para e-mail desconhecido. Cadastro duplicado retorna conflito genérico, sem indicar um campo específico; o status ainda diferencia cadastro disponível, devendo ser reavaliado na homologação de cadastro público/verificação de e-mail.

## Concorrência, revogação e primeiro acesso

Refresh usa transação e lock de linha da sessão. Só o primeiro consumo do token pode vencer. Reapresentação de token consumido revoga toda a sessão/família, inclusive o token sucessor. Duas requisições concorrentes com o mesmo token produzem um sucesso e uma rejeição/revogação; não há janela de tolerância nem dois sucessores válidos. Histórico de hashes consumidos precisa permanecer até o fim do prazo da sessão para detectar replay.

O cliente serializa renovação na mesma aba e usa Web Locks quando disponível para coordenar abas; após adquirir lock, consulta /me novamente antes de renovar. Navegadores sem Web Locks ainda têm single-flight por aba, mas corrida entre abas pode exigir novo login sob a política estrita. Renovação nunca é simulada.

Middleware consulta sessão revogada/expirada e usuário ativo em cada requisição protegida. Logout revoga a sessão por refresh e/ou JWT válido e limpa cookies; JWT antigo não continua autorizando. Troca de senha exige a senha atual, atualiza hash/flag e revoga **todas** as sessões do usuário, inclusive a atual, exigindo novo login. Operações concorrentes de senha/login são serializadas por usuário; refresh e revogação compartilham locks da sessão.

mustChangePassword não é uma permissão visual: o middleware reutilizável bloqueia funcionalidades comuns com 403 até a troca. /auth/me e troca de senha permitem esse estado para o fluxo inicial; logout continua possível. Não há endpoint de negócio liberado, RBAC completo ou criação real de técnicos nesta entrega.

## Persistência e limites

Mantida users. AuthSession e AuthRefreshToken são adicionais, com FKs/cascata de usuário, índices, hash único e datas. Migration 20261026234800_auth_sessions é aditiva; a primeira migration publicada permanece intacta. Aplicação somente em helpdesk_dev; testes recriam as migrations em namespace próprio de helpdesk_test e descartam somente esse namespace criado pelo teste. Nenhum banco/volume existente é recriado ou apagado.

Não há seed/admin padrão, senha fixa, e-mail enviado, recuperação de acesso ou promessa de e-mail verificado. HD-019 provisionará admin/técnicos com autorização própria. HD-018 implementará RBAC/ownership; login não concede acesso a módulos futuros. Limpeza/retenção de sessões expiradas e homologação corporativa de e-mail/TLS/limites/proxy permanecem pendentes. Não apagar histórico de tokens ainda necessário à detecção de replay.

## Referências consultadas

- [OWASP — Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- [OWASP — CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- [node-argon2](https://github.com/ranisalt/node-argon2), [jose](https://github.com/panva/jose), [csrf-csrf](https://github.com/Psifi-Solutions/csrf-csrf) e [express-rate-limit](https://express-rate-limit.mintlify.app/reference/configuration).

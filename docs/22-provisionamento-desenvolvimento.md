# HD-019 / DEV-005 — Provisionamento seguro de desenvolvimento

Procedimentos de desenvolvimento preparados em 27/10/2026. Criam um ADMIN inicial e três TECHNICIAN no User existente, sem migration, senha padrão ou alteração dos usuários já cadastrados. A DEV-005 mantém o modo manual; a DEV-005.1 acrescenta a opção automática expressamente autorizada, com entrega local protegida.

## Opção automática — DEV-005.1 / Windows

Na raiz, com PostgreSQL saudável, NODE_ENV=development e DATABASE_URL local helpdesk_dev/public:

```powershell
npm run provision:dev:auto
```

O comando não pede senhas. Usa randomBytes do Node para gerar quatro senhas distintas, com 24 bytes de entropia cada, codificadas em 32 caracteres base64url e compatíveis com a política existente. Reutiliza Argon2id e a transação do modo manual. Provisiona exclusivamente:

| Nome    | Perfil     | Alias local                 |
| ------- | ---------- | --------------------------- |
| Admin   | ADMIN      | admin.local@helpdesk.test   |
| Murilo  | TECHNICIAN | murilo.local@helpdesk.test  |
| Gabriel | TECHNICIAN | gabriel.local@helpdesk.test |
| João    | TECHNICIAN | joao.local@helpdesk.test    |

Todos começam ativos e com troca obrigatória. Não há caixas postais, envio de e-mail ou credenciais padrão.

A entrega ocorre somente em `%LOCALAPPDATA%\HelpDesk\credenciais-iniciais-dev.txt`, fora do repositório. Abra a pasta pelo Explorador do Windows e consulte o arquivo diretamente. **Não copie seu conteúdo para chats, logs ou arquivos do projeto. Apague-o após substituir as quatro senhas provisórias.**

Proteções do arquivo:

- Pasta e arquivo nascem com ACL protegida contra herança, proprietário igual ao SID atual e uma única permissão explícita FullControl para esse SID. A ACL é conferida antes de escrever credenciais e antes dos INSERTs.
- Usa criação exclusiva CreateNew: arquivo anterior nunca é sobrescrito. Pasta anterior com ACL incompatível é recusada, sem modificar suas permissões. Reparse points/junctions no destino ou ancestrais são recusados.
- Helper Windows/.NET sem elevação, instalação, alteração de política de execução ou configuração global. Credenciais trafegam somente por stdin anônimo entre os processos; não são argumentos, variáveis de ambiente, stdout ou stderr.
- O helper mantém o arquivo com acesso exclusivo durante a transação. Depois da confirmação, fecha o arquivo para consulta pelo responsável. A saída do comando mostra apenas o caminho e o resultado, nunca as senhas.
- Uma conta existente, mesmo reconhecida pelo modo manual, bloqueia o modo automático antes de regenerar acessos. O conflito é revalidado dentro da transação, após o lock. Não é ferramenta de recuperação ou redefinição.
- Se a transação falhar e o banco confirmar que os quatro slots continuam ausentes, remove somente o arquivo criado pela própria execução. Em queda de processo, perda de conexão ou confirmação ambígua, preserva o arquivo protegido para conferência local; não repete INSERTs nem altera contas. Não há transação distribuída entre filesystem e PostgreSQL.
- Os testes do helper usam exclusivamente fixtures sintéticas em subpastas únicas de `.local/`; o comando operacional não oferece destino alternativo. O arquivo real fica somente no perfil local.

Essas ACLs protegem contra outros usuários comuns; não impedem tomada de posse por administrador com privilégios do Windows nem processos já executados como o próprio usuário. O armazenamento em texto é temporário e explicitamente autorizado para este desenvolvimento. Não reutilize este procedimento em produção.

Fontes técnicas: [FileStream com FileSecurity na criação](https://learn.microsoft.com/en-us/dotnet/api/system.io.filestream.-ctor?view=netframework-4.8) e [criação de diretório com segurança](https://learn.microsoft.com/en-us/dotnet/api/system.io.directory.createdirectory?view=netframework-4.8).

## Executar no PowerShell

### Conferência e recuperação local — DEV-005.2

Execute `npm run provision:dev:recover` no PowerShell interativo do próprio responsável, na raiz do projeto. O comando mostra o destino efetivo de LOCALAPPDATA. Se o arquivo original estiver acessível e suas credenciais corresponderem às quatro contas, apenas confirma a leitura, sem redefinir senhas. Abra o arquivo diretamente no Windows; nunca publique seu conteúdo.

Se o arquivo estiver ausente nesse contexto, exige digitar `RECUPERAR` antes de qualquer redefinição. O lote inteiro é recusado se faltar um ID/e-mail/perfil autorizado, se uma conta estiver inativa, já tiver concluído a troca inicial ou possuir sessão vigente. Não cria contas nem modifica nomes/perfis/solicitantes. Revalida sob locks de usuário iguais aos do login, atualiza somente hashes e revoga sessões remanescentes dessas quatro contas. Arquivo anterior nunca é sobrescrito; ACL e gravação protegida antecedem a alteração no banco. Em confirmação ambígua, preserva o arquivo protegido para conferência, sem repetir a operação automaticamente.

Confira no seu terminal `Test-Path "$env:LOCALAPPDATA\HelpDesk\credenciais-iniciais-dev.txt"`. Para abri-lo, use o Explorador na pasta `%LOCALAPPDATA%\HelpDesk`. A validação do agente não comprova que o filesystem/contexto do terminal do responsável seja o mesmo. Nesta investigação, o original continuava presente e conferido no contexto do agente, com o mesmo nome de conta Windows informado; a causa da divergência de visibilidade não foi comprovada. Nenhuma recuperação permanente foi executada pelo agente.

Use um terminal interativo local privado, sem gravação/transcrição da sessão. O PostgreSQL deve estar saudável e as duas migrations já aplicadas. O `.env` local ignorado precisa de NODE_ENV=development e DATABASE_URL apontando para helpdesk_dev local/public. Não copie credenciais para esta documentação, chat, argumentos, comandos ou arquivos adicionais.

Na raiz:

```powershell
Set-Location C:\dev\helpdesk
npm run db:status
npm run provision:dev
```

Se o container estiver parado, `npm run db:up` inicia o serviço de desenvolvimento previsto no projeto; não remova volumes. O comando de provisionamento prepara contratos/Prisma Client usando as dependências locais existentes e abre o questionário. Não instala ferramentas globais.

1. Para cada conta nova, informe nome e alias de e-mail de teste. Enter aceita os exemplos não secretos `admin.local@helpdesk.test`, `tecnico1.local@helpdesk.test`, `tecnico2.local@helpdesk.test` e `tecnico3.local@helpdesk.test`. Outros aliases terminados em `.test` ou `.invalid` são aceitos. Não há envio de e-mail ou verificação de domínio nesta fase.
2. Informe uma senha própria de 12–128 caracteres para cada conta nova e confirme-a. A senha não aparece, nem como asteriscos. Espaços são preservados. Senhas compartilhadas entre as novas contas do lote são recusadas. Use credenciais que você consiga administrar em local seguro; o programa não cria arquivo de senhas nem as mostra após o cadastro.
3. Até todas as entradas serem válidas, nenhuma conta nova é gravada. Ctrl+C cancela. O resumo final mostra somente slot, perfil e se foi criado ou preservado; não mostra senha, hash ou token.
4. Contas do lote já reconhecidas não pedem senha novamente e permanecem intactas. Reexecutar o mesmo comando é permitido.

Não use pipes, redirecionamento, Tee-Object, arquivo de entrada, variáveis de senha em comandos ou argumentos. O programa recusa stdin/stdout sem TTY ou terminal sem raw mode; não existe fallback visível. Se o terminal integrado não oferecer TTY seguro, abra o PowerShell no Windows Terminal e execute o mesmo comando. Não informe senhas pelo chat.

## Primeiro acesso

Depois do resumo de criação, inicie a API e o frontend, se ainda não estiverem rodando, em terminais separados:

```powershell
npm run dev:backend
```

```powershell
npm run dev:frontend
```

Abra [login local](http://127.0.0.1:5173/#/login). Entre com o alias e a senha informados por você. ADMIN e os três TECHNICIAN começam ativos e com mustChangePassword=true; a interface encaminha para `#/change-password` antes da área comum e o middleware bloqueia acesso comum com 403.

A senha atual é obrigatória; a nova deve cumprir a política e ser diferente da provisória. Após a troca, todas as sessões são revogadas e é necessário entrar com a nova senha. A reexecução do provisionamento não restaura a senha provisória nem a flag.

Já existem páginas iniciais autenticadas em `#/admin/painel` e `#/technician/painel`, com identidade real e módulos ainda indisponíveis. Não foram criados dashboards, CRUD ou permissões novas. O laboratório em `#/demo/` permanece separado e não altera a identidade da API.

## Idempotência e atomicidade

Quatro UUIDs reservados e estáveis identificam os slots do desenvolvimento. São identificadores públicos de teste, não credenciais. Não os altere entre execuções. Um e-mail ou perfil parecido, por si só, não transforma uma conta preexistente em conta do seed.

- Somente INSERT de contas novas; sem upsert, UPDATE, promoção de perfil, reativação, redefinição de senha ou DELETE de dados.
- Mesmo ID/e-mail/perfil: preserva integralmente a conta, incluindo nome editado, senha, atividade, datas e mustChangePassword.
- Colisão de e-mail/ID ou perfil incompatível: interrompe o lote inteiro com mensagem sanitizada. Não adota nem promove solicitantes existentes, inclusive com diferenças de caixa no e-mail.
- Se já existe ADMIN fora do slot inicial e o slot ainda não existe, a execução é recusada para revisão manual. Não cria silenciosamente outro primeiro administrador.
- As quatro criações são uma transação. Um lock transacional serializa duas execuções simultâneas do comando; a segunda reconsulta os registros já confirmados e os preserva. A unicidade do banco também cobre concorrência com outros gravadores. Qualquer falha de inserção reverte o lote; nenhuma migration é editada/aplicada pelo comando.
- Não há redefinição administrativa. Se esqueceu a senha de uma conta preservada, não altere UUIDs, não remova usuários e não espere que este comando substitua a credencial: recuperação de acesso é tarefa própria.

## Limites de ambiente e proteção de memória

O entrypoint aceita apenas development, PostgreSQL loopback, nome helpdesk_dev e schema public. Recusa produção, helpdesk_test, outros bancos/hosts e parâmetros de URL que possam redirecionar a conexão. Antes de operar, confere também current_database/current_schema reais.

O núcleo é exercitado pelos testes somente com NODE_ENV=test, helpdesk_test e namespace descartável validado pelo helper existente; o comando manual não oferece flag para habilitar esse caminho. Os testes não usam usuários reais nem gravam em desenvolvimento.

Hash é exclusivamente Argon2id pela mesma função da autenticação. Buffers de entrada são zerados e referências de senhas/hashes temporários são liberadas em finally, inclusive no cancelamento. Strings JavaScript são imutáveis: não há garantia de apagar todas as cópias do runtime/GC, terminal ou sistema operacional. Nenhum valor secreto é enviado ao logger ou incluído em erros/resumos.

Este procedimento não provisiona jornadas, serviços, chamados ou projetos e não é ferramenta de produção. Requisitos: [RN-001/002](03-regras-de-negocio.md), [ADR-12](20-adr12-autenticacao.md) e [autorização](21-autorizacao-backend.md). A HD-019 continua sujeita à revisão da entrega. O responsável deve realizar pessoalmente o primeiro login, trocar as senhas provisórias e apagar o arquivo da opção automática.

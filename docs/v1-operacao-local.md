# Instalação e recuperação local

Use a versão candidata completa. Enquanto houver arquivos locais necessários ainda não rastreados, um clone de HEAD não é suficiente. Monte uma cópia com os arquivos rastreados e novos não ignorados e valide a lista e os hashes. Exclua configurações reais, dumps, dados, anexos, Client gerado e dependências. O [README](../README.md) registra os comandos de primeiro uso.

1. Instale com `npm ci`, configure credenciais aleatórias de demonstração e confirme as portas. Prepare o Client uma vez, de forma sequencial.
2. Suba PostgreSQL local, confirme container, usuário, porta, banco e volume. O runner de migrations exige `helpdesk_dev` local e confere histórico e checksums. A suíte exige `helpdesk_test` separado. Nunca use os volumes originais em um ensaio de recuperação.
3. Provisione ADMIN e técnicos com senhas próprias, faça a troca inicial e cadastre solicitantes. Use dados sintéticos. Configure expediente padrão, categoria, serviço e formulário. Consulte o healthcheck e passe pela abertura com anexo, triagem, início, conversa, pendência e solução.

## Backup e recuperação em segundo destino

Com anexos de Projetos, o conjunto deve incluir também **.local/storage/project-attachments**, além de **.local/storage/attachments** dos chamados. Ambos são privados e seus bytes precisam acompanhar dump, metadados e manifesto com hashes. O backup apenas do PostgreSQL não recupera os arquivos de nenhum dos dois módulos.

Interrompa as escritas da instância de origem antes de capturar o conjunto. Gere o dump customizado PostgreSQL e copie o armazenamento privado correspondente. No manifesto, registre a versão candidata, migrations, SHA-256 do dump e arquivos e os vínculos de anexos. Para um ensaio com rascunhos/uploads pendentes, inclua seus bytes ou resolva os estágios antes de congelar a origem. Proteja o pacote e as credenciais de forma separada. O dump contém dados sensíveis e hashes de autenticação.

```text
pg_dump -U USUARIO_DO_ENSAIO -d BANCO_ORIGEM -Fc -f database.dump
pg_restore -U USUARIO_DO_DESTINO -d BANCO_VAZIO --exit-on-error --single-transaction --no-owner --no-privileges database.dump
```

Os comandos são ilustrativos e devem ser executados dentro dos respectivos containers isolados, com nomes e destinos conferidos. O restore exige um banco vazio. Verifique SHA-256 antes de restaurar, confira os objetos e compare contagens e fingerprints antes de criar sessões novas. Restaure os bytes em diretório privado com permissões adequadas e valide hashes por anexo. Sem esse diretório, o dump recupera referências e metadados, mas não os arquivos.

Use a mesma candidata e as dependências completas do workspace. No ensaio, copiar apenas o `dist` fez o Node selecionar outra versão de `cookie`. Instalar a árvore pelo lockfile ou preservar as dependências raiz e locais do backend corrige a resolução. Inicie a segunda instância com configuração própria. Confira login, conversa, snapshots, métricas, download e recusa a outro solicitante.

### Sessões no destino

Mantenha o destino desligado ou restrito a loopback durante a preparação. Use um perfil de navegador separado ou hostname distinto, pois portas não separam cookies. Configure chaves JWT/CSRF e credenciais próprias. Refresh tokens opacos persistidos continuam no dump. Em cópia de demonstração que veio de outra instância, revogue as sessões restauradas no **destino**, sob autorização e após a conferência do backup. Faça novos logins. Preservar o banco original e o pacote de evidência faz parte do procedimento.

O ensaio aprovado usou duas instâncias PostgreSQL em volumes distintos, Node 24.21.0, npm 11.19.0 e dados sintéticos. O backup incluiu um chamado solucionado com dois comentários e um anexo. Contagens e hashes coincidiram em 35 tabelas antes de novos logins. Isso comprova aquele cenário local, sem implicar política de operação ou publicação.

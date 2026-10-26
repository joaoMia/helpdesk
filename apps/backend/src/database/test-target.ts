type Connections = { DATABASE_URL?: string; TEST_DATABASE_URL?: string };
function target(value: string | undefined) {
  try {
    if (!value) throw new Error();
    const url = new URL(value),
      database = decodeURIComponent(url.pathname.slice(1));
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !database ||
      database.includes('/')
    )
      throw new Error();
    return { database, host: url.hostname };
  } catch {
    throw new Error(
      'Conexão PostgreSQL ausente ou inválida; valores omitidos.',
    );
  }
}
export function isolatedTestTarget(
  config: Connections,
  nodeEnv: string | undefined,
) {
  const development = target(config.DATABASE_URL),
    test = target(config.TEST_DATABASE_URL);
  if (
    nodeEnv !== 'test' ||
    test.database !== 'helpdesk_test' ||
    development.database === test.database ||
    !['localhost', '127.0.0.1', '[::1]'].includes(test.host)
  )
    throw new Error(
      'Teste recusado: use NODE_ENV=test e helpdesk_test local, distinto do desenvolvimento.',
    );
  return {
    connectionString: config.TEST_DATABASE_URL!,
    database: test.database,
  };
}

export function developmentMigrationTarget(
  config: Connections,
  nodeEnv: string,
) {
  const development = target(config.DATABASE_URL);
  isolatedTestTarget(config, 'test');
  if (
    nodeEnv !== 'development' ||
    development.database !== 'helpdesk_dev' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(development.host) ||
    ![null, 'public'].includes(
      new URL(config.DATABASE_URL!).searchParams.get('schema'),
    )
  )
    throw new Error(
      'Migration recusada: somente helpdesk_dev local em development, schema public.',
    );
  return {
    connectionString: config.DATABASE_URL!,
    database: development.database,
  };
}

import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';

try {
  const env = loadEnvironment();
  const server = createApp().listen(env.PORT, env.HOST, () => {
    console.log(`HelpDesk API disponível em http://${env.HOST}:${env.PORT}`);
  });
  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error(`Não foi possível iniciar a API (${error.code ?? 'ERRO'}).`);
    process.exitCode = 1;
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
    const timer = setTimeout(() => process.exit(1), 10000);
    timer.unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'Configuração de ambiente inválida.',
  );
  process.exitCode = 1;
}

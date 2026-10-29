import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { createDatabase } from './database/client.js';
import { loadAuthConfig } from './modules/auth/auth.config.js';
import { AuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { authRuntime } from './modules/auth/auth.routes.js';
import { ProfileService } from './modules/users/profile.service.js';
import { ProfileRepository } from './modules/users/profile.repository.js';
import { TechnicianService } from './modules/technicians/technician.service.js';
import { TechnicianRepository } from './modules/technicians/technician.repository.js';
import { CatalogService } from './modules/catalog/catalog.service.js';
import { CatalogRepository } from './modules/catalog/catalog.repository.js';
import { TicketApiService } from './modules/tickets/ticket-api.service.js';
import { TicketApiRepository } from './modules/tickets/ticket-api.repository.js';

try {
  const env = loadEnvironment();
  if (!env.DATABASE_URL)
    throw new Error('DATABASE_URL obrigatória para autenticação.');
  const auth = loadAuthConfig();
  const db = createDatabase(env.DATABASE_URL);
  const runtime = authRuntime(new AuthService(new AuthRepository(db), auth));
  const server = createApp(
    runtime,
    new ProfileService(new ProfileRepository(db)),
    new TechnicianService(new TechnicianRepository(db)),
    new CatalogService(new CatalogRepository(db)),
    new TicketApiService(new TicketApiRepository(db)),
  ).listen(env.PORT, env.HOST, () => {
    console.log(`HelpDesk API disponível em http://${env.HOST}:${env.PORT}`);
  });
  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error(`Não foi possível iniciar a API (${error.code ?? 'ERRO'}).`);
    process.exitCode = 1;
  });
  const shutdown = () => {
    server.close(() => {
      void db.$disconnect().finally(() => process.exit(0));
    });
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

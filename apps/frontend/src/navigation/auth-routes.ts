import type { PublicUser } from '@helpdesk/contracts';

export const profileAreas = {
  REQUESTER: { path: '#/requester/painel', label: 'Solicitante' },
  TECHNICIAN: { path: '#/technician/painel', label: 'Técnico' },
  ADMIN: { path: '#/admin/painel', label: 'Administrador' },
} as const;

export function authenticatedHome(user: PublicUser) {
  return profileAreas[user.role].path;
}

// Presentation routing only. API authorization remains mandatory in HD-018.
// A URL never selects an identity or imports the demonstration's role/data.
export function authDestination(user: PublicUser | null, path: string) {
  if (path.startsWith('#/demo/')) return path;
  if (!user) return path === '#/register' ? path : '#/login';
  if (user.mustChangePassword) return '#/change-password';
  if (path === '#/change-password') return path;
  if (user.role === 'REQUESTER' && path === '#/requester/perfil') return path;
  if (user.role === 'TECHNICIAN' && path === '#/technician/perfil') return path;
  if (user.role === 'ADMIN' && path === '#/admin/usuarios') return path;
  if (user.role === 'ADMIN' && path === '#/admin/catalogo') return path;
  return authenticatedHome(user);
}

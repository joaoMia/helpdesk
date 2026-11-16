import type { PublicUser } from '@helpdesk/contracts';

export const profileAreas = {
  REQUESTER: { path: '#/requester/painel', label: 'Solicitante' },
  TECHNICIAN: { path: '#/technician/painel', label: 'Técnico' },
  ADMIN: { path: '#/admin/painel', label: 'Administrador' },
} as const;

export function authenticatedHome(user: PublicUser) {
  return profileAreas[user.role].path;
}
export function isProjectRequestPath(path: string) {
  return /^#\/(?:requester|technician|admin)\/projetos(?:\/[a-f0-9-]{36})?$/i.test(
    path,
  );
}
export function adminManagementTab(path: string) {
  const allowed = {
    '#/admin/usuarios': 'users',
    '#/admin/usuarios/projetos': 'projects',
    '#/admin/usuarios/tecnicos': 'users',
    '#/admin/usuarios/empresas': 'companies',
    '#/admin/usuarios/setores': 'departments',
    '#/admin/usuarios/expedientes': 'schedules',
    '#/admin/usuarios/politicas': 'policies',
  } as const;
  return allowed[path as keyof typeof allowed];
}
export function technicianTriageQueue(path: string) {
  switch (path) {
    case '#/technician/chamados':
    case '#/technician/chamados/nao-classificados':
      return 'UNCLASSIFIED';
    case '#/technician/chamados/classificados':
      return 'CLASSIFIED';
    case '#/technician/chamados/todos':
      return 'ALL';
    default:
      return undefined;
  }
}
export function technicianTicketPage(
  path: string,
): { page: 'list' | 'detail' | 'triage'; id?: string } | undefined {
  if (path === '#/technician/atendimentos') return { page: 'list' };
  const operational = /^#\/technician\/operacional\/([0-9a-f-]{36})$/i.exec(
    path,
  );
  if (operational) return { page: 'detail', id: operational[1]! };
  const triage = /^#\/technician\/triagem\/([0-9a-f-]{36})$/i.exec(path);
  if (triage) return { page: 'triage', id: triage[1]! };
  const match =
    /^#\/technician\/chamado\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
      path,
    );
  if (match) return { page: 'detail', id: match[1]! };
}
export function requesterTicketPage(
  path: string,
): { page: 'new' | 'list' | 'detail'; id?: string } | undefined {
  if (path === '#/requester/novo') return { page: 'new' };
  if (path === '#/requester/chamados') return { page: 'list' };
  const match =
    /^#\/requester\/chamado\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
      path,
    );
  if (match) return { page: 'detail', id: match[1]! };
}

// Presentation routing only. API authorization remains mandatory in HD-018.
// A URL never selects an identity or imports the demonstration's role/data.
export function authDestination(user: PublicUser | null, path: string) {
  if (path.startsWith('#/demo/')) return path;
  if (!user) return path === '#/register' ? path : '#/login';
  if (user.mustChangePassword) return '#/change-password';
  if (path === '#/change-password') return path;
  const area =
    user.role === 'ADMIN'
      ? 'admin'
      : user.role === 'TECHNICIAN'
        ? 'technician'
        : 'requester';
  if (
    ['REQUESTER', 'TECHNICIAN', 'ADMIN'].includes(user.role) &&
    (path === '#/' + area + '/projetos' ||
      (path.split('/').length === 4 &&
        path.startsWith('#/' + area + '/projetos/') &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          path.split('/')[3] ?? '',
        )))
  )
    return path;
  if (user.role === 'REQUESTER' && path === '#/requester/perfil') return path;
  if (user.role === 'TECHNICIAN' && path === '#/technician/perfil') return path;
  if (user.role === 'ADMIN' && path === '#/admin/usuarios/tecnicos')
    return '#/admin/usuarios';
  if (user.role === 'ADMIN' && path === '#/admin/perfil') return path;
  if (user.role === 'ADMIN' && adminManagementTab(path)) return path;
  if (user.role === 'ADMIN' && path === '#/admin/catalogo') return path;
  if (user.role === 'ADMIN' && path === '#/admin/chamados') return path;
  if (user.role === 'ADMIN' && /^#\/admin\/chamado\/[a-f0-9-]{36}$/i.test(path))
    return path;
  if (user.role === 'REQUESTER' && requesterTicketPage(path)) return path;
  if (user.role === 'TECHNICIAN' && technicianTriageQueue(path)) return path;
  if (user.role === 'TECHNICIAN' && technicianTicketPage(path)) return path;
  return authenticatedHome(user);
}

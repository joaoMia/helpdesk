import type { PublicUser } from '@helpdesk/contracts';
import { AdminUsers } from './admin-users';
import { AdminProjectCategories } from './admin-project-categories';
import { AdminOrganizations } from './admin-organizations';
import { AdminSchedules } from './admin-schedules';
import { AdminOperationalPolicies } from './admin-operational-policies';
import { adminManagementTab } from '../navigation/auth-routes';
const tabs = [
  ['users', '', 'Usuários'],
  ['companies', '/empresas', 'Empresas'],
  ['departments', '/setores', 'Setores'],
  ['schedules', '/expedientes', 'Expedientes'],
  ['policies', '/politicas', 'SLA e pendências'],
  ['projects', '/projetos', 'Formulários de Projetos'],
] as const;
export function Administration({
  user,
  path,
  onExpired,
}: {
  user: PublicUser;
  path: string;
  onExpired: () => void;
}) {
  const tab = adminManagementTab(path) ?? 'users';
  return (
    <>
      <nav
        className="tab-bar mb-6"
        aria-label="Administração de usuários e organização"
      >
        {tabs.map(([key, suffix, label]) => (
          <a
            key={key}
            className={tab === key ? 'tab-active' : ''}
            aria-current={tab === key ? 'page' : undefined}
            href={'#/admin/usuarios' + suffix}
          >
            {label}
          </a>
        ))}
      </nav>
      {tab === 'projects' ? (
        <AdminProjectCategories onExpired={onExpired} />
      ) : tab === 'users' ? (
        <AdminUsers user={user} onExpired={onExpired} />
      ) : tab === 'policies' ? (
        <AdminOperationalPolicies onExpired={onExpired} />
      ) : tab === 'schedules' ? (
        <AdminSchedules onExpired={onExpired} />
      ) : (
        <AdminOrganizations key={tab} kind={tab} onExpired={onExpired} />
      )}
    </>
  );
}

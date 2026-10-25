import { useEffect, useState } from 'react';
import type { Role } from '../types/demo';

export const navigation: Record<
  Role,
  {
    path: string;
    label: string;
    icon: 'grid' | 'ticket' | 'users' | 'tool' | 'clock' | 'pause' | 'plus';
  }[]
> = {
  requester: [
    { path: 'painel', label: 'Visão geral', icon: 'grid' },
    { path: 'chamados', label: 'Meus chamados', icon: 'ticket' },
    { path: 'novo', label: 'Abrir chamado', icon: 'plus' },
  ],
  technician: [
    { path: 'painel', label: 'Visão geral', icon: 'grid' },
    { path: 'nao-classificados', label: 'Não classificados', icon: 'ticket' },
    { path: 'classificados', label: 'Classificados', icon: 'ticket' },
    { path: 'atendimentos', label: 'Meus atendimentos', icon: 'tool' },
  ],
  admin: [
    { path: 'painel', label: 'Visão geral', icon: 'grid' },
    { path: 'chamados', label: 'Todos os chamados', icon: 'ticket' },
    { path: 'usuarios', label: 'Usuários', icon: 'users' },
    { path: 'tecnicos', label: 'Técnicos', icon: 'users' },
    { path: 'servicos', label: 'Serviços', icon: 'tool' },
    { path: 'jornadas', label: 'Jornadas', icon: 'clock' },
    { path: 'motivos', label: 'Motivos de pendência', icon: 'pause' },
  ],
};
export function href(role: Role, page: string) {
  return `#/${role}/${page}`;
}
function currentRoute() {
  const [candidate, page = 'painel', id] = window.location.hash
    .slice(2)
    .split('/');
  const role: Role =
    candidate === 'technician' || candidate === 'admin'
      ? candidate
      : 'requester';
  const valid =
    navigation[role].some((item) => item.path === page) || page === 'chamado';
  return { role, page: valid ? page : 'not-found', id };
}
export function useRoute() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const change = () => setRoute(currentRoute());
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  return route;
}

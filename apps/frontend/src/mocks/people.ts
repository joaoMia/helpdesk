import type { Role } from '../types/demo';
export interface DemoPerson {
  id: string;
  name: string;
  email: string;
  department: string;
  role: Role;
  active: boolean;
  schedule: string;
  mustChangePassword: boolean;
}
export const departments = [
  'Tecnologia da Informação',
  'Administrativo',
  'Financeiro',
  'Produção',
  'Recursos Humanos',
  'Comercial',
];
export const schedules = ['Padrão da empresa', 'Personalizada'];
export function initialPeople(): DemoPerson[] {
  return [
    {
      id: 'r1',
      name: 'Marina Costa',
      email: 'marina@example.invalid',
      department: 'Administrativo',
      role: 'requester',
      active: true,
      schedule: '',
      mustChangePassword: false,
    },
    {
      id: 'r2',
      name: 'Rafael Alves',
      email: 'rafael@example.invalid',
      department: 'Produção',
      role: 'requester',
      active: true,
      schedule: '',
      mustChangePassword: false,
    },
    {
      id: 't1',
      name: 'Lucas Ferreira',
      email: 'lucas@example.invalid',
      department: 'Tecnologia da Informação',
      role: 'technician',
      active: true,
      schedule: schedules[0]!,
      mustChangePassword: false,
    },
    {
      id: 't2',
      name: 'Ana Martins',
      email: 'ana@example.invalid',
      department: 'Tecnologia da Informação',
      role: 'technician',
      active: true,
      schedule: schedules[1]!,
      mustChangePassword: false,
    },
    {
      id: 'a1',
      name: 'Beatriz Lima',
      email: 'beatriz@example.invalid',
      department: 'Tecnologia da Informação',
      role: 'admin',
      active: true,
      schedule: '',
      mustChangePassword: false,
    },
  ];
}
export function validatePerson(people: DemoPerson[], draft: DemoPerson) {
  if (!draft.name.trim()) return 'Informe o nome da pessoa fictícia.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()))
    return 'Informe um e-mail de exemplo válido.';
  if (
    people.some(
      (p) =>
        p.id !== draft.id &&
        p.email.toLowerCase() === draft.email.trim().toLowerCase(),
    )
  )
    return 'Este e-mail já existe na amostra.';
  if (!departments.includes(draft.department))
    return 'Selecione um setor disponível.';
  if (!['requester', 'technician', 'admin'].includes(draft.role))
    return 'Selecione um perfil demonstrativo válido.';
  if (draft.role === 'technician' && !schedules.includes(draft.schedule))
    return 'Selecione uma jornada demonstrativa.';
  return '';
}
export function savePerson(
  people: DemoPerson[],
  draft: DemoPerson,
  role: Role,
) {
  if (role !== 'admin' || validatePerson(people, draft)) return people;
  const exists = people.some((p) => p.id === draft.id);
  const clean = {
    ...draft,
    name: draft.name.trim(),
    email: draft.email.trim().toLowerCase(),
    schedule: draft.role === 'technician' ? draft.schedule : '',
    mustChangePassword:
      draft.role === 'technician' && (!exists || draft.mustChangePassword),
  };
  return exists
    ? people.map((p) => (p.id === draft.id ? clean : p))
    : [...people, clean];
}
export function togglePerson(people: DemoPerson[], id: string, role: Role) {
  if (role !== 'admin' || !people.some((p) => p.id === id)) return people;
  return people.map((p) => (p.id === id ? { ...p, active: !p.active } : p));
}

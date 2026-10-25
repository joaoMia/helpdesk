import type { DemoReason, DemoService, DemoTicket, Role } from '../types/demo';

export const roles: Record<
  Role,
  { label: string; name: string; initials: string; id: string }
> = {
  requester: {
    label: 'Solicitante',
    name: 'Marina Costa',
    initials: 'MC',
    id: 'r1',
  },
  technician: {
    label: 'Técnico',
    name: 'Lucas Ferreira',
    initials: 'LF',
    id: 't1',
  },
  admin: {
    label: 'Administrador',
    name: 'Beatriz Lima',
    initials: 'BL',
    id: 'a1',
  },
};
export const services: DemoService[] = [
  {
    id: 's1',
    name: 'Suporte a computadores',
    description: 'Equipamentos, periféricos e desempenho.',
    cents: 9000,
    active: true,
  },
  {
    id: 's2',
    name: 'Rede e conectividade',
    description: 'Conexão à rede interna e acesso à internet.',
    cents: 12000,
    active: true,
  },
  {
    id: 's3',
    name: 'Sistemas e aplicativos',
    description: 'Instalação e suporte de aplicativos.',
    cents: 8000,
    active: true,
  },
  {
    id: 's4',
    name: 'Impressoras',
    description: 'Configuração e suporte de impressão.',
    cents: 6000,
    active: true,
  },
  {
    id: 's5',
    name: 'Acesso e contas',
    description: 'Orientação para problemas de acesso.',
    cents: 5000,
    active: true,
  },
  {
    id: 's6',
    name: 'Equipamentos legados',
    description: 'Serviço indisponível para novas solicitações.',
    cents: 7000,
    active: false,
  },
];
export const reasons: DemoReason[] = [
  { id: 'p1', name: 'Aguardando solicitante', counts: false, autoResume: true },
  { id: 'p2', name: 'Aguardando fornecedor', counts: false, autoResume: false },
  {
    id: 'p3',
    name: 'Análise técnica em andamento',
    counts: true,
    autoResume: false,
  },
];
export function requesterName(id: string) {
  return id === 'r1' ? 'Marina Costa' : 'Rafael Alves';
}
export function technicianName(id: string | null) {
  return id === 't1'
    ? 'Lucas Ferreira'
    : id === 't2'
      ? 'Ana Martins'
      : 'Não atribuído';
}

export function initialTickets(): DemoTicket[] {
  const rows: [
    string,
    string,
    DemoTicket['status'],
    DemoTicket['priority'],
    string | null,
    string,
    number,
  ][] = [
    [
      '1048',
      'Notebook não conecta à rede interna',
      'OPEN',
      null,
      null,
      'r1',
      1,
    ],
    ['1047', 'Configurar impressora do setor', 'OPEN', 'MEDIUM', null, 'r2', 3],
    [
      '1046',
      'Aplicativo fecha ao iniciar',
      'IN_PROGRESS',
      'HIGH',
      't1',
      'r1',
      2,
    ],
    ['1045', 'Monitor sem imagem', 'IN_PROGRESS', 'MEDIUM', 't2', 'r2', 0],
    [
      '1044',
      'Acesso à pasta compartilhada',
      'PENDING',
      'MEDIUM',
      't1',
      'r1',
      4,
    ],
    [
      '1041',
      'Ajuste na configuração de impressão',
      'CLOSED',
      'LOW',
      't1',
      'r1',
      3,
    ],
  ];
  return rows.map(
    ([id, subject, status, priority, technicianId, requesterId, index]) => ({
      id,
      subject,
      status,
      priority,
      technicianId,
      requesterId,
      description: `Preciso de apoio com esta solicitação: ${subject.toLocaleLowerCase('pt-BR')}. O problema foi identificado durante a rotina de trabalho. Este conteúdo é inteiramente fictício.`,
      createdAt: `2026-10-${id === '1041' ? '21' : '24'}T09:30:00-03:00`,
      services: [{ ...services[index]! }],
      attachment: null,
      pending: status === 'PENDING' ? { ...reasons[0]! } : null,
      events: [
        {
          id: `open-${id}`,
          actor: requesterName(requesterId),
          text: 'Chamado aberto sem prioridade e sem técnico.',
          at: `2026-10-${id === '1041' ? '21' : '24'}T09:30:00-03:00`,
        },
        ...(priority
          ? [
              {
                id: `class-${id}`,
                actor: 'Equipe de suporte',
                text: 'Prioridade classificada, sem atribuição de responsável.',
                at: `2026-10-${id === '1041' ? '21' : '24'}T09:40:00-03:00`,
              },
            ]
          : []),
        ...(technicianId
          ? [
              {
                id: `start-${id}`,
                actor: technicianName(technicianId),
                text: 'Atendimento iniciado com atribuição do técnico.',
                at: `2026-10-${id === '1041' ? '21' : '24'}T10:00:00-03:00`,
              },
            ]
          : []),
        ...(status === 'PENDING'
          ? [
              {
                id: `pending-${id}`,
                actor: technicianName(technicianId),
                text: 'Pendência: aguardando solicitante. Precisamos de mais informações sobre o acesso.',
                at: '2026-10-24T10:10:00-03:00',
              },
            ]
          : []),
        ...(status === 'CLOSED'
          ? [
              {
                id: `closed-${id}`,
                actor: technicianName(technicianId),
                text: 'Chamado encerrado. Exemplo demonstrativo.',
                at: `2026-10-${id === '1041' ? '21' : '24'}T10:30:00-03:00`,
              },
            ]
          : []),
      ],
    }),
  );
}

import { initialCatalog } from './catalog';
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
export const services: DemoService[] = initialCatalog().services;
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
    ['1048', 'Instalar aplicativo de trabalho', 'OPEN', null, null, 'r1', 1],
    ['1047', 'Configurar impressora do setor', 'OPEN', 'MEDIUM', null, 'r2', 3],
    [
      '1046',
      'Falha ao acessar módulo do TOTVS',
      'IN_PROGRESS',
      'HIGH',
      't1',
      'r1',
      2,
    ],
    [
      '1045',
      'Criar acessos de novo colaborador',
      'IN_PROGRESS',
      'MEDIUM',
      't2',
      'r2',
      0,
    ],
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
  const current = rows.map<DemoTicket>(
    ([id, subject, status, priority, technicianId, requesterId, index]) => ({
      id,
      subject,
      status,
      priority,
      technicianId,
      requesterId,
      description: `Preciso de apoio com esta solicitação: ${subject.toLocaleLowerCase('pt-BR')}. O problema foi identificado durante a rotina de trabalho. Este conteúdo é inteiramente fictício.`,
      createdAt: `2026-10-${id === '1041' ? '21' : '24'}T09:30:00-03:00`,
      service: structuredClone(services[index]!),
      category: structuredClone(
        initialCatalog().categories.find(
          (c) => c.id === services[index]!.categoryId,
        )!,
      ),
      answers: {},
      firstStartedAt: technicianId
        ? `2026-10-${id === '1041' ? '21' : '24'}T10:00:00-03:00`
        : undefined,
      closedAt: status === 'CLOSED' ? '2026-10-21T10:30:00-03:00' : undefined,
      closedBy: status === 'CLOSED' ? (technicianId ?? undefined) : undefined,
      serviceAnswers:
        index === 2
          ? {
              s3: {
                systemUser: 'usuario.demo',
                module: 'Estoque (fictício)',
                problem: 'Falha fictícia na abertura do módulo.',
                evidence: 'evidencia-demo.txt',
              },
            }
          : index === 1
            ? {
                s2: {
                  application: 'Aplicativo de exemplo',
                  website: 'https://example.invalid',
                  windowsUser: 'pessoa.demo',
                },
              }
            : index === 0
              ? {
                  s1: {
                    systems: ['Spark'],
                    fullName: 'Pessoa Exemplo',
                    department: 'Setor demonstrativo',
                  },
                }
              : {},
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
  const original = current.map((t) => ({
    ...t,
    answers: structuredClone(t.serviceAnswers?.[t.service.id] ?? {}),
  }));
  const history: DemoTicket[] = Array.from({ length: 12 }, (_, i) => {
    const month = String(4 + Math.floor(i / 2)).padStart(2, '0');
    const day = i % 2 ? '18' : '06';
    const service = structuredClone(services[(i + 6) % services.length]!);
    const owner = i % 3 ? 't1' : 't2';
    return {
      ...structuredClone(original[5]!),
      id: String(1000 + i),
      subject: 'Histórico demonstrativo · ' + service.name,
      description:
        'Registro fictício para avaliar gráficos e filtros; não contém dados de produção.',
      requesterId: i % 2 ? 'r1' : 'r2',
      technicianId: owner,
      closedBy: owner,
      service,
      category: structuredClone(
        initialCatalog().categories.find((c) => c.id === service.categoryId)!,
      ),
      answers: {},
      serviceAnswers: undefined,
      createdAt: '2026-' + month + '-' + day + 'T09:00:00Z',
      firstStartedAt: '2026-' + month + '-' + day + 'T10:00:00Z',
      closedAt: '2026-' + month + '-' + day + 'T16:00:00Z',
      events: [
        {
          id: 'history-' + i,
          actor: 'Equipe demonstrativa',
          text: 'Atendimento fictício encerrado. Amostra para visualização.',
          at: '2026-' + month + '-' + day + 'T16:00:00Z',
        },
      ],
    };
  });
  return [...original, ...history];
}

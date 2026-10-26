import { reasons, services } from './fixtures';

export const directoryExamples = {
  usuarios: {
    title: 'Usuários',
    subtitle: 'Pessoas que solicitam apoio à equipe de TI.',
    columns: ['Pessoa', 'Contato fictício', 'Perfil', 'Situação'],
    rows: [
      ['Marina Costa', 'marina@example.invalid', 'Solicitante', 'Ativo'],
      ['Rafael Alves', 'rafael@example.invalid', 'Solicitante', 'Ativo'],
      ['Beatriz Lima', 'beatriz@example.invalid', 'Administrador', 'Ativo'],
    ],
  },
  tecnicos: {
    title: 'Técnicos',
    subtitle: 'Uma equipe organizada para cuidar de cada atendimento.',
    columns: [
      'Pessoa',
      'Contato fictício',
      'Jornada demonstrativa',
      'Situação',
    ],
    rows: [
      ['Lucas Ferreira', 'lucas@example.invalid', 'Padrão da empresa', 'Ativo'],
      ['Ana Martins', 'ana@example.invalid', 'Personalizada', 'Ativo'],
    ],
  },
  servicos: {
    title: 'Serviços',
    subtitle: 'Catálogo de serviços e formulários em validação.',
    columns: ['Serviço', 'Descrição', 'Categoria / sistema', 'Situação'],
    rows: services.map((s) => [
      s.name,
      s.description,
      s.categoryId,
      s.active ? 'Ativo' : 'Inativo',
    ]),
  },
  jornadas: {
    title: 'Jornadas',
    subtitle:
      'Exemplos de intervalos; sem motor de cálculo ou edição de calendário.',
    columns: ['Jornada', 'Dias', 'Intervalos demonstrativos', 'Versão'],
    rows: [
      [
        'Padrão da empresa',
        'Segunda a sexta',
        '08:00–12:00 / 14:00–18:00',
        'Exemplo v1',
      ],
      [
        'Personalizada',
        'Segunda a sexta',
        '10:00–14:00 / 16:00–20:00',
        'Exemplo v1',
      ],
    ],
  },
  motivos: {
    title: 'Motivos de pendência',
    subtitle: 'Visualize as duas flags utilizadas nos exemplos de pendência.',
    columns: ['Motivo', 'Conta tempo útil', 'Retoma por resposta', 'Situação'],
    rows: reasons.map((r) => [
      r.name,
      r.counts ? 'Sim, dentro do expediente' : 'Não',
      r.autoResume ? 'Sim, pelo solicitante' : 'Não',
      'Ativo',
    ]),
  },
};

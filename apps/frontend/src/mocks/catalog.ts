import type { DemoCatalog, DemoService } from '../types/demo';
import { serviceForms } from '../forms/service-definitions';
export function initialCatalog(): DemoCatalog {
  const categories = [
    ['windows', 'Windows', 'Equipamentos e aplicativos do ambiente Windows.'],
    ['totvs', 'TOTVS', 'Suporte e acessos ao sistema de gestão.'],
    ['office', 'Pacote Office', 'Aplicativos e ferramentas de produtividade.'],
    ['accounts', 'Acessos e contas', 'Contas e permissões para o trabalho.'],
    [
      'network',
      'Infraestrutura de rede',
      'Conectividade, pontos e rede interna.',
    ],
    ['print', 'Impressoras', 'Impressão e configuração de equipamentos.'],
  ].map(([id, name, description], order) => ({
    id: id!,
    name: name!,
    description: description!,
    active: true,
    order,
  }));
  const rows = [
    [
      's1',
      'accounts',
      'Criação de usuário',
      'Solicite acessos aos sistemas da empresa.',
    ],
    [
      's2',
      'windows',
      'Instalação de aplicativo',
      'Informe o aplicativo e os dados necessários, sem senhas.',
    ],
    [
      's3',
      'totvs',
      'Problema no sistema',
      'Descreva a falha e inclua uma evidência demonstrativa.',
    ],
    [
      's4',
      'print',
      'Configuração de impressora',
      'Configuração e suporte de impressão.',
    ],
    [
      's5',
      'accounts',
      'Redefinição de acesso',
      'Descreva a dificuldade de acesso, sem informar credenciais.',
    ],
    [
      's6',
      'windows',
      'Equipamentos legados',
      'Exemplo de serviço indisponível para novas solicitações.',
    ],
    [
      's7',
      'windows',
      'Máquina travando',
      'Lentidão e travamentos na rotina de trabalho.',
    ],
    [
      's8',
      'windows',
      'Problema de inicialização',
      'Dificuldade para iniciar o computador.',
    ],
    [
      's9',
      'windows',
      'Erro do sistema operacional',
      'Mensagens de erro do Windows.',
    ],
    ['s10', 'totvs', 'Liberação de acesso', 'Solicitação de acesso ao TOTVS.'],
    [
      's11',
      'totvs',
      'Erro de execução',
      'Erro ao executar uma operação no sistema.',
    ],
    [
      's12',
      'office',
      'Problema no Outlook',
      'Dificuldade com o aplicativo de e-mail.',
    ],
    [
      's13',
      'office',
      'Problema no Excel',
      'Dificuldade com planilhas ou o aplicativo.',
    ],
    [
      's14',
      'office',
      'Instalação do Office',
      'Solicitação de instalação do pacote Office.',
    ],
    [
      's15',
      'accounts',
      'Solicitação de permissões',
      'Descreva o recurso e o acesso necessário.',
    ],
    [
      's16',
      'network',
      'Problema de conectividade',
      'Dificuldade de conexão à rede interna.',
    ],
  ];
  const services: DemoService[] = rows.map(
    ([id, categoryId, name, description], order) => ({
      id: id!,
      categoryId: categoryId!,
      name: name!,
      description: description!,
      active: id !== 's6',
      order,
      fields: structuredClone(
        serviceForms[id!] ?? [
          {
            id: 'context',
            label: 'Contexto e informações adicionais',
            kind: 'textarea' as const,
            hint: 'Campos demonstrativos, sujeitos a validação.',
          },
          { id: 'evidence', label: 'Anexo opcional', kind: 'file' as const },
        ],
      ),
    }),
  );
  return { categories, services };
}
export function availableServices(catalog: DemoCatalog, categoryId: string) {
  if (!catalog.categories.some((c) => c.id === categoryId && c.active))
    return [];
  return catalog.services
    .filter((s) => s.categoryId === categoryId && s.active)
    .sort((a, b) => a.order - b.order);
}
export function validateCatalog(catalog: DemoCatalog): string[] {
  const errors: string[] = [];
  if (
    new Set(catalog.categories.map((c) => c.id)).size !==
    catalog.categories.length
  )
    errors.push('Identificador de categoria duplicado.');
  if (
    new Set(catalog.services.map((s) => s.id)).size !== catalog.services.length
  )
    errors.push('Identificador de serviço duplicado.');
  for (const c of catalog.categories)
    if (!c.name.trim() || !Number.isFinite(c.order))
      errors.push('Informe nome e ordem válidos para a categoria.');
  for (const s of catalog.services) {
    if (
      !s.name.trim() ||
      !catalog.categories.some((c) => c.id === s.categoryId) ||
      !Number.isFinite(s.order)
    )
      errors.push('Serviço precisa de nome, categoria e ordem válidos.');
    const seen = new Set<string>();
    for (const field of s.fields) {
      if (!field.id.trim() || !field.label.trim() || seen.has(field.id))
        errors.push('Campos precisam de identificador único e rótulo.');
      if (
        ['select', 'multi'].includes(field.kind) &&
        (!field.options?.length ||
          field.options.some((o) => !o.trim()) ||
          new Set(field.options).size !== field.options.length)
      )
        errors.push('Informe opções únicas e não vazias.');
      if (
        field.when &&
        (!seen.has(field.when.field) || !field.when.includes.trim())
      )
        errors.push(
          'Uma condição deve referenciar um campo anterior e informar um valor.',
        );
      seen.add(field.id);
    }
  }
  return errors;
}

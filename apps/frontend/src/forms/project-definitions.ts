import type { ServiceField } from './service-definitions';
export const projectCategories = [
  {
    id: 'software',
    name: 'Desenvolvimento de software',
    description: 'Aplicações e soluções para os processos da empresa.',
  },
  {
    id: 'bi',
    name: 'Análise de Dados / Business Intelligence',
    description: 'Indicadores, relatórios e análises para decisões.',
  },
  {
    id: 'network',
    name: 'Infraestrutura de rede',
    description: 'Conectividade e estrutura tecnológica.',
  },
  {
    id: 'automation',
    name: 'Automações de processos',
    description: 'Redução de atividades repetitivas.',
  },
  {
    id: 'integration',
    name: 'Integração entre sistemas',
    description: 'Conectar informações e processos.',
  },
  {
    id: 'security',
    name: 'Segurança da informação',
    description: 'Melhorias de proteção sem informar dados sensíveis.',
  },
  {
    id: 'improvement',
    name: 'Melhorias tecnológicas',
    description: 'Evolução do ambiente de trabalho.',
  },
];
const general: ServiceField[] = [
  { id: 'objective', label: 'Objetivo do projeto', kind: 'textarea' },
  { id: 'need', label: 'Problema ou necessidade atual', kind: 'textarea' },
  { id: 'department', label: 'Setor solicitante', kind: 'text' },
  { id: 'benefits', label: 'Benefícios esperados', kind: 'textarea' },
  { id: 'impact', label: 'Impacto operacional', kind: 'textarea' },
  { id: 'users', label: 'Usuários beneficiados (estimativa)', kind: 'number' },
  {
    id: 'deadline',
    label: 'Prazo desejado',
    kind: 'date',
    hint: 'Apenas uma expectativa; não é compromisso ou SLA.',
  },
  {
    id: 'attachments',
    label: 'Anexo opcional do projeto',
    kind: 'file',
    hint: 'Somente o nome será mantido. Não há upload.',
  },
];
const extras: Record<string, ServiceField[]> = {
  software: [
    { id: 'features', label: 'Funcionalidades desejadas', kind: 'textarea' },
    { id: 'systems', label: 'Sistemas existentes envolvidos', kind: 'text' },
    { id: 'process', label: 'Processo que será melhorado', kind: 'textarea' },
  ],
  bi: [
    { id: 'indicators', label: 'Indicadores desejados', kind: 'textarea' },
    { id: 'sources', label: 'Fontes de dados', kind: 'text' },
    { id: 'audience', label: 'Público dos relatórios', kind: 'text' },
  ],
  network: [
    { id: 'location', label: 'Local ou unidade', kind: 'text' },
    { id: 'technicalNeed', label: 'Necessidade técnica', kind: 'textarea' },
    {
      id: 'equipment',
      label: 'Pontos ou equipamentos (estimativa)',
      kind: 'number',
    },
  ],
  automation: [
    { id: 'process', label: 'Processo a automatizar', kind: 'textarea' },
    { id: 'tools', label: 'Ferramentas atualmente utilizadas', kind: 'text' },
  ],
  integration: [
    { id: 'systems', label: 'Sistemas envolvidos', kind: 'text' },
    { id: 'flow', label: 'Fluxo esperado entre sistemas', kind: 'textarea' },
  ],
  security: [
    {
      id: 'context',
      label: 'Contexto da melhoria de segurança',
      kind: 'textarea',
      hint: 'Não inclua senhas, vulnerabilidades detalhadas ou dados sensíveis.',
    },
  ],
  improvement: [
    { id: 'context', label: 'Melhoria tecnológica desejada', kind: 'textarea' },
  ],
};
export function projectFields(categoryId: string): ServiceField[] {
  return [...general, ...(extras[categoryId] ?? [])];
}
export function projectCategoryName(id: string) {
  return (
    projectCategories.find((c) => c.id === id)?.name ?? 'Categoria histórica'
  );
}

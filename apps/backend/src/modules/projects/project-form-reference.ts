import { randomUUID } from 'node:crypto';
import { editableFormSchema } from '@helpdesk/contracts';
import type { EditableForm } from '@helpdesk/contracts';

// Initial reference only. Runtime forms must always come from published database versions.
// No conditional rules or mandatory extras were defined in the approved preview.
const common = [
  ['objective', 'Objetivo do projeto', 'LONG_TEXT'],
  ['need', 'Problema ou necessidade atual', 'LONG_TEXT'],
  ['department', 'Setor solicitante', 'TEXT'],
  ['benefits', 'Benefícios esperados', 'LONG_TEXT'],
  ['impact', 'Impacto operacional', 'LONG_TEXT'],
  ['users', 'Usuários beneficiados (estimativa)', 'NUMBER'],
  ['deadline', 'Prazo desejado', 'DATE'],
  ['attachments', 'Anexo opcional do projeto', 'FILE'],
] as const;
export const projectCategoryReferences = [
  {
    key: 'software',
    name: 'Desenvolvimento de software',
    description: 'Aplicações e soluções para os processos da empresa.',
    fields: [
      ['features', 'Funcionalidades desejadas', 'LONG_TEXT'],
      ['systems', 'Sistemas existentes envolvidos', 'TEXT'],
      ['process', 'Processo que será melhorado', 'LONG_TEXT'],
    ],
  },
  {
    key: 'bi',
    name: 'Análise de Dados / Business Intelligence',
    description: 'Indicadores, relatórios e análises para decisões.',
    fields: [
      ['indicators', 'Indicadores desejados', 'LONG_TEXT'],
      ['sources', 'Fontes de dados', 'TEXT'],
      ['audience', 'Público dos relatórios', 'TEXT'],
    ],
  },
  {
    key: 'network',
    name: 'Infraestrutura de rede',
    description: 'Conectividade e estrutura tecnológica.',
    fields: [
      ['location', 'Local ou unidade', 'TEXT'],
      ['technicalNeed', 'Necessidade técnica', 'LONG_TEXT'],
      ['equipment', 'Pontos ou equipamentos (estimativa)', 'NUMBER'],
    ],
  },
  {
    key: 'automation',
    name: 'Automações de processos',
    description: 'Redução de atividades repetitivas.',
    fields: [
      ['process', 'Processo a automatizar', 'LONG_TEXT'],
      ['tools', 'Ferramentas atualmente utilizadas', 'TEXT'],
    ],
  },
  {
    key: 'integration',
    name: 'Integração entre sistemas',
    description: 'Conectar informações e processos.',
    fields: [
      ['systems', 'Sistemas envolvidos', 'TEXT'],
      ['flow', 'Fluxo esperado entre sistemas', 'LONG_TEXT'],
    ],
  },
  {
    key: 'security',
    name: 'Segurança da informação',
    description: 'Melhorias de proteção sem informar dados sensíveis.',
    fields: [['context', 'Contexto da melhoria de segurança', 'LONG_TEXT']],
  },
  {
    key: 'improvement',
    name: 'Melhorias tecnológicas',
    description: 'Evolução do ambiente de trabalho.',
    fields: [['context', 'Melhoria tecnológica desejada', 'LONG_TEXT']],
  },
] as const;

export function initialProjectForm(key: string): EditableForm {
  const category = projectCategoryReferences.find((c) => c.key === key);
  if (!category) throw new Error('Categoria de referência inexistente.');
  return editableFormSchema.parse({
    title: category.name,
    description: category.description,
    fields: [...common, ...category.fields].map(([fieldKey, label, type]) => ({
      id: randomUUID(),
      key: fieldKey,
      label,
      type,
      required: fieldKey === 'objective' || fieldKey === 'need',
      ...(fieldKey === 'deadline'
        ? { help: 'Apenas uma expectativa; não é compromisso ou SLA.' }
        : {}),
      ...(key === 'security' && fieldKey === 'context'
        ? {
            help: 'Não inclua senhas, vulnerabilidades detalhadas ou dados sensíveis.',
          }
        : {}),
    })),
  });
}

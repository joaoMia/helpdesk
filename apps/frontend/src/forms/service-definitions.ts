// Definições visuais em validação. Editor demonstrativo em memória; não são schema da API nem motor de produção.
export type Answer = string | string[];
export type ServiceAnswers = Record<string, Answer>;
export type AnswersByService = Partial<Record<string, ServiceAnswers>>;
export interface ServiceField {
  id: string;
  label: string;
  kind:
    | 'text'
    | 'textarea'
    | 'email'
    | 'url'
    | 'file'
    | 'multi'
    | 'select'
    | 'datetime-local'
    | 'date'
    | 'number'
    | 'checkbox';
  required?: boolean;
  options?: string[];
  hint?: string;
  when?: { field: string; includes: string };
}
export const serviceForms: Record<string, ServiceField[]> = {
  s1: [
    {
      id: 'systems',
      label: 'Sistemas',
      kind: 'multi',
      options: ['TOTVS', 'Spark', 'Portal Permetal'],
      required: true,
      hint: 'Um ou mais sistemas nesta demonstração; cardinalidade ainda em validação.',
    },
    { id: 'fullName', label: 'Nome completo', kind: 'text', required: true },
    { id: 'department', label: 'Setor', kind: 'text', required: true },
    { id: 'extra', label: 'Descrição complementar', kind: 'textarea' },
    {
      id: 'modules',
      label: 'Acessos e módulos a liberar',
      kind: 'textarea',
      required: true,
      when: { field: 'systems', includes: 'TOTVS' },
    },
    {
      id: 'accessHours',
      label: 'Horário de acesso',
      kind: 'text',
      required: true,
      when: { field: 'systems', includes: 'TOTVS' },
    },
    {
      id: 're',
      label: 'RE',
      kind: 'text',
      required: true,
      when: { field: 'systems', includes: 'Portal Permetal' },
    },
    {
      id: 'email',
      label: 'E-mail',
      kind: 'email',
      required: true,
      when: { field: 'systems', includes: 'Portal Permetal' },
    },
    {
      id: 'manager',
      label: 'Responsável',
      kind: 'text',
      required: true,
      when: { field: 'systems', includes: 'Portal Permetal' },
    },
  ],
  s2: [
    { id: 'application', label: 'Nome do aplicativo', kind: 'text' },
    {
      id: 'website',
      label: 'Site do aplicativo',
      kind: 'url',
      required: true,
      hint: 'URL com http:// ou https://. Não informe tokens ou credenciais.',
    },
    {
      id: 'windowsUser',
      label: 'Usuário Windows para acesso remoto',
      kind: 'text',
      required: true,
      hint: 'Somente identificação fictícia. Nunca informe a senha.',
    },
  ],
  s3: [
    { id: 'systemUser', label: 'Usuário do sistema', kind: 'text' },
    {
      id: 'module',
      label: 'Módulo com problema',
      kind: 'text',
      required: true,
    },
    {
      id: 'problem',
      label: 'Descrição do problema',
      kind: 'textarea',
      required: true,
    },
    {
      id: 'evidence',
      label: 'Anexo do problema',
      kind: 'file',
      required: true,
      hint: 'Obrigatório nesta proposta. Apenas o nome é mantido; não há upload.',
    },
  ],
};
export function visibleFields(
  serviceId: string,
  answers: ServiceAnswers,
  fields = serviceForms[serviceId] ?? [],
) {
  const visible: ServiceField[] = [];
  for (const field of fields) {
    const condition = field.when,
      value = condition ? answers[condition.field] : undefined;
    if (
      !condition ||
      (visible.some((f) => f.id === condition.field) &&
        (Array.isArray(value)
          ? value.includes(condition.includes)
          : value === condition.includes))
    )
      visible.push(field);
  }
  return visible;
}
export function sanitizeAnswers(
  serviceId: string,
  answers: ServiceAnswers,
  fields = serviceForms[serviceId] ?? [],
): ServiceAnswers {
  return Object.fromEntries(
    visibleFields(serviceId, answers, fields)
      .filter((f) => answers[f.id] !== undefined)
      .map((f) => [
        f.id,
        Array.isArray(answers[f.id])
          ? [...(answers[f.id] as string[])]
          : answers[f.id]!,
      ]),
  );
}
export function validateAnswers(
  serviceId: string,
  answers: ServiceAnswers,
  fields = serviceForms[serviceId] ?? [],
) {
  const errors: Record<string, string> = {};
  for (const field of visibleFields(serviceId, answers, fields)) {
    const value = answers[field.id];
    const text = typeof value === 'string' ? value.trim() : '';
    if (
      field.required &&
      (field.kind === 'multi'
        ? !Array.isArray(value) || !value.length
        : field.kind === 'checkbox'
          ? text !== 'yes'
          : !text)
    )
      errors[field.id] = `Preencha ${field.label.toLocaleLowerCase('pt-BR')}.`;
    else if (
      (field.kind === 'multi' &&
        Array.isArray(value) &&
        value.some((v) => !field.options?.includes(v))) ||
      (field.kind === 'select' && !!text && !field.options?.includes(text))
    )
      errors[field.id] = 'Selecione somente as opções disponíveis.';
    else if (
      text &&
      ['number'].includes(field.kind) &&
      (!Number.isFinite(Number(text)) || Number(text) < 0)
    )
      errors[field.id] = 'Informe um número não negativo.';
    else if (
      text &&
      ['date', 'datetime-local'].includes(field.kind) &&
      !Number.isFinite(Date.parse(text))
    )
      errors[field.id] = 'Informe uma data válida.';
    else if (
      text &&
      field.kind === 'email' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
    )
      errors[field.id] = 'Informe um e-mail válido.';
    else if (text && field.kind === 'url') {
      try {
        const url = new URL(text);
        if (
          !['https:', 'http:'].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error();
      } catch {
        errors[field.id] = 'Informe uma URL http(s) válida, sem credenciais.';
      }
    }
  }
  return errors;
}

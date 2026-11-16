import { initialCatalog } from '../mocks/catalog';
import type { EditableForm, FormField } from '@helpdesk/contracts';
// Approved visual definitions are templates only. They never insert catalog rows,
// users, tickets or field answers, and are published only by an ADMIN action.
const typeMap = {
  text: 'TEXT',
  textarea: 'LONG_TEXT',
  email: 'EMAIL',
  url: 'URL',
  file: 'FILE',
  multi: 'MULTI_SELECT',
  select: 'SELECT',
  'datetime-local': 'DATE_TIME',
  date: 'DATE',
  number: 'NUMBER',
  checkbox: 'CHECKBOX',
} as const;
export const serviceFormTemplates = initialCatalog().services.map(
  (service) => ({ id: service.id, name: service.name }),
);
export function makeServiceFormTemplate(id: string): EditableForm {
  const service = initialCatalog().services.find((s) => s.id === id);
  if (!service) throw Error('Modelo não encontrado');
  const fields: FormField[] = service.fields.map((field) => ({
    id: crypto.randomUUID(),
    key: field.id,
    label: field.label,
    type: typeMap[field.kind],
    required: field.required ?? false,
    ...(field.options ? { options: [...field.options] } : {}),
    ...(field.hint ? { help: field.hint } : {}),
    ...(field.when ? { condition: { ...field.when } } : {}),
  }));
  if (id === 's2' && !fields.some((f) => f.key === 'reason'))
    fields.push({
      id: crypto.randomUUID(),
      key: 'reason',
      label: 'Motivo da instalação',
      type: 'LONG_TEXT',
      required: false,
    });
  for (const field of fields) {
    if (id === 's1' && field.key === 'systems') field.type = 'SELECT';
    if (field.help && /demonstrativ|cardinalidade ainda/i.test(field.help))
      delete field.help;
    if (field.key === 'windowsUser')
      field.help =
        'Informe somente o identificador Windows. Nunca informe a senha.';
    if (id === 's2' && field.key === 'website')
      field.label = 'URL para instalação';
  }
  return { title: service.name, description: '', fields };
}

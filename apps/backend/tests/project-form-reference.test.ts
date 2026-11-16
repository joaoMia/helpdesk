import { it, expect } from '@jest/globals';
import {
  initialProjectForm,
  projectCategoryReferences,
} from '../src/modules/projects/project-form-reference.js';
import { readFileSync } from 'node:fs';
const preview = readFileSync(
  new URL('../../frontend/src/forms/project-definitions.ts', import.meta.url),
  'utf8',
);

it('normaliza as sete categorias e campos da prévia sem criar seleções ou condições novas', () => {
  expect(
    projectCategoryReferences.map((c) => [c.key, c.name, c.description]),
  ).toEqual(
    [
      ...preview.matchAll(
        /id: '([^']+)',\s+name: '([^']+)',\s+description: '([^']+)'/g,
      ),
    ].map((m) => [m[1], m[2], m[3]]),
  );
  for (const category of projectCategoryReferences) {
    const form = initialProjectForm(category.key);
    for (const field of form.fields) {
      expect(preview).toContain(`id: '${field.key}'`);
      expect(preview).toContain(`label: '${field.label}'`);
    }
    expect(form.fields.filter((f) => f.required).map((f) => f.key)).toEqual([
      'objective',
      'need',
    ]);
    expect(form.fields.find((f) => f.key === 'attachments')).toMatchObject({
      type: 'FILE',
      required: false,
    });
    expect(form.fields.every((f) => !f.options && !f.condition)).toBe(true);
    expect(new Set(form.fields.map((f) => f.id)).size).toBe(form.fields.length);
  }
});
it('não compartilha IDs entre definições novas nem modifica a referência ao editar uma cópia', () => {
  const first = initialProjectForm('software');
  const second = initialProjectForm('software');
  expect(first.fields[0]!.id).not.toBe(second.fields[0]!.id);
  first.fields[0]!.label = 'Campo editado pelo administrador';
  expect(initialProjectForm('software').fields[0]!.label).toBe(
    'Objetivo do projeto',
  );
  expect(() => initialProjectForm('unknown')).toThrow();
});

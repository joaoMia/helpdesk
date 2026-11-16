import { createTicketHttpSchema, visibleFormKeys } from '@helpdesk/contracts';
import type { FormField } from '@helpdesk/contracts';
// Used for BOTH review and the final POST, so the confirmed answers cannot be
// silently replaced by a basic-form payload at the last step.
export function openingPayload(
  input: {
    serviceId: string;
    formVersionId: string;
    subject: string;
    description: string;
    answers: Record<string, string | string[] | boolean | number>;
  },
  fields: FormField[],
) {
  const visible = visibleFormKeys(fields, input.answers),
    answers: typeof input.answers = {};
  for (const f of fields)
    if (visible.has(f.key) && Object.hasOwn(input.answers, f.key)) {
      const value = input.answers[f.key];
      answers[f.key] =
        f.type === 'DATE_TIME' &&
        typeof value === 'string' &&
        value &&
        !Number.isNaN(new Date(value).getTime())
          ? new Date(value).toISOString()
          : value!;
    }
  return createTicketHttpSchema.safeParse({ ...input, answers });
}

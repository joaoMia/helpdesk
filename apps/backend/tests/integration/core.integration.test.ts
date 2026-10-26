import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import {
  constraintFailure,
  coreFixture,
  developmentFingerprint,
  prepareReviewSql,
  reviewTransaction,
} from './review-database.js';

let before: Awaited<ReturnType<typeof developmentFingerprint>>;
beforeAll(async () => {
  prepareReviewSql();
  before = await developmentFingerprint();
  expect(before.database).not.toBe('helpdesk_test');
});
afterAll(async () => {
  expect(await developmentFingerprint()).toEqual(before);
});

describe('Prisma 7 / PostgreSQL 18: DDL e dados somente em transações desfeitas de helpdesk_test', () => {
  it('constraints permitem abrir, classificar sem atribuir, assumir e evoluir estados sem mudar o histórico', async () => {
    await reviewTransaction(async (tx) => {
      const f = await coreFixture(tx);
      const opened = await f.useCase.open(f.requester.id, f.input);
      const where = { id: opened.id };
      expect(opened).toMatchObject({
        status: 'OPEN',
        priority: null,
        assignedTechnicianId: null,
      });

      // Only database compatibility checks; no functional transition handler/API.
      const classified = await tx.ticket.update({
        where,
        data: {
          priority: 'HIGH',
          classifiedById: f.technician.id,
          classifiedAt: new Date(),
        },
      });
      expect(classified.status).toBe('OPEN');
      expect(classified.assignedTechnicianId).toBeNull();
      expect(classified.firstStartedAt).toBeNull();

      const firstStartedAt = new Date();
      const started = await tx.ticket.update({
        where,
        data: {
          status: 'IN_PROGRESS',
          assignedTechnicianId: f.technician.id,
          firstStartedAt,
        },
      });
      expect(started.status).toBe('IN_PROGRESS');
      expect(started.assignedTechnicianId).toBe(f.technician.id);
      for (const status of ['PENDING', 'IN_PROGRESS'] as const) {
        const row = await tx.ticket.update({ where, data: { status } });
        expect(row.status).toBe(status);
        expect(row.assignedTechnicianId).toBe(f.technician.id);
        expect(row.firstStartedAt).toEqual(firstStartedAt);
      }
      const closed = await tx.ticket.update({
        where,
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedById: f.technician.id,
        },
      });
      expect(closed.status).toBe('CLOSED');
      expect(closed.closedAt).not.toBeNull();
      expect(closed.serviceSnapshot).toEqual(opened.serviceSnapshot);
      expect(closed.serviceId).toBe(f.service.id);
      expect(closed.formVersionId).toBe(f.form.id);
      expect(await tx.ticketAnswer.count()).toBe(1);
      expect(await tx.ticketEvent.count()).toBe(1);
    });
  });

  it('abre com um serviço, defaults nulos, respostas e auditoria na mesma transação', async () => {
    await reviewTransaction(async (tx) => {
      const f = await coreFixture(tx),
        opened = await f.useCase.open(f.requester.id, f.input);
      const row = await tx.ticket.findUniqueOrThrow({
        where: { id: opened.id },
        include: { answers: true, events: true },
      });
      expect(row.status).toBe('OPEN');
      expect(row.priority).toBeNull();
      expect(row.assignedTechnicianId).toBeNull();
      expect(row.firstStartedAt).toBeNull();
      expect(row.serviceId).toBe(f.service.id);
      expect(row.formVersionId).toBe(f.form.id);
      expect(row.answers).toHaveLength(1);
      expect(row.answers[0]?.value).toBe('Resposta válida');
      expect(row.events).toHaveLength(1);
      expect(row.events[0]?.eventType).toBe('OPENED');
      expect(row.events[0]?.actorId).toBe(f.requester.id);
      expect(JSON.stringify(row.serviceSnapshot)).not.toContain('password');
      expect(row.serviceSnapshot).not.toHaveProperty('priceCents');
      const columns = await tx.$queryRaw<
        { name: string }[]
      >`SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='services'`;
      expect(columns.map((column) => column.name)).not.toContain('price_cents');
    });
  });
  it('impõe categoria existente e protege categoria/serviço usados por histórico', async () => {
    await reviewTransaction(async (tx) => {
      const f = await coreFixture(tx);
      await f.useCase.open(f.requester.id, f.input);
      await constraintFailure(tx, () =>
        tx.service.create({
          data: { categoryId: randomUUID(), name: 'Inválido' },
        }),
      );
      await constraintFailure(tx, () =>
        tx.serviceCategory.delete({ where: { id: f.category.id } }),
      );
      await constraintFailure(tx, () =>
        tx.service.delete({ where: { id: f.service.id } }),
      );
    });
  });
  it('recusa ticket sem serviço e formulário de outro serviço por integridade referencial', async () => {
    await reviewTransaction(async (tx) => {
      const f = await coreFixture(tx),
        second = await tx.service.create({
          data: { categoryId: f.category.id, name: 'Outro' },
        });
      const otherForm = await tx.serviceFormVersion.create({
        data: { serviceId: second.id, version: 1 },
      });
      await constraintFailure(
        tx,
        () =>
          tx.$executeRaw`INSERT INTO tickets (requester_id, form_version_id, subject, description, service_snapshot) VALUES (${f.requester.id}::uuid,${f.form.id}::uuid,'x','x','{}'::jsonb)`,
      );
      await constraintFailure(tx, () =>
        tx.ticket.create({
          data: {
            requesterId: f.requester.id,
            serviceId: f.service.id,
            formVersionId: otherForm.id,
            subject: 'x',
            description: 'x',
            serviceSnapshot: {
              serviceId: f.service.id,
              formVersionId: otherForm.id,
            },
          },
        }),
      );
      expect(await tx.ticket.count()).toBe(0);
    });
  });
  it('respostas pertencem à versão do ticket e são únicas por chave', async () => {
    await reviewTransaction(async (tx) => {
      const f = await coreFixture(tx),
        opened = await f.useCase.open(f.requester.id, f.input);
      const another = await tx.serviceFormVersion.create({
        data: {
          serviceId: f.service.id,
          version: 2,
          fields: { create: { key: 'another', label: 'Outro', type: 'TEXT' } },
        },
        include: { fields: true },
      });
      await constraintFailure(tx, () =>
        tx.ticketAnswer.create({
          data: {
            ticketId: opened.id,
            formVersionId: f.form.id,
            fieldId: another.fields[0]!.id,
            fieldKey: 'another',
            value: 'x',
          },
        }),
      );
      await constraintFailure(tx, () =>
        tx.ticketAnswer.create({
          data: {
            ticketId: opened.id,
            formVersionId: f.form.id,
            fieldId: f.form.fields[0]!.id,
            fieldKey: 'context',
            value: 'duplicada',
          },
        }),
      );
      expect(await tx.ticketAnswer.count()).toBe(1);
    });
  });
  it('snapshot resiste à edição do catálogo; próximas aberturas usam a nova versão', async () => {
    await reviewTransaction(async (tx) => {
      const f = await coreFixture(tx),
        first = await f.useCase.open(f.requester.id, f.input);
      await tx.service.update({
        where: { id: f.service.id },
        data: { name: 'Alterado' },
      });
      await tx.serviceCategory.update({
        where: { id: f.category.id },
        data: { name: 'Categoria alterada' },
      });
      const nextForm = await tx.serviceFormVersion.create({
        data: {
          serviceId: f.service.id,
          version: 2,
          fields: {
            create: {
              key: 'context',
              label: 'Novo contexto',
              type: 'TEXT',
              required: true,
            },
          },
        },
      });
      const next = await f.useCase.open(f.requester.id, f.input);
      const old = await tx.ticket.findUniqueOrThrow({
        where: { id: first.id },
      });
      expect(old.serviceSnapshot).toEqual(first.serviceSnapshot);
      expect(first.serviceSnapshot.serviceName).toBe('Serviço de teste');
      expect(first.serviceSnapshot.fields[0]?.label).toBe('Contexto original');
      expect(first.serviceSnapshot).not.toHaveProperty('priceCents');
      expect(next.serviceSnapshot.serviceName).toBe('Alterado');
      expect(next.serviceSnapshot.formVersionId).toBe(nextForm.id);
    });
  });
  it('checks recusam atribuição na abertura e identidade de snapshot divergente ou nula', async () => {
    await reviewTransaction(async (tx) => {
      const f = await coreFixture(tx),
        opened = await f.useCase.open(f.requester.id, f.input);
      await constraintFailure(tx, () =>
        tx.ticket.update({
          where: { id: opened.id },
          data: { assignedTechnicianId: f.technician.id },
        }),
      );
      await constraintFailure(tx, () =>
        tx.ticket.update({
          where: { id: opened.id },
          data: {
            serviceSnapshot: {
              serviceId: randomUUID(),
              formVersionId: f.form.id,
            },
          },
        }),
      );
      await constraintFailure(tx, () =>
        tx.ticket.update({
          where: { id: opened.id },
          data: {
            serviceSnapshot: { serviceId: null, formVersionId: f.form.id },
          },
        }),
      );
    });
  });
  it('consulta papel/atividade reais e não grava quando a identidade não pode abrir', async () => {
    await reviewTransaction(async (tx) => {
      const f = await coreFixture(tx);
      await expect(
        f.useCase.open(f.technician.id, f.input),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await tx.user.update({
        where: { id: f.requester.id },
        data: { isActive: false },
      });
      await expect(
        f.useCase.open(f.requester.id, f.input),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(await tx.ticket.count()).toBe(0);
    });
  });
  it('email é único sem distinção de caixa e cascata original remove conteúdo do solicitante', async () => {
    await reviewTransaction(async (tx) => {
      const f = await coreFixture(tx);
      await f.useCase.open(f.requester.id, f.input);
      await constraintFailure(tx, () =>
        tx.user.create({
          data: {
            role: 'REQUESTER',
            name: 'Duplicado',
            email: f.requester.email.toUpperCase(),
            passwordHash: 'TEST_ONLY_NOT_AN_AUTHENTICATABLE_HASH',
          },
        }),
      );
      await tx.user.delete({ where: { id: f.requester.id } });
      expect(await tx.ticket.count()).toBe(0);
      expect(await tx.ticketAnswer.count()).toBe(0);
      expect(await tx.ticketEvent.count()).toBe(0);
      expect(await tx.service.count()).toBe(1);
    });
  });

  it('protege definições de versões usadas, inclusive campos sem respostas e inclusão de campos', async () => {
    await reviewTransaction(async (tx) => {
      const f = await coreFixture(tx);
      const optional = await tx.serviceFormField.create({
        data: {
          formVersionId: f.form.id,
          key: 'optional',
          label: 'Sem resposta',
          type: 'TEXT',
        },
      });
      await f.useCase.open(f.requester.id, f.input);
      await constraintFailure(tx, () =>
        tx.serviceFormField.update({
          where: { id: optional.id },
          data: { type: 'CHECKBOX' },
        }),
      );
      await constraintFailure(tx, () =>
        tx.serviceFormField.update({
          where: { id: f.form.fields[0]!.id },
          data: { label: 'Alteração histórica' },
        }),
      );
      await constraintFailure(tx, () =>
        tx.serviceFormField.delete({ where: { id: f.form.fields[0]!.id } }),
      );
      await constraintFailure(tx, () =>
        tx.serviceFormField.create({
          data: {
            formVersionId: f.form.id,
            key: 'extra',
            label: 'Extra',
            type: 'TEXT',
            required: true,
          },
        }),
      );
      await constraintFailure(tx, () =>
        tx.serviceFormVersion.update({
          where: { id: f.form.id },
          data: { version: 5 },
        }),
      );
      const current = await tx.serviceFormField.findUniqueOrThrow({
        where: { id: f.form.fields[0]!.id },
      });
      expect(current.label).toBe('Contexto original');
      expect(await tx.ticketAnswer.count()).toBe(1);
    });
  });

  it('não sobrescreve snapshots nem troca o serviço histórico; classificação continua separada', async () => {
    await reviewTransaction(async (tx) => {
      const f = await coreFixture(tx),
        opened = await f.useCase.open(f.requester.id, f.input);
      const another = await tx.service.create({
        data: { name: 'Outro serviço', categoryId: f.category.id },
      });
      const version = await tx.serviceFormVersion.create({
        data: { serviceId: another.id, version: 1 },
      });
      await constraintFailure(tx, () =>
        tx.ticket.update({
          where: { id: opened.id },
          data: {
            serviceId: another.id,
            formVersionId: version.id,
            serviceSnapshot: {
              ...opened.serviceSnapshot,
              serviceId: another.id,
              formVersionId: version.id,
            },
          },
        }),
      );
      await constraintFailure(tx, () =>
        tx.ticket.update({
          where: { id: opened.id },
          data: {
            serviceSnapshot: {
              ...opened.serviceSnapshot,
              serviceName: 'Nome sobrescrito',
            },
          },
        }),
      );
      await tx.ticket.update({
        where: { id: opened.id },
        data: {
          priority: 'HIGH',
          classifiedById: f.technician.id,
          classifiedAt: new Date(),
        },
      });
      const row = await tx.ticket.findUniqueOrThrow({
        where: { id: opened.id },
      });
      expect(row.status).toBe('OPEN');
      expect(row.assignedTechnicianId).toBeNull();
      expect(row.serviceSnapshot).toEqual(opened.serviceSnapshot);
    });
  });

  it('o banco recusa prioridade/atribuição/estado de atendimento já na inserção', async () => {
    await reviewTransaction(async (tx) => {
      const f = await coreFixture(tx);
      for (const values of [
        { priority: 'HIGH' as const },
        { assignedTechnicianId: f.technician.id },
        {
          status: 'IN_PROGRESS' as const,
          priority: 'HIGH' as const,
          assignedTechnicianId: f.technician.id,
          firstStartedAt: new Date(),
        },
      ])
        await constraintFailure(tx, () =>
          tx.ticket.create({
            data: {
              requesterId: f.requester.id,
              serviceId: f.service.id,
              formVersionId: f.form.id,
              subject: 'x',
              description: 'x',
              serviceSnapshot: {
                serviceId: f.service.id,
                formVersionId: f.form.id,
              },
              ...values,
            },
          }),
        );
      expect(await tx.ticket.count()).toBe(0);
    });
  });

  it('trata definições como dados e recusa chave/campo de condição executável', async () => {
    await reviewTransaction(async (tx) => {
      const f = await coreFixture(tx);
      await constraintFailure(tx, () =>
        tx.serviceFormField.create({
          data: {
            formVersionId: f.form.id,
            key: 'constructor',
            label: 'Inválido',
            type: 'TEXT',
          },
        }),
      );
      await tx.serviceFormField.update({
        where: { id: f.form.fields[0]!.id },
        data: {
          condition: {
            field: 'context',
            includes: 'x',
            script: 'throw new Error("never execute")',
          },
        },
      });
      await expect(
        f.useCase.open(f.requester.id, f.input),
      ).rejects.toMatchObject({ code: 'FORM_UNAVAILABLE' });
      expect(await tx.ticket.count()).toBe(0);
    });
  });

  it('falha após gravar e reverte toda a transação, incluindo chamado, resposta, evento e namespace', async () => {
    await expect(
      reviewTransaction(async (tx) => {
        const f = await coreFixture(tx);
        await f.useCase.open(f.requester.id, f.input);
        expect(await tx.ticket.count()).toBe(1);
        expect(await tx.ticketAnswer.count()).toBe(1);
        expect(await tx.ticketEvent.count()).toBe(1);
        throw new Error('Falha injetada para validar rollback integral');
      }),
    ).rejects.toThrow('Falha injetada para validar rollback integral');
    // reviewTransaction verifies namespace absence in finally, also on failure.
  });
});

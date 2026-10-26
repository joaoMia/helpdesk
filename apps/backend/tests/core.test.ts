import { describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  openTicketInputSchema,
  formDefinitionSchema,
  userRoleSchema,
  serviceSnapshotSchema,
} from '@helpdesk/contracts';
import { TicketService } from '../src/modules/tickets/ticket.service.js';
import type {
  CatalogEntry,
  OpeningRecord,
  TicketRepository,
} from '../src/modules/tickets/ticket.repository.js';
import {
  developmentMigrationTarget,
  isolatedTestTarget,
} from '../src/database/test-target.js';
import { publicError } from '../src/shared/errors.js';
import { createApp } from '../src/app.js';

function fixture() {
  const id = randomUUID(),
    fieldId = randomUUID();
  const catalog: CatalogEntry = {
    id: randomUUID(),
    name: 'Serviço de teste',
    description: '',
    active: true,
    category: { id: randomUUID(), name: 'Categoria de teste', active: true },
    form: {
      id: randomUUID(),
      version: 1,
      fields: [
        {
          id: fieldId,
          key: 'context',
          label: 'Contexto',
          type: 'TEXT',
          required: true,
        },
      ],
    },
  };
  const stored: OpeningRecord[] = [];
  let role: 'REQUESTER' | 'TECHNICIAN' | 'ADMIN' = 'REQUESTER',
    active = true;
  const repository: TicketRepository = {
    transaction: async (operation) =>
      operation({
        findActor: async () => ({ id, role, active }),
        findCatalog: async () => catalog,
        insertOpening: async (record) => {
          stored.push(structuredClone(record));
          return {
            id: randomUUID(),
            code: 1,
            status: 'OPEN',
            priority: null,
            assignedTechnicianId: null,
            createdAt: new Date().toISOString(),
            serviceSnapshot: structuredClone(record.snapshot),
          };
        },
      }),
  };
  return {
    id,
    catalog,
    stored,
    service: new TicketService(repository),
    input: {
      subject: ' Contexto ',
      description: ' Descrição ',
      serviceId: catalog.id,
      answers: { context: ' Informação ' },
    },
    setRole: (value: typeof role) => {
      role = value;
    },
    disable: () => {
      active = false;
    },
  };
}
describe('contratos e serviço interno real', () => {
  it('aceita somente um serviceId e recusa campos controlados pelo servidor', () => {
    const f = fixture();
    expect(openTicketInputSchema.parse(f.input).subject).toBe('Contexto');
    for (const field of [
      'serviceIds',
      'priority',
      'assignedTechnicianId',
      'status',
      'requesterId',
      'serviceSnapshot',
      'role',
      'priceCents',
      'currency',
    ])
      expect(
        openTicketInputSchema.safeParse({
          ...f.input,
          [field]: 'não permitido',
        }).success,
      ).toBe(false);
    expect(
      openTicketInputSchema.safeParse({ ...f.input, serviceId: [f.catalog.id] })
        .success,
    ).toBe(false);
    expect(
      openTicketInputSchema.safeParse({ ...f.input, subject: ' ' }).success,
    ).toBe(false);
    expect(userRoleSchema.options).toEqual([
      'ADMIN',
      'TECHNICIAN',
      'REQUESTER',
    ]);
  });
  it('preserva estado inicial, snapshot independente e respostas tipadas', async () => {
    const f = fixture(),
      result = await f.service.open(f.id, f.input);
    expect(result).toMatchObject({
      status: 'OPEN',
      priority: null,
      assignedTechnicianId: null,
    });
    expect(f.stored[0]?.answers[0]?.value).toBe('Informação');
    expect(
      serviceSnapshotSchema.safeParse(result.serviceSnapshot).success,
    ).toBe(true);
    expect(result.serviceSnapshot).not.toHaveProperty('priceCents');
    expect(result.serviceSnapshot).not.toHaveProperty('currency');
    expect(
      serviceSnapshotSchema.safeParse({
        ...result.serviceSnapshot,
        priceCents: 100,
      }).success,
    ).toBe(false);
    f.catalog.name = 'Alterado';
    f.catalog.category.name = 'Outra';
    f.catalog.form!.fields[0]!.label = 'Outro';
    expect(result.serviceSnapshot.serviceName).toBe('Serviço de teste');
    expect(result.serviceSnapshot.fields[0]?.label).toBe('Contexto');
  });
  it('nega técnicos, administradores e contas inativas antes de escrever', async () => {
    const f = fixture();
    for (const role of ['TECHNICIAN', 'ADMIN'] as const) {
      f.setRole(role);
      await expect(f.service.open(f.id, f.input)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    }
    f.setRole('REQUESTER');
    f.disable();
    await expect(f.service.open(f.id, f.input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(f.service.open(undefined, f.input)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(f.stored).toHaveLength(0);
  });
  it('recusa catálogo inativo, categoria inativa e ausência de formulário', async () => {
    const f = fixture();
    f.catalog.active = false;
    await expect(f.service.open(f.id, f.input)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    f.catalog.active = true;
    f.catalog.category.active = false;
    await expect(f.service.open(f.id, f.input)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    f.catalog.category.active = true;
    f.catalog.form = null;
    await expect(f.service.open(f.id, f.input)).rejects.toMatchObject({
      code: 'FORM_UNAVAILABLE',
    });
    expect(f.stored).toHaveLength(0);
  });
  it('valida respostas e não promove anexos/condições da prévia a regras de produção', async () => {
    const f = fixture();
    for (const answers of [
      {},
      { context: [] },
      { context: 'ok', inexistente: 'x' },
    ])
      await expect(
        f.service.open(f.id, { ...f.input, answers }),
      ).rejects.toMatchObject({ code: 'INVALID_ANSWERS' });
    f.catalog.form!.fields[0]!.type = 'FILE';
    await expect(f.service.open(f.id, f.input)).rejects.toMatchObject({
      code: 'UPLOAD_PENDING',
    });
    f.catalog.form!.fields[0]!.type = 'TEXT';
    f.catalog.form!.fields.push({
      id: randomUUID(),
      key: 'conditional',
      label: 'Dependente',
      type: 'TEXT',
      required: false,
      condition: { field: 'context', includes: 'ok' },
    });
    await expect(f.service.open(f.id, f.input)).rejects.toMatchObject({
      code: 'FORM_RULES_PENDING',
    });
    expect(f.stored).toHaveLength(0);
  });
  it('recusa identidades de campo repetidas, seleções sem opções e condições inválidas', () => {
    const field = fixture().catalog.form!.fields[0]!;
    expect(formDefinitionSchema.safeParse([field, field]).success).toBe(false);
    expect(
      formDefinitionSchema.safeParse([{ ...field, type: 'SELECT' }]).success,
    ).toBe(false);
    expect(
      formDefinitionSchema.safeParse([
        { ...field, condition: { field: 'missing', includes: 'x' } },
      ]).success,
    ).toBe(false);
    expect(
      formDefinitionSchema.safeParse([{ ...field, key: 'constructor' }])
        .success,
    ).toBe(false);
  });
  it('valida seleções, checkbox falso e data/hora com offset sem assumir regras de calendário', async () => {
    const f = fixture();
    f.catalog.form!.fields = [
      {
        id: randomUUID(),
        key: 'choice',
        label: 'Escolha',
        type: 'SELECT',
        required: true,
        options: ['A', 'B'],
      },
      {
        id: randomUUID(),
        key: 'groups',
        label: 'Grupos',
        type: 'MULTI_SELECT',
        required: false,
        options: ['A', 'B'],
      },
      {
        id: randomUUID(),
        key: 'checked',
        label: 'Resposta booleana',
        type: 'CHECKBOX',
        required: true,
      },
      {
        id: randomUUID(),
        key: 'instant',
        label: 'Instante',
        type: 'DATE_TIME',
        required: true,
      },
    ];
    const valid = {
      choice: 'A',
      groups: ['A', 'B'],
      checked: false,
      instant: '2026-10-26T10:00:00-03:00',
    };
    for (const answers of [
      { ...valid, choice: 'C' },
      { ...valid, groups: ['A', 'A'] },
      { ...valid, checked: 'false' },
      { ...valid, instant: '2026-10-26T10:00:00' },
      { ...valid, instant: '2026-02-31T10:00:00Z' },
    ])
      await expect(
        f.service.open(f.id, { ...f.input, answers }),
      ).rejects.toMatchObject({ code: 'INVALID_ANSWERS' });
    expect(f.stored).toHaveLength(0);
    await f.service.open(f.id, { ...f.input, answers: valid });
    expect(
      f.stored[0]?.answers.find((a) => a.fieldKey === 'checked')?.value,
    ).toBe(false);
    expect(
      f.stored[0]?.answers.find((a) => a.fieldKey === 'instant')?.value,
    ).toBe('2026-10-26T13:00:00.000Z');
  });
});
describe('isolamento e superfície HTTP', () => {
  const config = {
    DATABASE_URL: 'postgresql://127.0.0.1/helpdesk_dev',
    TEST_DATABASE_URL: 'postgresql://127.0.0.1/helpdesk_test',
  };
  it('o runner inicial de migration recusa testes, produção, host remoto, schema diferente e bancos trocados', () => {
    expect(developmentMigrationTarget(config, 'development').database).toBe(
      'helpdesk_dev',
    );
    for (const environment of ['test', 'production'])
      expect(() => developmentMigrationTarget(config, environment)).toThrow();
    for (const url of [
      config.TEST_DATABASE_URL,
      'postgresql://example.invalid/helpdesk_dev',
      'postgresql://127.0.0.1/helpdesk_dev?schema=other',
    ])
      expect(() =>
        developmentMigrationTarget(
          { ...config, DATABASE_URL: url },
          'development',
        ),
      ).toThrow();
  });
  it('recusa banco de desenvolvimento, aliases do mesmo banco, host remoto e ambiente incorreto', () => {
    expect(isolatedTestTarget(config, 'test').database).toBe('helpdesk_test');
    expect(() =>
      isolatedTestTarget(
        { ...config, DATABASE_URL: 'postgresql://localhost/helpdesk_test' },
        'test',
      ),
    ).toThrow();
    expect(() =>
      isolatedTestTarget(
        { ...config, TEST_DATABASE_URL: config.DATABASE_URL },
        'test',
      ),
    ).toThrow();
    expect(() =>
      isolatedTestTarget(
        {
          ...config,
          TEST_DATABASE_URL: 'postgresql://example.invalid/helpdesk_test',
        },
        'test',
      ),
    ).toThrow();
    expect(() => isolatedTestTarget(config, 'development')).toThrow();
    const secret = 'valor-privado-de-teste';
    expect(() =>
      isolatedTestTarget({ ...config, TEST_DATABASE_URL: secret }, 'test'),
    ).not.toThrow(secret);
  });
  it('erros de persistência não expõem SQL, credenciais ou detalhes do driver', () => {
    for (const code of ['P2002', 'P2003', 'P2034', 'P1001', 'P2025']) {
      const result = publicError({
        code,
        message: 'segredo',
        meta: { sql: 'privado' },
      });
      expect(JSON.stringify(result)).not.toContain('segredo');
      expect(JSON.stringify(result)).not.toContain('privado');
      expect(result.status).toBeGreaterThanOrEqual(400);
    }
    expect(
      publicError({
        code: 'P2039',
        meta: {
          driverAdapterError: {
            cause: { originalCode: '23514', originalMessage: 'privado' },
          },
        },
      }).status,
    ).toBe(409);
    expect(
      publicError({
        code: 'P2039',
        meta: { driverAdapterError: { cause: { originalCode: '42P01' } } },
      }).status,
    ).toBe(500);
  });
  it('não expõe login nem rotas de escrita de chamados; perfil demonstrativo não autoriza', async () => {
    for (const path of ['/api/v1/tickets', '/tickets', '/auth/login']) {
      const response = await request(createApp())
        .post(path)
        .send({ role: 'ADMIN', requesterId: randomUUID() });
      expect(response.status).toBe(404);
      expect(response.body.error.requestId).toBe(
        response.headers['x-request-id'],
      );
    }
  });
  it('limita corpo HTTP e não reutiliza requestId fornecido pelo cliente', async () => {
    const response = await request(createApp())
      .post('/tickets')
      .set('X-Request-Id', 'valor-nao-confiavel')
      .send({ payload: 'x'.repeat(17000) });
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(response.headers['x-request-id']).not.toBe('valor-nao-confiavel');
  });
});

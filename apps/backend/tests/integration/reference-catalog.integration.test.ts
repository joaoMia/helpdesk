import { beforeEach, afterEach, it, expect } from '@jest/globals';
import { authTestDatabase } from './auth-database.js';
import { syncReferenceCatalog } from '../../src/modules/catalog/sync-reference.js';
let d: Awaited<ReturnType<typeof authTestDatabase>>;
beforeEach(async () => {
  d = await authTestDatabase();
});
afterEach(async () => {
  await d.dispose();
});
it('catálogo básico: planejamento não grava; seis categorias e dezesseis serviços sem campos fictícios; reexecução idempotente', async () => {
  const plan = await syncReferenceCatalog(d.db);
  expect(plan.created).toBe(22);
  expect(await d.db.service.count()).toBe(0);
  const first = await syncReferenceCatalog(d.db, true);
  expect(first.created).toBe(22);
  expect(await d.db.serviceCategory.count()).toBe(6);
  expect(await d.db.service.count()).toBe(16);
  expect(await d.db.serviceFormVersion.count()).toBe(16);
  expect(await d.db.serviceFormField.count()).toBe(0);
  expect(
    (
      await d.db.service.findFirstOrThrow({
        where: { name: 'Equipamentos legados' },
      })
    ).isActive,
  ).toBe(false);
  expect((await syncReferenceCatalog(d.db, true)).created).toBe(0);
  expect(await d.db.adminAuditEvent.count()).toBe(22);
});
it('mapeamento persistido preserva renomeações, inatividade, IDs e dados anteriores', async () => {
  const cat = await d.db.serviceCategory.create({
    data: { name: 'Wíndows', description: 'Descrição própria' },
  });
  const existing = await d.db.service.create({
    data: {
      name: 'Instalação de aplicativo',
      categoryId: cat.id,
      isActive: false,
      description: 'Edição própria',
      forms: { create: { version: 1 } },
    },
  });
  await syncReferenceCatalog(d.db, true);
  await d.db.serviceCategory.update({
    where: { id: cat.id },
    data: { name: 'Categoria personalizada', isActive: false },
  });
  await d.db.service.update({
    where: { id: existing.id },
    data: { name: 'Nome personalizado' },
  });
  const second = await syncReferenceCatalog(d.db, true);
  expect(second.created).toBe(0);
  expect(await d.db.service.count()).toBe(16);
  expect(
    await d.db.service.findUniqueOrThrow({ where: { id: existing.id } }),
  ).toMatchObject({
    name: 'Nome personalizado',
    description: 'Edição própria',
    isActive: false,
    categoryId: cat.id,
  });
});
it('homônimos e categoria conflitante são ignorados sem sobrescrever registros', async () => {
  const c = await d.db.serviceCategory.create({ data: { name: 'Windows' } });
  await d.db.serviceCategory.create({ data: { name: 'windows' } });
  const other = await d.db.serviceCategory.create({ data: { name: 'Outro' } });
  const service = await d.db.service.create({
    data: { name: 'Problema no sistema', categoryId: other.id },
  });
  const result = await syncReferenceCatalog(d.db, true);
  expect(result.ignored).toBeGreaterThan(1);
  expect(
    await d.db.serviceCategory.findUnique({ where: { id: c.id } }),
  ).not.toBeNull();
  expect(
    (await d.db.service.findUniqueOrThrow({ where: { id: service.id } }))
      .categoryId,
  ).toBe(other.id);
  expect(
    await d.db.service.count({ where: { name: 'Problema no sistema' } }),
  ).toBe(1);
});

import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';

describe('fundação da API em ESM', () => {
  it('responde ao healthcheck sem configurar banco de dados', async () => {
    const response = await request(createApp()).get('/health');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.body).toEqual({ status: 'ok', service: 'helpdesk-api' });
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('retorna erro JSON para rota inexistente', async () => {
    const response = await request(createApp()).get('/nao-existe');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('rejeita JSON malformado sem expor detalhes internos', async () => {
    const response = await request(createApp())
      .post('/nao-existe')
      .set('Content-Type', 'application/json')
      .send('{invalido');
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'INVALID_JSON',
      message: 'JSON inválido.',
    });
    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );
  });

  it('valida porta e permite ambiente sem DATABASE_URL', () => {
    expect(parseEnvironment({ NODE_ENV: 'test', PORT: '3001' }).PORT).toBe(
      3001,
    );
    expect(() => parseEnvironment({ PORT: '70000' })).toThrow('PORT');
    expect(() => parseEnvironment({ NODE_ENV: 'incorreto' })).toThrow(
      'NODE_ENV',
    );
  });

  it('não revela uma URL inválida que contenha credenciais', () => {
    const value = 'segredo-nao-deve-aparecer';
    try {
      parseEnvironment({ DATABASE_URL: value });
      throw new Error('Validação deveria rejeitar a URL.');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('DATABASE_URL');
      expect((error as Error).message).not.toContain(value);
    }
  });
});

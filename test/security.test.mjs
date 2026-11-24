import { test, expect, afterEach } from '@jest/globals';
import { QueryValidator } from '../dist/security.js';

afterEach(() => { delete process.env.SQLSERVER_UNSAFE_NONCE; });

test('default: write queries are rejected', () => {
  expect(QueryValidator.validateQuery('UPDATE t SET x=1').isValid).toBe(false);
  expect(QueryValidator.validateQuery('SELECT 1').isValid).toBe(true);
});

test('nonce: any query is allowed', () => {
  process.env.SQLSERVER_UNSAFE_NONCE = 'i_sure_know_what_i_am_doing';
  for (const q of ['UPDATE t SET x=1', 'DROP TABLE t', 'EXEC sp_who', 'SELECT 1; SELECT 2 -- x']) {
    expect(QueryValidator.validateQuery(q).isValid).toBe(true);
  }
});

test('nonce: empty query still rejected', () => {
  process.env.SQLSERVER_UNSAFE_NONCE = 'i_sure_know_what_i_am_doing';
  expect(QueryValidator.validateQuery('   ').isValid).toBe(false);
});

test('wrong nonce value does not bypass', () => {
  process.env.SQLSERVER_UNSAFE_NONCE = 'true';
  expect(QueryValidator.validateQuery('DELETE FROM t').isValid).toBe(false);
});

test('contract: execute_query description and schema reflect unsafe mode', async () => {
  const { ExecuteQueryTool } = await import('../dist/tools/execute-query.js');
  const tool = new ExecuteQueryTool(null);
  expect(tool.getDescription()).toContain('read-only');
  expect(tool.getInputSchema().properties.query.description).toContain('read-only');
  process.env.SQLSERVER_UNSAFE_NONCE = 'i_sure_know_what_i_am_doing';
  expect(tool.getDescription()).toContain('ANY SQL query');
  expect(tool.getInputSchema().properties.query.description).toContain('any statement allowed');
});

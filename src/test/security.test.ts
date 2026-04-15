import { QueryValidator } from '../security.js';

describe('QueryValidator', () => {
  describe('validateQuery - Allowed Statements', () => {
    const allowedQueries = [
      'SELECT * FROM users',
      'SELECT id, name FROM users WHERE id = 1',
      'WITH cte AS (SELECT 1) SELECT * FROM cte',
      'SHOW TABLES',
      'DESCRIBE users',
      'EXPLAIN SELECT * FROM users',
    ];

    test.each(allowedQueries)('should allow: %s', (query) => {
      const result = QueryValidator.validateQuery(query);
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateQuery - Forbidden Keywords', () => {
    const forbiddenQueries = [
      { query: 'INSERT INTO users VALUES (1)', keyword: 'INSERT' },
      { query: 'UPDATE users SET name = "test"', keyword: 'UPDATE' },
      { query: 'DELETE FROM users', keyword: 'DELETE' },
      { query: 'DROP TABLE users', keyword: 'DROP' },
      { query: 'CREATE TABLE users (id INT)', keyword: 'CREATE' },
      { query: 'ALTER TABLE users ADD col INT', keyword: 'ALTER' },
      { query: 'TRUNCATE TABLE users', keyword: 'TRUNCATE' },
      { query: 'EXEC sp_executesql', keyword: 'EXEC' },
      { query: 'EXECUTE sp_executesql', keyword: 'EXEC' },  // EXECUTE contains EXEC
      { query: 'BACKUP DATABASE db TO DISK', keyword: 'BACKUP' },
      { query: 'RESTORE DATABASE db FROM DISK', keyword: 'RESTORE' },
      { query: 'KILL 1', keyword: 'KILL' },
      { query: 'SHUTDOWN', keyword: 'SHUTDOWN' },
    ];

    test.each(forbiddenQueries)('should reject query with $keyword', ({ query, keyword }) => {
      const result = QueryValidator.validateQuery(query);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain(keyword);
    });
  });

  describe('validateQuery - Case Insensitive Bypass Prevention', () => {
    const caseBypassQueries = [
      'InSeRt INTO users VALUES (1)',
      'UpDaTe users SET name = "test"',
      'DeLeTe FROM users',
      'DrOp TABLE users',
    ];

    test.each(caseBypassQueries)('should reject case obfuscated: %s', (query) => {
      const result = QueryValidator.validateQuery(query);
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateQuery - SQL Injection Patterns', () => {
    const injectionQueries = [
      { query: "SELECT * FROM users WHERE id = 1; DROP TABLE users--", reason: 'Statement injection with DROP' },
      { query: "SELECT * FROM users WHERE id = 1 OR 1=1", reason: 'OR injection' },
      { query: "SELECT * FROM users WHERE id = 1' OR '1'='1", reason: 'OR injection with quotes' },
      { query: "SELECT * FROM users UNION SELECT * FROM passwords", reason: 'UNION injection' },
      { query: "SELECT CHAR(65)", reason: 'CHAR injection for exfiltration' },
      { query: "SELECT ASCII(SUBSTRING('password',1,1))", reason: 'ASCII blind injection' },
      { query: "SELECT 0x73756c656374", reason: 'Hex encoding attempt' },
      { query: "SELECT * FROM users; SELECT * FROM passwords", reason: 'Multiple statements' },
    ];

    test.each(injectionQueries)('should reject: $reason', ({ query }) => {
      const result = QueryValidator.validateQuery(query);
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateQuery - Comment-Based Bypass Prevention', () => {
    it('should reject inline comment obfuscation', () => {
      // SEL/**/ECT should be rejected - comments stripped leaves invalid query
      const result = QueryValidator.validateQuery('SEL/**/ECT * FROM users');
      expect(result.isValid).toBe(false);
    });

    it('should reject comment between forbidden keyword', () => {
      // DR/**/OP should be rejected - comments stripped leaves DROP
      const result = QueryValidator.validateQuery('DR/**/OP TABLE users');
      expect(result.isValid).toBe(false);
    });

    it('should allow valid query with trailing comment', () => {
      // Valid SELECT query with trailing comment should pass (comment stripped)
      const result = QueryValidator.validateQuery('SELECT * FROM users WHERE id = 1--this is a comment');
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateQuery - Variable Injection Prevention', () => {
    const variableQueries = [
      { query: 'SELECT @variable FROM users', reason: 'T-SQL variable' },
      { query: 'EXEC sp_executesql @sql', reason: 'Variable in EXEC' },
    ];

    test.each(variableQueries)('should reject: $reason', ({ query }) => {
      const result = QueryValidator.validateQuery(query);
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateQuery - Empty Query', () => {
    it('should reject empty query', () => {
      expect(QueryValidator.validateQuery('').isValid).toBe(false);
    });

    it('should reject whitespace-only query', () => {
      expect(QueryValidator.validateQuery('   ').isValid).toBe(false);
    });
  });

  describe('sanitizeQuery', () => {
    it('should trim whitespace', () => {
      expect(QueryValidator.sanitizeQuery('  SELECT * FROM users  ')).toBe('SELECT * FROM users');
    });

    it('should normalize multiple spaces', () => {
      expect(QueryValidator.sanitizeQuery('SELECT  *    FROM   users')).toBe('SELECT * FROM users');
    });

    it('should remove trailing semicolon', () => {
      expect(QueryValidator.sanitizeQuery('SELECT * FROM users;')).toBe('SELECT * FROM users');
    });
  });

  describe('addRowLimit', () => {
    it('should add TOP clause to SELECT', () => {
      const result = QueryValidator.addRowLimit('SELECT * FROM users', 100);
      expect(result).toBe('SELECT TOP 100 * FROM users');
    });

    it('should not modify if TOP already exists', () => {
      const result = QueryValidator.addRowLimit('SELECT TOP 50 * FROM users', 100);
      expect(result).toBe('SELECT TOP 50 * FROM users');
    });

    it('should handle SELECT with leading whitespace', () => {
      const result = QueryValidator.addRowLimit('  SELECT * FROM users', 100);
      expect(result).toBe('  SELECT TOP 100 * FROM users');
    });
  });

  describe('isValidCallbackUrl - SSRF Prevention', () => {
    it('should allow localhost HTTPS', () => {
      expect(QueryValidator.isValidCallbackUrl('https://localhost:8080/callback')).toBe(true);
    });

    it('should allow 127.0.0.1 HTTP', () => {
      expect(QueryValidator.isValidCallbackUrl('http://127.0.0.1:8080/callback')).toBe(true);
    });

    it('should allow ::1 (IPv6 localhost)', () => {
      expect(QueryValidator.isValidCallbackUrl('http://[::1]:8080/callback')).toBe(true);
    });

    it('should block external HTTPS URLs', () => {
      expect(QueryValidator.isValidCallbackUrl('https://api.example.com/callback')).toBe(false);
    });

    it('should block external HTTP URLs', () => {
      expect(QueryValidator.isValidCallbackUrl('http://api.example.com/callback')).toBe(false);
    });

    it('should block internal IP addresses other than localhost', () => {
      expect(QueryValidator.isValidCallbackUrl('http://192.168.1.1/callback')).toBe(false);
      expect(QueryValidator.isValidCallbackUrl('http://10.0.0.1/callback')).toBe(false);
    });

    it('should block file:// protocol', () => {
      expect(QueryValidator.isValidCallbackUrl('file:///etc/passwd')).toBe(false);
    });

    it('should block data:// protocol', () => {
      expect(QueryValidator.isValidCallbackUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('should return false for invalid URLs', () => {
      expect(QueryValidator.isValidCallbackUrl('not-a-url')).toBe(false);
    });
  });
});

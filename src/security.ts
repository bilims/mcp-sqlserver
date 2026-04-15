export class QueryValidator {
  private static readonly ALLOWED_STATEMENTS = [
    'SELECT',
    'WITH',
    'SHOW',
    'DESCRIBE',
    'EXPLAIN',
  ];

  private static readonly FORBIDDEN_KEYWORDS = [
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'CREATE',
    'ALTER',
    'TRUNCATE',
    'EXEC',
    'EXECUTE',
    'XP_',
    'OPENROWSET',
    'OPENDATASOURCE',
    'BULK',
    'MERGE',
    'GRANT',
    'REVOKE',
    'DENY',
    'BACKUP',
    'RESTORE',
    'KILL',
    'DBCC',
    'SHUTDOWN',
    'RAISERROR',
    'WAITFOR',
    // Catch stored procedure prefixes and dangerous patterns
    'SP_',
    'XP_',
    // Prevent @ prefix variables being injected
    '@',
    // Prevent char/ASCII injection for password cracking
    'CHAR(',
    'ASCII(',
  ];

  static validateQuery(query: string): { isValid: boolean; error?: string } {
    let normalizedQuery = query.trim().toUpperCase();

    if (!normalizedQuery) {
      return { isValid: false, error: 'Empty query not allowed' };
    }

    // Strip SQL comments FIRST to prevent comment-based bypass
    // e.g., SEL/**/ECT or SELECT--comment should be handled
    // Replace comments with spaces to prevent word merging (SEL/**/ECT -> SEL ECT, not SELECT)
    normalizedQuery = normalizedQuery
      .replace(/--[\s\S]*?$/gm, ' ')  // Replace -- comments with space
      .replace(/\/\*[\s\S]*?\*\//g, ' ')  // Replace /* */ comments with space
      .replace(/\s+/g, ' ')  // Normalize multiple spaces
      .trim();

    // Check for forbidden keywords BEFORE "starts with" check
    // This ensures RESTORE, KILL, SHUTDOWN etc. are caught regardless of starting keyword
    for (const forbidden of this.FORBIDDEN_KEYWORDS) {
      if (normalizedQuery.includes(forbidden)) {
        return {
          isValid: false,
          error: `Forbidden keyword detected: ${forbidden}`
        };
      }
    }

    // Check if query starts with allowed statement
    const startsWithAllowed = this.ALLOWED_STATEMENTS.some(stmt =>
      normalizedQuery.startsWith(stmt)
    );

    if (!startsWithAllowed) {
      return {
        isValid: false,
        error: `Query must start with one of: ${this.ALLOWED_STATEMENTS.join(', ')}`
      };
    }

    // Additional security checks for injection patterns
    if (this.containsSqlInjectionPatterns(normalizedQuery)) {
      return {
        isValid: false,
        error: 'Potential SQL injection pattern detected'
      };
    }

    return { isValid: true };
  }

  static generateBluePrompt(query: string): string {
    return `
      <prompt_instructions>
        You are a senior security analyst AI. Your sole responsibility is to determine if a given SQL query is malicious.
        A query is considered malicious if it attempts to perform any of the following:
        - SQL Injection to bypass security or execute unauthorized commands.
        - Exfiltrate sensitive data (e.g., user credentials, PII).
        - Cause a Denial of Service (DoS) by consuming excessive resources.
        - Modify data (INSERT, UPDATE, DELETE) or schema (CREATE, ALTER, DROP).
        - Escalate privileges.

        Analyze the following SQL query:
        <sql_query>
        ${query}
        </sql_query>

        Your response MUST be a single word: 'true' if the query is safe for a read-only environment, or 'false' if it is malicious. Do not provide any explanation.
      </prompt_instructions>
    `;
  }

  static isValidCallbackUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      // Only allow HTTPS and localhost/127.0.0.1
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return false;
      }
      // Block external URLs - only allow localhost for security
      // Strip brackets from IPv6 addresses (URL parser keeps them)
      let hostname = parsed.hostname.toLowerCase();
      hostname = hostname.replace(/[\[\]]/g, '');  // Remove [ ] from IPv6
      const allowedHosts = ['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1'];
      if (!allowedHosts.includes(hostname)) {
        console.warn(`Blue Prompt callback blocked: external URL not allowed (${hostname})`);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  static async validateQueryWithBluePrompt(query: string): Promise<{ isValid: boolean; error?: string }> {
    // Step 1: Perform initial static validation
    const staticValidation = this.validateQuery(query);
    if (!staticValidation.isValid) {
      return staticValidation;
    }

    // Step 2: Use the host AI platform for validation if a callback URL is provided
    const callbackUrl = process.env.BLUE_PROMPT_CALLBACK_URL;
    if (callbackUrl) {
      // Validate URL before making callback to prevent SSRF
      if (!this.isValidCallbackUrl(callbackUrl)) {
        return { isValid: false, error: 'Invalid Blue Prompt callback URL - only localhost allowed for security' };
      }

      try {
        const bluePrompt = this.generateBluePrompt(query);
        const response = await fetch(callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: bluePrompt }),
        });

        if (!response.ok) {
          throw new Error(`Callback to AI platform failed with status: ${response.status}`);
        }

        const verdict = (await response.text()).trim().toLowerCase();
        if (verdict !== 'true') {
          return { isValid: false, error: 'Query flagged as potentially malicious by the host AI platform' };
        }
      } catch (error) {
        console.error('Error during blue prompt callback:', error);
        // Fail-safe: if the callback fails, we deny the query execution.
        return { isValid: false, error: 'Could not verify query safety with the host AI platform' };
      }
    } else {
      // Fallback if no callback URL is provided
      console.log('Blue Prompt validation is a placeholder. Set BLUE_PROMPT_CALLBACK_URL to enable host AI validation.');
    }

    return { isValid: true };
  }

  private static containsSqlInjectionPatterns(query: string): boolean {
    // Remove SQL comments first (both -- and /* */) to prevent comment-based bypass
    const queryWithoutComments = query
      .replace(/--[\s\S]*?$/gm, '')  // Remove -- comments (including end-of-line variants)
      .replace(/\/\*[\s\S]*?\*\//g, '');  // Remove /* */ comments

    const patterns = [
      // Statement injection - semicolon followed by any statement
      /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)/i,
      // Union-based injection
      /UNION\s+(ALL\s+)?SELECT/i,
      // OR/AND injection patterns with quote escaping
      /'\s*(OR|AND)\s+['"\d]/i,
      /['"\d]\s*(OR|AND)\s+['"\d]/i,
      // Time-based blind injection
      /WAITFOR\s+DELAY/i,
      /BENCHMARK\s*\(/i,
      /SLEEP\s*\(/i,
      // Heavy hex/ascii operations for data exfiltration
      /CHAR\s*\(\s*\d+\s*\)/i,
      /ASCII\s*\(\s*SUBSTRING/i,
      // Hex encoding attempts
      /0x[0-9a-f]+/i,
    ];

    return patterns.some(pattern => pattern.test(queryWithoutComments));
  }

  static sanitizeQuery(query: string): string {
    return query
      .trim()
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/;$/, '');    // Remove trailing semicolon
  }

  static addRowLimit(query: string, maxRows: number): string {
    const normalizedQuery = query.trim().toUpperCase();
    
    // If query already has TOP clause, don't modify
    if (normalizedQuery.includes('TOP ')) {
      return query;
    }

    // Add TOP clause after SELECT
    return query.replace(
      /^(\s*SELECT\s+)/i,
      `$1TOP ${maxRows} `
    );
  }
}
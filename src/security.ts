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
    'SP_',
    'XP_',
    'OPENROWSET',
    'OPENDATASOURCE',
    'BULK',
    'MERGE',
    'GRANT',
    'REVOKE',
    'DENY',
    'RESTORE',
    'BACKUP',
    'WRITETEXT',
    'UPDATETEXT',
    'RECONFIGURE',
    'RENAME',
    'UPSERT',
  ];

  static validateQuery(query: string): { isValid: boolean; error?: string } {
    const normalizedQuery = query.trim().toUpperCase();

    if (!normalizedQuery) {
      return { isValid: false, error: 'Empty query not allowed' };
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

    // Check for forbidden keywords
    for (const forbidden of this.FORBIDDEN_KEYWORDS) {
      if (normalizedQuery.includes(forbidden)) {
        return { 
          isValid: false, 
          error: `Forbidden keyword detected: ${forbidden}` 
        };
      }
    }

    // Additional security checks
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

  static async validateQueryWithBluePrompt(query: string): Promise<{ isValid: boolean; error?: string }> {
    // Step 1: Perform initial static validation
    const staticValidation = this.validateQuery(query);
    if (!staticValidation.isValid) {
      return staticValidation;
    }

    // Step 2: Use the host AI platform for validation if a callback URL is provided
    const callbackUrl = process.env.BLUE_PROMPT_CALLBACK_URL;
    if (callbackUrl) {
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
    const patterns = [
      /--/,  // SQL comments
      /\/\*/,  // Multi-line comments
      /;.*SELECT/,  // Statement injection
      /UNION.*SELECT/,  // Union injection
      /'\s*OR\s*'.*'/,  // OR injection
      /'\s*AND\s*'.*'/,  // AND injection
    ];

    return patterns.some(pattern => pattern.test(query));
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

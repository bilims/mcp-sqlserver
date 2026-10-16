/**
 * Read-only enforcement for caller-supplied T-SQL.
 *
 * This is DEFENCE IN DEPTH. The real read-only guarantee is the database login:
 * a login without INSERT/EXECUTE rights cannot write however the parser errs.
 *
 * The validator used to substring-match forbidden words against the uppercased
 * query. That failed in both directions at once: it rejected `SELECT * FROM
 * order_execution` (EXEC), `deleted_at` (DELETE) and `resp_code`
 * (SP_), while admitting `SELECT * INTO t FROM x` and `SELECT 1\nSHUTDOWN`.
 * Both failures share a cause: treating SQL as a string rather than as tokens.
 * So we tokenise, and check keywords against bare word tokens only.
 *
 * Tokenizer design is adapted from Approved-Oil/approved-microsoftsqlserver-mcp
 * (MIT). The lexer here differs from it in where it chooses to fail closed,
 * because a lexer that disagrees with SQL Server about where a token ends can
 * hide a keyword from the check:
 *
 *  - A number token is digits only (optional fraction, exponent, or 0x hex).
 *    SQL Server lexes `1.AS` and `1AS` as a number followed by a keyword, so a
 *    scanner that absorbs letters into numbers hides `SELECT 1.EXEC sp_who`.
 *  - Characters whose meaning is ambiguous between lexers are rejected rather
 *    than guessed at: control characters, a lone CR or Unicode line separator
 *    inside a `--` comment, and any non-ASCII character outside a string
 *    literal, comment or quoted identifier.
 */

export type TokenKind =
  | 'word' // bare identifier or keyword
  | 'quoted' // [bracketed] or "quoted" identifier
  | 'string' // 'literal'
  | 'number'
  | 'variable' // @var or @@SERVERNAME
  | 'semicolon'
  | 'punct';

export interface Token {
  kind: TokenKind;
  /** Source text. For `word`, already upper-cased for comparison. */
  value: string;
  start: number;
}

export class LexError extends Error {}

/**
 * Statements that may begin a read-only query. SHOW / DESCRIBE / EXPLAIN are
 * MySQL and PostgreSQL syntax and have never been valid T-SQL.
 */
const ALLOWED_LEADING = new Set(['SELECT', 'WITH']);

/**
 * Rejected when they appear as a bare word token. Bracket-quoting makes a word
 * an identifier (`[Set]`), so real schemas still work.
 *
 * T-SQL does not require a separator between statements, so `SELECT 1 PRINT 'x'`
 * is two statements. Besides the write/control verbs this therefore lists the
 * reserved statement-starters (DECLARE, IF, WHILE, ...) that have no business
 * in a read-only query. FETCH is deliberately absent: OFFSET ... FETCH is
 * ordinary paging.
 */
const FORBIDDEN_KEYWORDS = new Set([
  // DML / DDL
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'MERGE',
  'INTO', 'BULK',
  // execution
  'EXEC', 'EXECUTE', 'GO', 'RETURN', 'GOTO', 'WAITFOR',
  // permissions
  'GRANT', 'REVOKE', 'DENY',
  // server / instance control
  'BACKUP', 'RESTORE', 'SHUTDOWN', 'KILL', 'DBCC', 'RECONFIGURE', 'CHECKPOINT',
  // session state -- persists on the pooled connection into later tool calls
  'USE', 'SET', 'SETUSER', 'REVERT', 'BEGIN', 'COMMIT', 'ROLLBACK', 'TRAN',
  'TRANSACTION',
  // procedural statements
  'DECLARE', 'IF', 'WHILE', 'BREAK', 'CONTINUE', 'PRINT', 'RAISERROR', 'THROW',
  'DEALLOCATE',
  // reserved words that only begin statements (cursors, savepoints, text
  // columns, ALTER ... ADD). Being reserved, a bare use as a column name is
  // already a syntax error, so blocking them costs nothing. Words that merely
  // begin a statement but are ordinary identifiers (SEND, RECEIVE, MOVE, GET,
  // ENABLE, DISABLE, LOAD, DUMP) are NOT listed: they would reject real columns,
  // and what they could do is gated by database permissions.
  'OPEN', 'CLOSE', 'ADD', 'SAVE', 'READTEXT', 'WRITETEXT', 'UPDATETEXT',
  // remote / out-of-band data access. OPENJSON is deliberately absent: it
  // only parses a string already in the query and reaches nothing outside it.
  'OPENQUERY', 'OPENROWSET', 'OPENDATASOURCE', 'OPENXML',
]);

const isWordStart = (c: string) => /[A-Za-z_#]/.test(c);
const isWordChar = (c: string) => /[A-Za-z0-9_#$]/.test(c);
const isDigit = (c: string) => c >= '0' && c <= '9';
const isHexDigit = (c: string) => /[0-9A-Fa-f]/.test(c);
const isSqlWhitespace = (c: string) =>
  c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';

/** C0 controls other than whitespace, DEL, and the C1 NEL. */
const isForbiddenControl = (c: string) => /[\u0000-\u0008\u000E-\u001F\u007F\u0085]/.test(c);
/** Characters some lexers treat as a line break and others do not. */
const isAmbiguousLineBreak = (c: string) => c === '\u0085' || c === ' ' || c === ' ';

/**
 * Consume a delimited run starting at `start` (which points at the opening
 * delimiter) where a doubled closing delimiter is an escape. Returns the index
 * just past the closing delimiter.
 */
function scanDelimited(sql: string, start: number, close: string, what: string): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === close) {
      if (sql[i + 1] === close) { i += 2; continue; }
      return i + 1;
    }
    i++;
  }
  throw new LexError(`Unterminated ${what}`);
}

/**
 * Tokenise T-SQL far enough to tell code from data.
 *
 * Comments are consumed and discarded rather than rejected (`--` is legitimate
 * SQL). Unterminated literals, identifiers and comments throw, because an
 * unterminated construct is how a payload smuggles text past a scanner.
 */
export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < sql.length) {
    const c = sql[i];

    if (isSqlWhitespace(c)) { i++; continue; }

    if (isForbiddenControl(c)) {
      throw new LexError(`Control character U+${c.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()} is not allowed`);
    }

    // line comment: runs to \n. A CR not followed by LF, or a Unicode line
    // separator, may or may not end the comment depending on the lexer, so a
    // comment containing one is rejected rather than guessed at.
    if (c === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < sql.length && sql[i] !== '\n') {
        const d = sql[i];
        if ((d === '\r' && sql[i + 1] !== '\n') || isAmbiguousLineBreak(d)) {
          throw new LexError('Ambiguous line terminator inside a -- comment');
        }
        i++;
      }
      continue;
    }

    // block comment -- T-SQL nests these
    if (c === '/' && sql[i + 1] === '*') {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2; }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; }
        else i++;
      }
      if (depth > 0) throw new LexError('Unterminated block comment');
      continue;
    }

    // string literal, optionally N-prefixed. '' is an escaped quote and
    // backslash is NOT an escape in T-SQL.
    if (c === "'" || ((c === 'N' || c === 'n') && sql[i + 1] === "'")) {
      const start = i;
      const quote = c === "'" ? i : i + 1;
      i = scanDelimited(sql, quote, "'", 'string literal');
      tokens.push({ kind: 'string', value: sql.slice(start, i), start });
      continue;
    }

    if (c === '[') {
      const start = i;
      i = scanDelimited(sql, i, ']', '[identifier]');
      tokens.push({ kind: 'quoted', value: sql.slice(start, i), start });
      continue;
    }

    if (c === '"') {
      const start = i;
      i = scanDelimited(sql, i, '"', '"identifier"');
      tokens.push({ kind: 'quoted', value: sql.slice(start, i), start });
      continue;
    }

    // @local or @@GLOBAL variable
    if (c === '@') {
      const start = i;
      i++;
      if (sql[i] === '@') i++;
      while (i < sql.length && isWordChar(sql[i])) i++;
      tokens.push({ kind: 'variable', value: sql.slice(start, i).toUpperCase(), start });
      continue;
    }

    // number. Digits only: a letter ends the number and starts a new word, so
    // `1.EXEC` is the number `1.` followed by the keyword EXEC.
    if (isDigit(c)) {
      const start = i;
      if (c === '0' && (sql[i + 1] === 'x' || sql[i + 1] === 'X')) {
        i += 2;
        while (i < sql.length && isHexDigit(sql[i])) i++;
        // `0xEXEC` is `0xE` then `XEC` to some lexers and something else to
        // others. A hex literal has no business abutting a letter, so refuse it.
        if (i < sql.length && isWordChar(sql[i])) {
          throw new LexError('Malformed hex literal');
        }
      } else {
        while (i < sql.length && isDigit(sql[i])) i++;
        if (sql[i] === '.') {
          i++;
          while (i < sql.length && isDigit(sql[i])) i++;
        }
        if (sql[i] === 'e' || sql[i] === 'E') {
          let j = i + 1;
          if (sql[j] === '+' || sql[j] === '-') j++;
          if (j < sql.length && isDigit(sql[j])) {
            while (j < sql.length && isDigit(sql[j])) j++;
            i = j;
          }
        }
      }
      tokens.push({ kind: 'number', value: sql.slice(start, i), start });
      continue;
    }

    if (isWordStart(c)) {
      const start = i;
      while (i < sql.length && isWordChar(sql[i])) i++;
      tokens.push({ kind: 'word', value: sql.slice(start, i).toUpperCase(), start });
      continue;
    }

    if (c === ';') {
      tokens.push({ kind: 'semicolon', value: ';', start: i });
      i++;
      continue;
    }

    // Anything else outside a literal must be printable ASCII. Unicode
    // identifiers belong in [brackets]. Rejecting the rest removes the whole
    // class of "this lexer and SQL Server disagree about a Unicode character".
    if (c.charCodeAt(0) > 0x7e) {
      throw new LexError(
        `Non-ASCII character U+${c.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()} outside a string literal or [identifier]`
      );
    }

    tokens.push({ kind: 'punct', value: c, start: i });
    i++;
  }

  return tokens;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export class QueryValidator {
  /**
   * Gate for caller-supplied SQL.
   *
   * Rules, in order: it must lex cleanly; there must be exactly one statement;
   * it must begin with SELECT or WITH; and no bare word token may be a
   * forbidden keyword.
   */
  static validateQuery(query: string): ValidationResult {
    if (!query || !query.trim()) {
      return { isValid: false, error: 'Empty query not allowed' };
    }

    let tokens: Token[];
    try {
      tokens = tokenize(query);
    } catch (err) {
      return {
        isValid: false,
        error: err instanceof LexError ? `Could not parse query: ${err.message}` : 'Could not parse query',
      };
    }

    // `;WITH cte AS (...)` is an idiomatic T-SQL opener, and a trailing
    // semicolon is harmless.
    while (tokens.length > 0 && tokens[0].kind === 'semicolon') tokens.shift();
    while (tokens.length > 0 && tokens[tokens.length - 1].kind === 'semicolon') tokens.pop();

    if (tokens.length === 0) {
      return { isValid: false, error: 'Empty query not allowed' };
    }

    // Any semicolon left is a statement separator. This one rule removes the
    // whole batch-injection class (`SELECT 1; DROP TABLE t`, `; USE master`).
    const separator = tokens.find(t => t.kind === 'semicolon');
    if (separator) {
      return {
        isValid: false,
        error:
          'Only a single statement is allowed (found a statement separator at ' +
          `character ${separator.start})`,
      };
    }

    const first = tokens[0];
    if (first.kind !== 'word' || !ALLOWED_LEADING.has(first.value)) {
      return { isValid: false, error: `Query must begin with ${[...ALLOWED_LEADING].join(' or ')}` };
    }

    // Words only: text inside string literals and quoted identifiers is data.
    for (const token of tokens) {
      if (token.kind === 'word' && FORBIDDEN_KEYWORDS.has(token.value)) {
        return {
          isValid: false,
          error: `Statement '${token.value}' is not permitted on a read-only connection`,
        };
      }
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

  /**
   * Whitespace is NOT normalised: collapsing runs of spaces rewrote the inside
   * of string literals, so `WHERE Name = 'John  Smith'` silently matched
   * different rows.
   */
  static sanitizeQuery(query: string): string {
    // Walk back from the end. A regex such as /[\s;]+$/ looks equivalent but
    // backtracks quadratically on a long run of spaces or semicolons that is
    // not at the end, and this runs on queries the validator has accepted.
    let end = query.length;
    while (end > 0 && (query[end - 1] === ';' || /\s/.test(query[end - 1]))) end--;
    return query.slice(0, end).trim();
  }

  /**
   * Caps the rows a plain SELECT returns by inserting TOP into its select list.
   *
   * TOP belongs after DISTINCT/ALL -- `SELECT TOP n DISTINCT x` is a syntax
   * error, which used to make every SELECT DISTINCT fail -- so it is inserted
   * after that modifier when there is one. The query is read as tokens, not
   * text: a column named `desktop`, or a literal 'TOP 5', is not a TOP clause.
   *
   * Only a query whose outermost SELECT has no TOP of its own is rewritten, and
   * only a leading SELECT: `WITH ... SELECT` is left alone, as before. The
   * rewrite only inserts text, so everything the validator saw is still there.
   */
  static addRowLimit(query: string, maxRows: number): string {
    let tokens: Token[];
    try {
      tokens = tokenize(query);
    } catch {
      return query;
    }

    const select = tokens[0];
    if (!select || select.kind !== 'word' || select.value !== 'SELECT') {
      return query;
    }

    let last = select;
    const modifier = tokens[1];
    if (modifier && modifier.kind === 'word' && (modifier.value === 'DISTINCT' || modifier.value === 'ALL')) {
      last = modifier;
    }

    const following = tokens[tokens.indexOf(last) + 1];
    if (following && following.kind === 'word' && following.value === 'TOP') {
      return query;
    }

    // Pad only when needed, so TOP n can never fuse with what follows it.
    const end = last.start + last.value.length;
    const next = query[end];
    const pad = next === undefined || isSqlWhitespace(next) ? '' : ' ';
    return `${query.slice(0, end)} TOP ${maxRows}${pad}${query.slice(end)}`;
  }
}
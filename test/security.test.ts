import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryValidator, tokenize } from '../src/security.js';

/**
 * Tests for the read-only query validator.
 *
 * The validator is defence in depth -- the database login is the real
 * guarantee -- but it is the layer an agent actually runs into, so it has to be
 * correct in BOTH directions: a hole is a security bug, and a false positive
 * (`order_execution` rejected for containing "EXEC") gets the guard
 * switched off by the people it annoys.
 *
 * Layers, roughly cheapest to most thorough:
 *   1. regression tables   -- named, known payloads and known-good queries
 *   2. lexer differentials -- places where this lexer and SQL Server could
 *                             disagree about where a token ends
 *   3. keyword matrix      -- every forbidden word x separators x glue x position
 *   4. fuzzing             -- random token soup, checked against an independent
 *                             oracle that does not share the tokenizer's code
 *   5. pipeline            -- what is actually sent to the server still validates
 *
 * Regression cases in section 1 are adapted from
 * Approved-Oil/approved-microsoftsqlserver-mcp (MIT).
 */

const check = (q: string) => QueryValidator.validateQuery(q);
const accepted = (q: string) => check(q).isValid;

/**
 * Deliberately a SEPARATE copy of the list in src/security.ts. If a keyword is
 * dropped from the source by accident, this copy still demands it be blocked.
 */
const MUST_BLOCK_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'MERGE',
  'INTO', 'BULK', 'EXEC', 'EXECUTE', 'GO', 'RETURN', 'GOTO', 'WAITFOR',
  'GRANT', 'REVOKE', 'DENY', 'BACKUP', 'RESTORE', 'SHUTDOWN', 'KILL', 'DBCC',
  'RECONFIGURE', 'CHECKPOINT', 'USE', 'SET', 'SETUSER', 'REVERT', 'BEGIN',
  'COMMIT', 'ROLLBACK', 'TRAN', 'TRANSACTION', 'DECLARE', 'IF', 'WHILE',
  'BREAK', 'CONTINUE', 'PRINT', 'RAISERROR', 'THROW', 'DEALLOCATE',
  'OPEN', 'CLOSE', 'ADD', 'SAVE', 'READTEXT', 'WRITETEXT', 'UPDATETEXT',
  'OPENQUERY', 'OPENROWSET', 'OPENDATASOURCE', 'OPENXML',
];

/** Collects failures so one test reports many cases instead of stopping at the first. */
function expectAll(cases: Array<[string, string]>, want: boolean, limit = 12) {
  const failures: string[] = [];
  for (const [label, q] of cases) {
    const r = check(q);
    if (r.isValid !== want) {
      failures.push(`${label}\n     ${JSON.stringify(q)}\n     -> ${r.isValid ? 'ACCEPTED' : 'rejected: ' + r.error}`);
    }
  }
  assert.equal(
    failures.length, 0,
    `${failures.length}/${cases.length} cases went the wrong way (expected ${want ? 'accepted' : 'rejected'}):\n  ` +
      failures.slice(0, limit).join('\n  ')
  );
}

// ---------------------------------------------------------------------------
// 1. Regression tables
// ---------------------------------------------------------------------------

const MUST_BLOCK: Array<[string, string]> = [
  // writes disguised as SELECT
  ['SELECT...INTO', 'SELECT * INTO pwned FROM Customers'],
  ['SELECT*INTO, no spaces', 'SELECT*INTO pwned FROM Customers'],
  ['SELECT...INTO behind a CTE', 'WITH c AS (SELECT 1 x) SELECT * INTO pwned2 FROM c'],
  ['SELECT TOP PERCENT ... INTO', 'SELECT TOP 100 PERCENT * INTO pwned3 FROM Customers'],
  ['CTE that deletes', 'WITH x AS (SELECT 1 AS n) DELETE FROM t'],
  ['CTE that updates', 'WITH x AS (SELECT 1 AS n) UPDATE t SET a = 1'],

  // multi-statement batches
  ['batch: SHUTDOWN', 'SELECT 1;\nSHUTDOWN WITH NOWAIT'],
  ['batch: SHUTDOWN, one line', 'SELECT 1; SHUTDOWN WITH NOWAIT'],
  ['batch: BACKUP to a UNC path', "SELECT 1;\nBACKUP DATABASE master TO DISK='\\\\10.1.1.5\\x\\m.bak'"],
  ['batch: KILL', 'SELECT 1;\nKILL 55'],
  ['batch: DBCC', 'SELECT 1;\nDBCC FREEPROCCACHE'],
  ['batch: USE poisons the pooled connection', 'SELECT 1;\nUSE master'],
  ['batch: SET poisons session state', 'SELECT 1;\nSET IMPLICIT_TRANSACTIONS ON'],
  ['batch: WAITFOR', "SELECT 1; WAITFOR DELAY '23:59:59'"],
  ['batch: transaction holding a lock', "SELECT 1;\nBEGIN TRAN\nSELECT * FROM Payroll WITH (TABLOCKX,HOLDLOCK)\nWAITFOR DELAY '01:00:00'"],
  ['batch: stacked SELECT INTO', 'SELECT 1;\nSELECT * INTO pwned4 FROM sys.objects'],
  ['two plain SELECTs', 'SELECT 1; SELECT 2'],

  // T-SQL needs no separator between statements
  ['no separator: EXEC', 'SELECT 1 EXEC sp_who'],
  ['no separator: SHUTDOWN', 'SELECT 1\nSHUTDOWN WITH NOWAIT'],
  ['no separator: PRINT', "SELECT 1 PRINT 'x'"],
  ['no separator: DECLARE', 'SELECT 1 DECLARE @x int'],
  ['no separator: WHILE', 'SELECT 1 WHILE 1=1 SELECT 2'],
  ['no separator: IF', 'SELECT 1 IF 1=1 SELECT 2'],
  ['no separator: RAISERROR', "SELECT 1 RAISERROR('x',16,1)"],
  ['no separator: THROW', "SELECT 1 THROW 50000,'x',1"],
  ['no separator: WAITFOR', "SELECT 1 WAITFOR DELAY '0:0:30'"],

  // plain statements
  ['DELETE', 'DELETE FROM Orders'],
  ['UPDATE', 'UPDATE Orders SET Total = 0'],
  ['DROP', 'DROP TABLE Orders'],
  ['EXEC', 'EXEC sp_who'],
  ['EXECUTE', "EXECUTE('SELECT 1')"],
  ['lowercase exec', 'exec sp_who'],
  ['does not start with SELECT/WITH', 'DECLARE @x int = 1 SELECT @x'],
  ['leading paren', '(SELECT 1)'],

  // out-of-band access
  ['OPENQUERY', "SELECT * FROM OPENQUERY(LNK, 'SELECT * FROM sys.sql_logins')"],
  ['OPENROWSET', "SELECT * FROM OPENROWSET('SQLNCLI','...','SELECT 1')"],
  ['OPENDATASOURCE', "SELECT * FROM OPENDATASOURCE('SQLNCLI','x').db.dbo.t"],

  // malformed input used to smuggle text past a scanner
  ['unterminated string', "SELECT * FROM t WHERE a = 'oops"],
  ['unterminated block comment', 'SELECT 1 /* never closed'],
  ['unterminated [identifier]', 'SELECT [oops FROM t'],
  ['unterminated "identifier"', 'SELECT "oops FROM t'],
  ['empty', '   '],
  ['semicolons only', ';;;'],
];

const MUST_ALLOW: Array<[string, string]> = [
  // the reported bug
  ['table named *execution*', 'SELECT * FROM order_execution'],
  ['three-part name, *execution*', 'SELECT TOP 10 id FROM AppDb.dbo.order_execution WITH (NOLOCK)'],

  // column / table names that merely contain a reserved word
  ['created/updated/deleted/merged columns', 'SELECT created_at, updated_date, deleted_at, is_deleted, merged_at FROM t'],
  ['CreatedBy / IsDeleted', 'SELECT CreatedBy, CreatedAt, IsDeleted FROM Orders'],
  ['SP_ inside a column', 'SELECT DISP_DATE, RESP_CODE FROM Shipments'],
  ['XP_ inside a column', 'SELECT EXP_DATE FROM t'],
  ['executor / executed columns', 'SELECT executor_id, executed_at, execution_time FROM t'],
  ['bulk_import_id', 'SELECT bulk_import_id FROM import_batch'],
  ['table named Alterations', 'SELECT * FROM Alterations'],
  ['granted / denied', 'SELECT granted_by, denied_reason FROM t'],
  ["sys.databases create_date (the server's own query)",
    "SELECT database_id, name, create_date, collation_name FROM sys.databases WHERE state_desc = 'ONLINE' ORDER BY name"],

  // keywords as data
  ['literal containing delete', "SELECT * FROM Log WHERE msg LIKE '%delete%'"],
  ['literal containing EXEC', "SELECT * FROM t WHERE note = 'EXEC sp_who'"],
  ['literal containing a semicolon', "SELECT * FROM t WHERE note = 'a;b'"],
  ['literal containing --', "SELECT * FROM t WHERE note = 'a--b'"],
  ['literal containing /*', "SELECT * FROM t WHERE note = '/* x'"],
  ['literal containing a doubled quote', "SELECT * FROM t WHERE a = 'it''s fine'"],
  ['N-prefixed literal', "SELECT * FROM t WHERE a = N'DROP TABLE x'"],
  ['literal that is the state code OR', "SELECT * FROM Wells WHERE State = 'OR' AND City = 'Bend'"],
  ['bracket-quoted reserved words', 'SELECT [Set], [Use], [exec], [delete] FROM Config'],
  ['bracket with escaped ]]', 'SELECT [odd]]name] FROM t'],
  ['bracket hiding a whole payload', 'SELECT [a]]; DROP TABLE t; --] FROM t'],
  ['double-quoted identifier', 'SELECT "exec" FROM t'],
  ['non-ASCII inside a literal', "SELECT * FROM t WHERE name = 'Zoë'"],
  ['non-ASCII inside [brackets]', 'SELECT [Prénom] FROM t'],
  ['variable named like a keyword', 'SELECT @@VERSION, @exec'],

  // comments
  ['line comment', 'SELECT 1 -- just one'],
  ['block comment', 'SELECT /* inline */ 1'],
  ['nested block comment', 'SELECT /* a /* b */ c */ 1'],
  ['comment containing keywords', 'SELECT 1 /* EXEC sp_who; DROP TABLE t */ FROM t'],
  ['line comment containing keywords', 'SELECT 1 FROM t -- DELETE everything'],
  ['comment, CRLF, more query', 'SELECT 1 -- note\r\nFROM t'],

  // ordinary reads, including common read patterns: NOLOCK hints, MAXDOP, OFFSET/FETCH paging, INFORMATION_SCHEMA lookups
  ['UNION', 'SELECT a FROM t1 UNION SELECT a FROM t2'],
  ['SELECT DISTINCT', 'SELECT DISTINCT City FROM Customers'],
  ['OFFSET / FETCH paging', 'SELECT Id FROM Orders ORDER BY Id OFFSET 100 ROWS FETCH NEXT 50 ROWS ONLY'],
  ['CTE', 'WITH c AS (SELECT * FROM Orders) SELECT * FROM c'],
  ['leading ; before WITH', ';WITH c AS (SELECT 1 x) SELECT * FROM c'],
  ['trailing semicolon', 'SELECT 1;'],
  ['WITH (NOLOCK)', 'SELECT COUNT(*) FROM Sales.dbo.account WITH (NOLOCK) WHERE x > 5'],
  ['OPTION (MAXDOP 1)', 'SELECT TOP 10 id FROM big_table WITH (NOLOCK) OPTION (MAXDOP 1)'],
  ['WITHIN GROUP', "SELECT STRING_AGG(name, ',') WITHIN GROUP (ORDER BY name) FROM t"],
  ['negative numbers and minus', 'SELECT 5 - -3, DATEADD(day, -1, GETDATE())'],
  ['scientific notation', 'SELECT 1e5, 1.5E-3, .5'],
  ['hex literal', 'SELECT 0x1F, 0xDEADBEEF'],
  ['OPENJSON over a literal', 'SELECT [key], value, type FROM OPENJSON(\'["a","b",3]\')'],
  ['OPENJSON with a WITH schema', "SELECT a, b FROM OPENJSON('{\"a\":1,\"b\":\"x\"}') WITH (a int '$.a', b nvarchar(10) '$.b')"],
  ['OPENJSON via CROSS APPLY', 'SELECT t.id, j.value FROM t CROSS APPLY OPENJSON(t.payload) AS j'],
  ['INFORMATION_SCHEMA lookup', "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'big_table'"],
];

test('regression: rejects every known read-only bypass', () => expectAll(MUST_BLOCK, false));
test('regression: accepts ordinary read-only queries', () => expectAll(MUST_ALLOW, true));

test('every rejection explains itself', () => {
  for (const [, q] of MUST_BLOCK) {
    const r = check(q);
    assert.ok(r.error && r.error.length > 0, `no message for ${JSON.stringify(q)}`);
  }
});

// ---------------------------------------------------------------------------
// 2. Lexer differentials
//
// A keyword is hidden if this lexer thinks a span is data and SQL Server thinks
// it is code. SQL Server lexes `SELECT 1.AS x` and `SELECT 1AS x` as a number
// followed by a keyword (verified against a live instance), so anything that
// lets a number token swallow trailing letters hides a keyword.
// ---------------------------------------------------------------------------

const LEXER_MUST_BLOCK: Array<[string, string]> = [
  // number glued to a keyword
  ['1.EXEC', 'SELECT 1.EXEC sp_who'],
  ['1EXEC', 'SELECT 1EXEC sp_who'],
  ['1E5EXEC', 'SELECT 1E5EXEC sp_who'],
  ['1.5EXEC', 'SELECT 1.5EXEC sp_who'],
  ['1.e5EXEC', 'SELECT 1.e5EXEC sp_who'],
  ['.5EXEC', 'SELECT .5EXEC sp_who'],
  ['hex then keyword', 'SELECT 0x1F EXEC sp_who'],
  ['0x then word', 'SELECT 0xEXEC sp_who'],
  ['number glued to DROP', 'SELECT 1DROP TABLE t'],
  ['number glued to SHUTDOWN', 'SELECT 1.SHUTDOWN'],
  ['number glued to INTO', 'SELECT 1INTO t2 FROM t'],

  // string / bracket / identifier glued to a keyword
  ['string then keyword', "SELECT 'a'EXEC sp_who"],
  ['bracket then keyword', 'SELECT [a]EXEC sp_who'],
  ['paren then keyword', 'SELECT (1)EXEC sp_who'],
  ['keyword then string', "SELECT 1 EXEC'x'"],
  ['keyword then bracket', 'SELECT 1 EXEC[x]'],
  ['keyword then paren', "SELECT 1 EXEC('x')"],
  ['keyword then variable', 'SELECT 1 EXEC@v'],
  ['dot then keyword', 'SELECT t.EXEC FROM t'],

  // comments as separators
  ['/**/ between SELECT and EXEC', 'SELECT 1/**/EXEC sp_who'],
  ['comment immediately before keyword', 'SELECT 1 /* x */EXEC sp_who'],
  ['keyword hidden after a closed nested comment', 'SELECT 1 /* a /* b */ */ EXEC sp_who'],
  ['keyword after a -- comment ends', 'SELECT 1 -- note\nEXEC sp_who'],
  ['keyword after a -- comment, CRLF', 'SELECT 1 -- note\r\nEXEC sp_who'],

  // line terminators the two lexers may disagree about
  ['lone CR inside a -- comment', 'SELECT 1 --x\rEXEC sp_who'],
  ['NEL inside a -- comment', 'SELECT 1 --x\u0085EXEC sp_who'],
  ['LINE SEPARATOR inside a -- comment', 'SELECT 1 --x EXEC sp_who'],
  ['PARAGRAPH SEPARATOR inside a -- comment', 'SELECT 1 --x EXEC sp_who'],

  // quoting rules
  ['backslash is not an escape', "SELECT '\\'; DROP TABLE t --'"],
  ["'' escape then statement", "SELECT 'it''s'; DROP TABLE t"],
  ['double-quoted then statement', 'SELECT "a"; DROP TABLE t'],
  ['bracket then statement', 'SELECT [a]; DROP TABLE t'],
  ['comment opener inside bracket does not hide code', 'SELECT [a /*]; DROP TABLE t; --*/ FROM t'],
  ['string closes, comment opens, keyword follows', "SELECT 'x' /*c*/ ; DROP TABLE t"],

  // characters SQL Server may ignore, treat as whitespace, or fold into a word
  ['NUL splitting a keyword', 'SELECT 1 EX\u0000EC sp_who'],
  ['NUL before a keyword', 'SELECT 1\u0000EXEC sp_who'],
  ['zero-width space before a keyword', 'SELECT 1​EXEC sp_who'],
  ['NBSP before a keyword', 'SELECT 1 EXEC sp_who'],
  ['ideographic space before a keyword', 'SELECT 1　EXEC sp_who'],
  ['BOM before a keyword', 'SELECT 1﻿EXEC sp_who'],
  ['right-to-left override', 'SELECT 1 ‮EXEC sp_who'],
  ['non-ASCII bare identifier', 'SELECT é FROM t'],
  ['control character U+001F', 'SELECT 1\u001fEXEC sp_who'],
  ['DEL', 'SELECT 1\u007fEXEC sp_who'],
  ['unterminated string hiding the rest', "SELECT 'abc; DROP TABLE t"],
];

const LEXER_MUST_ALLOW: Array<[string, string]> = [
  ['form feed and vertical tab are whitespace', 'SELECT\f1\vFROM t'],
  ['hex literal consumes only hex digits', 'SELECT 0xAB'],
  ['identifier beginning with a digit-like letter', 'SELECT x1exec FROM t'],
  ['identifier containing a keyword after a digit', 'SELECT a1EXECUTION FROM t'],
  ['word glued to number is one identifier', 'SELECT e1 FROM t'],
  ['nested comment fully closed', 'SELECT 1 /* a /* EXEC */ b */ FROM t'],
  ['lone CR in whitespace position is harmless', 'SELECT 1\rFROM t'],
  ['non-ASCII after the comment marker is fine', 'SELECT 1 -- naïve\nFROM t'],
];

test('lexer: keywords cannot hide behind numbers, comments, quoting or odd characters', () =>
  expectAll(LEXER_MUST_BLOCK, false));
test('lexer: unambiguous constructs are still accepted', () => expectAll(LEXER_MUST_ALLOW, true));

test('lexer: a number token never absorbs letters', () => {
  for (const q of ['1.EXEC', '1EXEC', '1E5EXEC', '1.5EXEC', '0x1F EXEC']) {
    const words = tokenize(`SELECT ${q}`).filter(t => t.kind === 'word').map(t => t.value);
    assert.ok(words.includes('EXEC'), `EXEC was not lexed as its own word in ${q}: ${words}`);
  }
});

test('lexer: literal and identifier content is data', () => {
  const tokens = tokenize("SELECT 'DROP TABLE x', [DROP], \"DROP\" FROM t");
  assert.equal(tokens.filter(tk => tk.kind === 'word' && tk.value === 'DROP').length, 0);
});

// ---------------------------------------------------------------------------
// 3. Keyword matrix
// ---------------------------------------------------------------------------

const SEPARATORS = [' ', '  ', '\t', '\n', '\r\n', '\f', '\v', '/**/', '/* x */', '/* a /* b */ */', '--c\n', '--c\r\n'];
const GLUE_BEFORE = ['', '1', '1.', '.', '1e5', '1.5', ')', ']', "'a'", '"a"', '[a]', '0x1F', '*', ','];
// no word characters here: `EXEC1` is a different identifier, not the keyword
const GLUE_AFTER = ['', '(', "'x'", '[x]', '@v', '*', ',', '.', ')'];

function caseVariants(w: string): string[] {
  const mixed = [...w].map((c, i) => (i % 2 ? c.toLowerCase() : c)).join('');
  return [w, w.toLowerCase(), mixed];
}

test('matrix: every forbidden keyword is rejected in every separator / glue / position', () => {
  const failures: string[] = [];
  let n = 0;
  for (const kw of MUST_BLOCK_KEYWORDS) {
    for (const k of caseVariants(kw)) {
      for (const sep of SEPARATORS) {
        for (const before of GLUE_BEFORE) {
          // `0x1F` + DBCC is `0x1FDBCC`, a valid hex literal and not the keyword
          if (before.startsWith('0x') && /^[0-9A-F]+$/i.test(kw)) continue;
          // only attach `before` directly (no separator) -- gluing is the point
          for (const after of GLUE_AFTER) {
            const bodies = [
              `SELECT 1 ${before}${k}${after} x`,
              `SELECT 1${sep}${before}${k}${after}`,
              `SELECT 1${sep}${k}${sep}x`,
              `SELECT (SELECT 1${sep}${before}${k}${after}) a FROM t`,
              `WITH c AS (SELECT 1 a)${sep}${k}${after}`,
            ];
            for (const q of bodies) {
              n++;
              if (accepted(q)) failures.push(JSON.stringify(q));
            }
          }
        }
      }
    }
  }
  assert.equal(
    failures.length, 0,
    `${failures.length}/${n} matrix cases were ACCEPTED but contain a bare forbidden word:\n  ${failures.slice(0, 10).join('\n  ')}`
  );
});

test('matrix: forbidden words are accepted wherever they are only data', () => {
  const failures: string[] = [];
  for (const kw of MUST_BLOCK_KEYWORDS) {
    for (const k of caseVariants(kw)) {
      const data = [
        `SELECT '${k}' FROM t`,
        `SELECT N'${k}' FROM t`,
        `SELECT '${k} x; ${k}' FROM t`,
        `SELECT [${k}] FROM t`,
        `SELECT "${k}" FROM t`,
        `SELECT 1 /* ${k} */ FROM t`,
        `SELECT 1 /* a /* ${k} */ ${k} */ FROM t`,
        `SELECT 1 FROM t -- ${k}`,
        `SELECT ${k}_id, x_${k}, ${k}s, ${k}2, a${k}b FROM t`,
        `SELECT @${k}, @@${k} FROM t`,
        `SELECT x AS [${k}] FROM t WHERE y = '${k}'`,
      ];
      for (const q of data) if (!accepted(q)) failures.push(`${JSON.stringify(q)} -> ${check(q).error}`);
    }
  }
  assert.equal(failures.length, 0, `over-blocking:\n  ${failures.slice(0, 10).join('\n  ')}`);
});

test('matrix: the keyword list in the source covers every word that must be blocked', () => {
  for (const kw of MUST_BLOCK_KEYWORDS) {
    assert.equal(accepted(`SELECT 1 ${kw} x`), false, `${kw} is not blocked`);
  }
});

// ---------------------------------------------------------------------------
// 4. Fuzzing against an independent oracle
//
// The oracle does NOT call tokenize(). It masks out comments, literals and
// quoted identifiers with a differently written state machine, then applies
// deliberately conservative rules. Invariant: if the validator accepts a query,
// the oracle must find nothing wrong with it. (The converse is not asserted --
// the oracle is allowed to be stricter.)
// ---------------------------------------------------------------------------

/** Returns the SQL with literal/comment/quoted bodies blanked, or null if unterminated/ambiguous. */
function oracleMask(sql: string): string | null {
  const out: string[] = [];
  type Mode = 'code' | 'line' | 'block' | 'str' | 'br' | 'dq';
  let mode: Mode = 'code';
  let depth = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const n = sql[i + 1];
    switch (mode) {
      case 'code':
        if (c === '-' && n === '-') { mode = 'line'; out.push('  '); i++; }
        else if (c === '/' && n === '*') { mode = 'block'; depth = 1; out.push('  '); i++; }
        else if (c === "'") { mode = 'str'; out.push(' '); }
        else if (c === '[') { mode = 'br'; out.push(' '); }
        else if (c === '"') { mode = 'dq'; out.push(' '); }
        else out.push(c);
        break;
      case 'line':
        if (c === '\n') { mode = 'code'; out.push('\n'); }
        else if ((c === '\r' && n !== '\n') || c === '\u0085' || c === ' ' || c === ' ') return null;
        else out.push(' ');
        break;
      case 'block':
        if (c === '/' && n === '*') { depth++; out.push('  '); i++; }
        else if (c === '*' && n === '/') { depth--; out.push('  '); i++; if (depth === 0) mode = 'code'; }
        else out.push(' ');
        break;
      case 'str':
        if (c === "'") { if (n === "'") { out.push('  '); i++; } else { mode = 'code'; out.push(' '); } }
        else out.push(' ');
        break;
      case 'br':
        if (c === ']') { if (n === ']') { out.push('  '); i++; } else { mode = 'code'; out.push(' '); } }
        else out.push(' ');
        break;
      case 'dq':
        if (c === '"') { if (n === '"') { out.push('  '); i++; } else { mode = 'code'; out.push(' '); } }
        else out.push(' ');
        break;
    }
  }
  return mode === 'code' || mode === 'line' ? out.join('') : null;
}

const WORDISH = /[A-Za-z0-9_#$]/;

/** Reasons a query must not be accepted, per the oracle. Empty => no objection. */
function oracleObjections(sql: string): string[] {
  const masked = oracleMask(sql);
  if (masked === null) return ['unterminated or ambiguous construct'];
  const why: string[] = [];

  // N-prefixed strings: `N` is part of the literal, not a word. Blanking above
  // leaves a stray `N`/`n` before a space, which is harmless.

  if (/[\u0000-\u0008\u000e-\u001f\u007f\u0085]/.test(masked)) why.push('control character in code');
  if (/[^\u0000-\u007f]/.test(masked)) why.push('non-ASCII in code');

  const trimmed = masked.replace(/^[\s;]+/, '').replace(/[\s;]+$/, '');
  if (trimmed.includes(';')) why.push('statement separator');
  if (!/^(SELECT|WITH)(?![A-Za-z0-9_#$])/i.test(trimmed)) why.push('does not start with SELECT/WITH');

  const upper = masked.toUpperCase();
  for (const kw of MUST_BLOCK_KEYWORDS) {
    let from = 0;
    for (;;) {
      const at = upper.indexOf(kw, from);
      if (at < 0) break;
      from = at + 1;
      const after = upper[at + kw.length];
      if (after !== undefined && WORDISH.test(after)) continue; // part of a longer word
      const before = masked[at - 1];
      if (before !== undefined && /[A-Za-z_#$@]/.test(before)) continue; // identifier / variable
      if (before !== undefined && /[0-9]/.test(before)) {
        // preceded by a digit: a keyword only if the run to the left is a NUMBER
        let s = at;
        while (s > 0 && /[A-Za-z0-9_#$.]/.test(masked[s - 1])) s--;
        if (!/[0-9.]/.test(masked[s])) continue; // run starts with a letter => one identifier
        // a hex literal like 0x1F absorbs hex-digit letters; only flag if the keyword starts past them
        const run = masked.slice(s, at);
        if (/^0[xX][0-9A-Fa-f]*$/.test(run) && /[0-9A-Fa-f]/.test(kw[0])) continue;
      }
      why.push(`bare keyword ${kw}`);
    }
  }
  return why;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FRAGMENTS = {
  start: ['SELECT ', 'select\t', 'SELECT\n', ';WITH x AS (SELECT 1) SELECT ', 'WITH x AS (SELECT 1 a) SELECT ', 'SELECT/**/', ' SELECT ', '', 'EXEC '],
  idents: ['a', 't', 'x1', 'created_at', 'execution_time', 'dbo', 'order_execution', 'e', 'x', 'E5'],
  numbers: ['1', '1.', '.5', '1e5', '1E', '1E+', '0x1F', '0xE', '00', '1.5'],
  safe: ['FROM', 'WHERE', 'AS', 'AND', 'OR', 'TOP', 'DISTINCT', 'ORDER', 'BY', 'JOIN', 'ON', 'UNION', 'ALL', 'WITH', 'NOLOCK'],
  punct: ['(', ')', ',', '.', '*', '=', '<', '>', '+', '-', '/', '%'],
  quoty: ["'", "''", "'a'", "N'", '[', ']', '[a]', '"', '"a"', '/*', '*/', '--', '--x', '@', '@@', '@v', ';', ';;'],
  seps: [' ', ' ', ' ', '  ', '\t', '\n', '\r\n', '\r', '\f', '\v', '', '', '', ' ', ' ', '\u0085', '​', '\u0000', '\u001f', 'é', '/**/', '--\n'],
};

function randomQuery(rnd: () => number): string {
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const mixedCase = (w: string) => (rnd() < 0.3 ? w.toLowerCase() : rnd() < 0.2 ? [...w].map((c, i) => (i % 2 ? c.toLowerCase() : c)).join('') : w);
  let q = rnd() < 0.8 ? pick(FRAGMENTS.start) : '';
  const parts = 2 + Math.floor(rnd() * 14);
  for (let i = 0; i < parts; i++) {
    const r = rnd();
    const frag =
      r < 0.18 ? mixedCase(pick(MUST_BLOCK_KEYWORDS))
      : r < 0.34 ? pick(FRAGMENTS.numbers)
      : r < 0.48 ? pick(FRAGMENTS.idents)
      : r < 0.60 ? pick(FRAGMENTS.safe)
      : r < 0.72 ? pick(FRAGMENTS.punct)
      : pick(FRAGMENTS.quoty);
    q += frag + pick(FRAGMENTS.seps);
  }
  return q;
}

test('fuzz: nothing the validator accepts has an objection from the independent oracle', () => {
  const seed = Number(process.env.FUZZ_SEED ?? 20261016);
  const iterations = Number(process.env.FUZZ_ITERATIONS ?? 150_000);
  const rnd = mulberry32(seed);
  const escapes: string[] = [];
  let acceptedCount = 0;

  for (let i = 0; i < iterations; i++) {
    const q = randomQuery(rnd);
    if (!accepted(q)) continue;
    acceptedCount++;
    const why = oracleObjections(q);
    if (why.length) escapes.push(`${JSON.stringify(q)}\n     oracle: ${why.join('; ')}`);
  }

  assert.equal(
    escapes.length, 0,
    `seed=${seed}: ${escapes.length} accepted queries the oracle objects to (of ${acceptedCount} accepted / ${iterations}):\n  ` +
      escapes.slice(0, 10).join('\n  ')
  );
  // The fuzzer is only meaningful if it also produces queries that pass.
  assert.ok(acceptedCount > iterations * 0.01, `fuzzer produced almost no valid queries (${acceptedCount}/${iterations})`);
});

test('fuzz: the validator never throws', () => {
  const rnd = mulberry32(7);
  for (let i = 0; i < 50_000; i++) {
    const q = randomQuery(rnd);
    assert.doesNotThrow(() => check(q), `threw on ${JSON.stringify(q)}`);
  }
  // and on raw junk
  for (const q of ['\u0000', '\ud800', '[', "'", '/*', '--', '"', '@', '@@', '0x', '1e', '.']) {
    assert.doesNotThrow(() => check('SELECT ' + q));
  }
});

test('fuzz: benign recombination is never over-blocked', () => {
  const rnd = mulberry32(99);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const cols = ['created_at', 'deleted_at', 'executed_at', 'is_deleted', 'resp_code', 'merged_at', 'granted_by', 'execution_time',
    'order_execution', 'bulk_import_id', 'updated_date', 'inserted_at', 'executor', 'EXP_DATE'];
  const lits = ["'EXEC'", "'a;b'", "'DROP TABLE x'", "'it''s'", "N'delete'", "'--'", "'/*'", "'[x'"];
  const brs = ['[exec]', '[Set]', '[Use]', '[delete]', '[a]]b]', '"exec"'];
  const cmts = ['/* EXEC */', '-- DROP\n', '/* a /* b */ c */'];
  const failures: string[] = [];
  for (let i = 0; i < 20_000; i++) {
    const n = 1 + Math.floor(rnd() * 4);
    const sel = Array.from({ length: n }, () => (rnd() < 0.6 ? pick(cols) : rnd() < 0.5 ? pick(lits) : pick(brs))).join(', ');
    const q = `SELECT ${sel} FROM ${pick(cols)} ${rnd() < 0.5 ? pick(cmts) : ''}WHERE ${pick(cols)} = ${pick(lits)}`;
    if (!accepted(q)) failures.push(`${JSON.stringify(q)} -> ${check(q).error}`);
  }
  assert.equal(failures.length, 0, `over-blocking:\n  ${failures.slice(0, 8).join('\n  ')}`);
});

// ---------------------------------------------------------------------------
// 5. Pipeline: what is sent is what was validated
// ---------------------------------------------------------------------------

test('pipeline: the exact SQL sent to the server still validates', () => {
  // base.ts validates the raw query, then runs sanitizeQuery -> addRowLimit.
  // If those rewrites could turn an accepted query into a rejected one (or the
  // reverse) the check would be validating something other than what runs.
  const rnd = mulberry32(424242);
  let checked = 0;
  for (let i = 0; i < 100_000; i++) {
    const q = randomQuery(rnd);
    if (!accepted(q)) continue;
    const sent = QueryValidator.addRowLimit(QueryValidator.sanitizeQuery(q), 1000);
    assert.equal(accepted(sent), true, `rewrite changed the verdict:\n  in : ${JSON.stringify(q)}\n  out: ${JSON.stringify(sent)}`);
    checked++;
  }
  for (const [, q] of MUST_ALLOW) {
    const sent = QueryValidator.addRowLimit(QueryValidator.sanitizeQuery(q), 1000);
    assert.equal(accepted(sent), true, `rewrite broke an allowed query: ${JSON.stringify(sent)}`);
  }
  assert.ok(checked > 100, 'pipeline test exercised too few queries');
});

test('pipeline: sanitize never rewrites the inside of string literals', () => {
  const q = "SELECT * FROM Customers WHERE Name = 'John  Smith'";
  assert.equal(QueryValidator.sanitizeQuery(q), q);
  assert.equal(QueryValidator.sanitizeQuery("SELECT 'a   b';"), "SELECT 'a   b'");
});

test('pipeline: sanitize strips only trailing semicolons and outer whitespace', () => {
  assert.equal(QueryValidator.sanitizeQuery('SELECT 1;'), 'SELECT 1');
  assert.equal(QueryValidator.sanitizeQuery('  SELECT 1  '), 'SELECT 1');
  assert.equal(QueryValidator.sanitizeQuery('SELECT 1; ;'), 'SELECT 1');
});

// ---------------------------------------------------------------------------
// 6. Row limit
//
// The expected strings below were each run against a live SQL Server: TOP after
// DISTINCT/ALL is accepted, TOP before DISTINCT is "Incorrect syntax near the
// keyword 'DISTINCT'".
// ---------------------------------------------------------------------------

test('row limit: TOP goes after DISTINCT / ALL, never before', () => {
  const cases: Array<[string, string, string]> = [
    ['plain', 'SELECT a FROM t', 'SELECT TOP 1000 a FROM t'],
    ['star', 'SELECT * FROM t', 'SELECT TOP 1000 * FROM t'],
    ['DISTINCT', 'SELECT DISTINCT a FROM t', 'SELECT DISTINCT TOP 1000 a FROM t'],
    ['ALL', 'SELECT ALL a FROM t', 'SELECT ALL TOP 1000 a FROM t'],
    ['lowercase', 'select distinct a from t', 'select distinct TOP 1000 a from t'],
    ['newlines', 'SELECT\nDISTINCT\na FROM t', 'SELECT\nDISTINCT TOP 1000\na FROM t'],
    ['comment between', 'SELECT /*c*/ DISTINCT a FROM t', 'SELECT /*c*/ DISTINCT TOP 1000 a FROM t'],
    ['comment right after', 'SELECT/*c*/a FROM t', 'SELECT TOP 1000 /*c*/a FROM t'],
    ['no space before bracket', 'SELECT[a] FROM t', 'SELECT TOP 1000 [a] FROM t'],
  ];
  for (const [label, input, want] of cases) {
    assert.equal(QueryValidator.addRowLimit(input, 1000), want, label);
  }
});

test('row limit: an existing TOP on the outer SELECT is respected', () => {
  for (const q of [
    'SELECT TOP 5 a FROM t',
    'SELECT TOP (5) a FROM t',
    'SELECT TOP 5 PERCENT a FROM t',
    'SELECT DISTINCT TOP 5 a FROM t',
    'SELECT ALL TOP 5 a FROM t',
    'select top 5 a from t',
  ]) {
    assert.equal(QueryValidator.addRowLimit(q, 1000), q, q);
  }
});

test('row limit: TOP is recognised as a token, not a substring', () => {
  // the old includes('TOP ') check skipped the limit for all of these
  assert.equal(QueryValidator.addRowLimit('SELECT desktop FROM t', 50), 'SELECT TOP 50 desktop FROM t');
  assert.equal(QueryValidator.addRowLimit("SELECT 'TOP 5' FROM t", 50), "SELECT TOP 50 'TOP 5' FROM t");
  assert.equal(QueryValidator.addRowLimit('SELECT STOP FROM t', 50), 'SELECT TOP 50 STOP FROM t');
  // a TOP in a subquery does not limit the outer query
  assert.equal(
    QueryValidator.addRowLimit('SELECT a FROM (SELECT TOP 5 a FROM t) x', 50),
    'SELECT TOP 50 a FROM (SELECT TOP 5 a FROM t) x'
  );
});

test('row limit: queries that are not a leading SELECT are left alone', () => {
  for (const q of ['WITH c AS (SELECT 1 a) SELECT a FROM c', ';SELECT a FROM t', '(SELECT a FROM t)', "SELECT 'unterminated"]) {
    assert.equal(QueryValidator.addRowLimit(q, 1000), q, q);
  }
});

test('row limit: idempotent, and the result still validates', () => {
  for (const [, q] of MUST_ALLOW) {
    const once = QueryValidator.addRowLimit(q, 1000);
    assert.equal(QueryValidator.addRowLimit(once, 1000), once, `not idempotent: ${q}`);
    assert.equal(accepted(once), true, `rewrite no longer validates: ${once}`);
  }
});

test('row limit: the rewrite only inserts text', () => {
  const rnd = mulberry32(31337);
  let n = 0;
  for (let i = 0; i < 100_000; i++) {
    const q = randomQuery(rnd);
    if (!accepted(q)) continue;
    const out = QueryValidator.addRowLimit(q, 1000);
    if (out === q) continue;
    n++;
    const inserted = out.length - q.length;
    // removing one contiguous run of the inserted length must give the original back
    let recoverable = false;
    for (let at = 0; at + inserted <= out.length && !recoverable; at++) {
      recoverable = out.slice(0, at) + out.slice(at + inserted) === q;
    }
    assert.ok(recoverable, `lossy rewrite:\n  in : ${JSON.stringify(q)}\n  out: ${JSON.stringify(out)}`);
  }
  assert.ok(n > 100, `only ${n} rewrites exercised`);
});

// ---------------------------------------------------------------------------
// 7. Hostile input, lookalikes, and statement coverage
// ---------------------------------------------------------------------------

test('performance: hostile input cannot stall the event loop', () => {
  // The server is single-threaded, so a query that takes a minute to *check*
  // stalls every caller. A regex-based sanitizer once did exactly that on a
  // long run of spaces or semicolons (quadratic backtracking).
  const N = 50_000;
  const budgetMs = 500;
  const hostile: Array<[string, () => unknown]> = [
    ['spaces mid-query, sanitize', () => QueryValidator.sanitizeQuery('SELECT 1' + ' '.repeat(N) + 'x')],
    ['"; " runs mid-query, sanitize', () => QueryValidator.sanitizeQuery('SELECT 1' + '; '.repeat(N / 2) + 'x')],
    ['semicolons mid-query, sanitize', () => QueryValidator.sanitizeQuery('SELECT 1' + ';'.repeat(N) + 'x')],
    ['spaces mid-query, validate', () => QueryValidator.validateQuery('SELECT 1' + ' '.repeat(N) + 'x')],
    ['row limit, wide select list', () => QueryValidator.addRowLimit('SELECT ' + 'a,'.repeat(N) + 'b', 1000)],
    ['nested comments', () => QueryValidator.validateQuery('SELECT 1 ' + '/*'.repeat(N) + '*/'.repeat(N))],
    ['open parentheses', () => QueryValidator.validateQuery('SELECT ' + '('.repeat(N * 4))],
    ['huge literal', () => QueryValidator.validateQuery("SELECT '" + 'a'.repeat(N * 20) + "'")],
    ['doubled quotes', () => QueryValidator.validateQuery("SELECT '" + "''".repeat(N) + "'")],
    ['unterminated brackets', () => QueryValidator.validateQuery('SELECT ' + '['.repeat(N))],
    ['many tiny tokens', () => QueryValidator.validateQuery('SELECT ' + 'a,'.repeat(N) + 'b')],
  ];
  const slow: string[] = [];
  for (const [label, run] of hostile) {
    const start = performance.now();
    run();
    const ms = performance.now() - start;
    if (ms > budgetMs) slow.push(`${label}: ${ms.toFixed(0)} ms`);
  }
  assert.equal(slow.length, 0, `over the ${budgetMs} ms budget:\n  ${slow.join('\n  ')}`);
});

test('sanitize: agrees with the obvious regex on every small input', () => {
  // the regex is the specification; the loop exists only because the regex is slow
  const reference = (q: string) => q.trim().replace(/[\s;]+$/, '');
  const alphabet = ['a', 'x', ' ', ' ', ';', '\n', '\t', '\r', "'", '-'];
  const rnd = mulberry32(2718);
  for (let i = 0; i < 30_000; i++) {
    const q = Array.from({ length: Math.floor(rnd() * 12) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
    assert.equal(QueryValidator.sanitizeQuery(q), reference(q), JSON.stringify(q));
  }
});

test('tokenizer: never silently drops code', () => {
  // Between consecutive tokens there may only be whitespace and comments. If
  // anything else were skipped, a keyword could sit in the gap unseen.
  const stripComments = (gap: string) => {
    let prev = '';
    let s = gap;
    while (s !== prev) { prev = s; s = s.replace(/\/\*(?:(?!\/\*|\*\/)[\s\S])*\*\//g, ' '); }
    return s.replace(/--[^\n]*/g, ' ');
  };
  const rnd = mulberry32(5);
  const pool = ['SELECT', 'a', '1', '1.5', '0x1F', "'x'", "''''", '[b]', '"c"', '/*c*/', '--c\n', ' ', '\n', '\t', ',', '(', ')',
    '.', '*', '@v', '@@v', ';', 'EXEC', 'e5', "N's'", '/*a/*b*/c*/'];
  let lexed = 0;
  const bad: string[] = [];
  for (let i = 0; i < 100_000; i++) {
    const q = Array.from({ length: 1 + Math.floor(rnd() * 10) }, () => pool[Math.floor(rnd() * pool.length)]).join(rnd() < 0.5 ? ' ' : '');
    let tokens;
    try { tokens = tokenize(q); } catch { continue; }
    lexed++;
    let at = 0;
    const gaps: string[] = [];
    for (const tk of tokens) { gaps.push(q.slice(at, tk.start)); at = tk.start + tk.value.length; }
    gaps.push(q.slice(at));
    if (gaps.some(g => stripComments(g).trim() !== '')) bad.push(JSON.stringify(q));
  }
  assert.equal(bad.length, 0, `code fell between tokens:\n  ${bad.slice(0, 5).join('\n  ')}`);
  assert.ok(lexed > 10_000, `only ${lexed} inputs lexed`);
});

test('unicode: lookalikes and case-folding tricks never form a keyword', () => {
  // None of these may be accepted outside a literal. The tokenizer is ASCII-only
  // for code, so there is no folding step an attacker can lean on.
  expectAll([
    ['fullwidth EXEC', 'SELECT 1 ＥＸＥＣ sp_who'],
    ['Cyrillic E in EXEC', 'SELECT 1 ЕXEC sp_who'],
    ['Cyrillic X and C in EXEC', 'SELECT 1 EХEС sp_who'],
    ['long s in SHUTDOWN (uppercases to S)', 'SELECT 1 ſHUTDOWN'],
    ['Kelvin sign in KILL (lowercases to k)', 'SELECT 1 KILL 55'],
    ['dotless i in IF', 'SELECT 1 ıF 1=1 SELECT 2'],
    ['circled letters', 'SELECT 1 ⒺⓍⒺⒸ sp_who'],
    ['soft hyphen inside EXEC', 'SELECT 1 EX­EC sp_who'],
    ['combining mark after EXEC', 'SELECT 1 EXEĆ sp_who'],
    ['emoji outside a literal', 'SELECT 😀 FROM t'],
    ['lone surrogate outside a literal', 'SELECT \ud800 FROM t'],
    ['byte order mark before SELECT', '﻿SELECT 1'],
  ], false);
  // ...while the same characters are plain data inside a literal or [identifier]
  expectAll([
    ['emoji in a literal', "SELECT '😀'"],
    ['lone surrogate in a literal', "SELECT '\ud800'"],
    ['lookalike EXEC in a literal', "SELECT N'ЕXEC'"],
    ['lookalike EXEC in brackets', 'SELECT [ЕXEC] FROM t'],
  ], true);
});

test('a stored procedure cannot be called without EXEC', () => {
  // T-SQL lets a procedure name stand alone as the first statement of a batch.
  // The leading-keyword rule is what stops that.
  expectAll([
    ['bare procedure', 'sp_who'],
    ['bare extended procedure', "xp_cmdshell 'dir'"],
    ['schema-qualified', 'sys.sp_who'],
    ['three-part', "master..xp_cmdshell 'dir'"],
    ['bracketed', '[sp_who]'],
    ['after a leading semicolon', ';sp_who'],
  ], false);
});

test('hex literal followed by a word is rejected (SQL Server splits them)', () => {
  // Verified against SQL Server: `SELECT 0x1FAS x` lexes as the hex literal
  // 0x1FA then the word S. So a keyword whose first letter is not a hex digit
  // can sit directly behind a hex literal.
  expectAll([
    ['KILL behind hex', 'SELECT 0x1FKILL 55'],
    ['INSERT behind hex', 'SELECT 0x1FINSERT INTO t SELECT 1'],
    ['SHUTDOWN behind hex', 'SELECT 0x1FSHUTDOWN'],
    ['plain hex then space then keyword', 'SELECT 0x1F KILL 55'],
  ], false);
  assert.equal(accepted('SELECT 0x1F, 0xAB FROM t'), true);
});

test('statement coverage: every reserved statement-starter is blocked after a SELECT', () => {
  const starters = ['ALTER', 'BACKUP', 'BEGIN', 'BREAK', 'BULK', 'CHECKPOINT', 'CLOSE', 'COMMIT', 'CONTINUE', 'CREATE', 'DEALLOCATE',
    'DECLARE', 'DELETE', 'DENY', 'DROP', 'EXEC', 'EXECUTE', 'GOTO', 'GRANT', 'IF', 'INSERT', 'KILL', 'MERGE', 'OPEN', 'PRINT',
    'RAISERROR', 'READTEXT', 'RECONFIGURE', 'RESTORE', 'RETURN', 'REVERT', 'REVOKE', 'ROLLBACK', 'SAVE', 'SET', 'SETUSER',
    'SHUTDOWN', 'THROW', 'TRUNCATE', 'UPDATE', 'UPDATETEXT', 'USE', 'WAITFOR', 'WHILE', 'WRITETEXT', 'ADD'];
  const open = starters.filter(k => accepted(`SELECT 1 ${k} x`));
  assert.deepEqual(open, [], `still accepted after a complete SELECT: ${open.join(', ')}`);
});

test('statement coverage: words that are ordinary identifiers stay usable', () => {
  // Verified against SQL Server: each of these works as a column alias. They
  // begin statements elsewhere (Service Broker, triggers, legacy backup) but
  // blocking them would reject real columns, so what they could do is left to
  // database permissions.
  for (const word of ['send', 'receive', 'move', 'get', 'enable', 'disable', 'load', 'dump', 'status', 'level', 'name', 'value', 'key']) {
    assert.equal(accepted(`SELECT 1 AS ${word}`), true, word);
    assert.equal(accepted(`SELECT ${word} FROM t`), true, word);
  }
  // END and FETCH are reserved yet legitimate inside a query
  assert.equal(accepted('SELECT CASE WHEN a = 1 THEN 2 ELSE 3 END FROM t'), true);
  assert.equal(accepted('SELECT a FROM t ORDER BY a OFFSET 5 ROWS FETCH NEXT 5 ROWS ONLY'), true);
});

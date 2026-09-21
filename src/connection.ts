import sql from 'mssql';
import { ConnectionConfig } from './types.js';

export class SqlServerConnection {
  private pool: sql.ConnectionPool | null = null;
  private config: ConnectionConfig;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.pool) {
      return;
    }

    const sqlConfig: sql.config = {
      server: this.config.server,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      port: this.config.port,
      options: {
        encrypt: this.config.encrypt,
        trustServerCertificate: this.config.trustServerCertificate,
        connectTimeout: this.config.connectionTimeout,
        requestTimeout: this.config.requestTimeout,
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };

    this.pool = new sql.ConnectionPool(sqlConfig);
    await this.pool.connect();
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  /**
   * Builds the SESSION_CONTEXT preamble for a request.
   *
   * SESSION_CONTEXT is connection-scoped, and this class runs queries through a
   * pool, so the context has to be established in the same batch as the query
   * that depends on it -- setting it in a separate round trip would apply it to
   * whichever connection the pool happened to hand out at the time.
   *
   * Keys and values are bound as parameters rather than interpolated, so the
   * preamble carries no injection surface. It is built entirely from server
   * configuration; no part of it comes from the caller's query.
   *
   * When read-only keys are in use the EXEC is guarded on SESSION_CONTEXT()
   * being unset, because pooled connections are reused: re-running the EXEC
   * against an already-locked key raises error 15664.
   */
  private applySessionContext(request: sql.Request): string {
    const entries = Object.entries(this.config.sessionContext ?? {});
    if (entries.length === 0) {
      return '';
    }

    const readOnly = this.config.sessionContextReadOnly !== false;
    let preamble = '';

    entries.forEach(([key, value], i) => {
      const keyParam = `__sc_key_${i}`;
      const valueParam = `__sc_val_${i}`;

      request.input(keyParam, sql.NVarChar(128), key);
      if (typeof value === 'number') {
        request.input(valueParam, sql.Int, value);
      } else {
        // sql_variant, the type of sp_set_session_context's @value, cannot hold
        // the LOB types -- nvarchar(max) included -- so strings bind as
        // nvarchar(4000). parseSessionContext rejects anything longer.
        request.input(valueParam, sql.NVarChar(4000), value);
      }

      const exec =
        `EXEC sys.sp_set_session_context @key = @${keyParam}, ` +
        `@value = @${valueParam}` +
        (readOnly ? ', @read_only = 1' : '') +
        ';';

      preamble += readOnly
        ? `IF SESSION_CONTEXT(@${keyParam}) IS NULL ${exec}\n`
        : `${exec}\n`;
    });

    return preamble;
  }

  async query<T = any>(queryText: string): Promise<sql.IResult<T>> {
    if (!this.pool) {
      throw new Error('Database connection not established');
    }

    const request = this.pool.request();
    const preamble = this.applySessionContext(request);
    return await request.query(preamble + queryText);
  }

  /**
   * Tears down and reopens the pool, clearing SESSION_CONTEXT on every
   * connection.
   *
   * Read-only keys cannot be cleared from T-SQL -- they are released only when
   * the connection resets. tedious can reset an individual connection
   * (Connection.reset), but mssql neither calls it nor exposes a per-checkout
   * hook, so recycling the pool is the only route through the public API.
   * Callers need this to change a session context value that was set read-only.
   */
  async resetSessionContext(
    sessionContext?: ConnectionConfig['sessionContext']
  ): Promise<void> {
    if (arguments.length > 0) {
      this.config = { ...this.config, sessionContext };
    }

    await this.disconnect();
    await this.connect();
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      const result = await this.query('SELECT 1 as test');
      return result.recordset.length > 0;
    } catch (error) {
      return false;
    }
  }

  isConnected(): boolean {
    return this.pool !== null && this.pool.connected;
  }

  getConfig(): Readonly<ConnectionConfig> {
    return { ...this.config };
  }
}
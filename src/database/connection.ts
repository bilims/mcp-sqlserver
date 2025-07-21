import sql from 'mssql';
import { SqlServerConfig } from '../types/config.js';

export class DatabaseConnection {
  private pool: sql.ConnectionPool | null = null;
  private config: SqlServerConfig;

  constructor(config: SqlServerConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.pool && this.pool.connected) {
      return;
    }

    const poolConfig: sql.config = {
      server: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      options: {
        encrypt: this.config.encrypt,
        trustServerCertificate: this.config.trustServerCertificate,
        enableArithAbort: this.config.enableArithAbort,
        instanceName: this.config.instanceName,
      },
      pool: {
        min: this.config.pool.min,
        max: this.config.pool.max,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: this.config.connectionTimeout,
      },
      connectionTimeout: this.config.connectionTimeout,
      requestTimeout: this.config.requestTimeout,
    };

    this.pool = new sql.ConnectionPool(poolConfig);
    
    this.pool.on('error', (err) => {
      process.stderr.write(`Database pool error: ${err.message || err}\n`);
    });

    try {
      await this.pool.connect();
      // Silent connection - don't contaminate stdio
    } catch (error) {
      process.stderr.write(`Failed to connect to database: ${error}\n`);
      this.pool = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  getPool(): sql.ConnectionPool {
    if (!this.pool || !this.pool.connected) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.pool;
  }

  async testConnection(): Promise<boolean> {
    try {
      const request = this.getPool().request();
      await request.query('SELECT 1 as test');
      return true;
    } catch (error) {
      process.stderr.write(`Connection test failed: ${error}\n`);
      return false;
    }
  }

  async getServerInfo(): Promise<{ version: string; edition: string }> {
    const request = this.getPool().request();
    const result = await request.query(`
      SELECT 
        @@VERSION as version,
        SERVERPROPERTY('Edition') as edition
    `);
    
    return {
      version: result.recordset[0].version,
      edition: result.recordset[0].edition
    };
  }
}
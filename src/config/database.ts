import { SqlServerConfig, SqlServerConfigSchema } from '../types/config.js';

export function loadDatabaseConfig(): SqlServerConfig {
  const config = {
    host: process.env.SQLSERVER_HOST || 'localhost',
    port: parseInt(process.env.SQLSERVER_PORT || '1433', 10),
    database: process.env.SQLSERVER_DATABASE || '',
    username: process.env.SQLSERVER_USERNAME || '',
    password: process.env.SQLSERVER_PASSWORD || '',
    encrypt: process.env.SQLSERVER_ENCRYPT === 'true',
    trustServerCertificate: process.env.SQLSERVER_TRUST_SERVER_CERTIFICATE === 'true',
    instanceName: process.env.SQLSERVER_INSTANCE_NAME,
    pool: {
      min: parseInt(process.env.SQLSERVER_POOL_MIN || '0', 10),
      max: parseInt(process.env.SQLSERVER_POOL_MAX || '10', 10),
    },
    connectionTimeout: parseInt(process.env.SQLSERVER_CONNECTION_TIMEOUT || '15000', 10),
    requestTimeout: parseInt(process.env.SQLSERVER_REQUEST_TIMEOUT || '15000', 10),
    enableArithAbort: process.env.SQLSERVER_ENABLE_ARITH_ABORT !== 'false',
  };

  return SqlServerConfigSchema.parse(config);
}
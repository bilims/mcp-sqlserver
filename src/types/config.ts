import { z } from 'zod';

export const SqlServerConfigSchema = z.object({
  host: z.string().min(1, 'Host is required'),
  port: z.number().int().min(1).max(65535).default(1433),
  database: z.string().min(1, 'Database name is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  encrypt: z.boolean().default(true),
  trustServerCertificate: z.boolean().default(false),
  instanceName: z.string().optional(),
  pool: z.object({
    min: z.number().int().min(0).default(0),
    max: z.number().int().min(1).default(10),
  }).default({ min: 0, max: 10 }),
  connectionTimeout: z.number().int().min(1000).default(15000),
  requestTimeout: z.number().int().min(1000).default(15000),
  enableArithAbort: z.boolean().default(true),
});

export type SqlServerConfig = z.infer<typeof SqlServerConfigSchema>;

export const QueryOptionsSchema = z.object({
  timeout: z.number().int().min(1000).max(300000).default(30000),
  maxRows: z.number().int().min(1).max(10000).default(1000),
});

export type QueryOptions = z.infer<typeof QueryOptionsSchema>;
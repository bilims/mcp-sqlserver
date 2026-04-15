import { z } from 'zod';

export const ConnectionConfigSchema = z.object({
  server: z.string(),
  database: z.string().optional(),
  user: z.string(),
  password: z.string(),
  port: z.number().optional().default(1433),
  encrypt: z.boolean().optional().default(true),
  trustServerCertificate: z.boolean().optional().default(false),
  connectionTimeout: z.number().optional().default(30000),
  requestTimeout: z.number().optional().default(60000),
  maxRows: z.number().optional().default(1000),
});

export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;

export interface TableInfo {
  table_catalog: string;
  table_schema: string;
  table_name: string;
  table_type: string;
}

export interface ColumnInfo {
  table_catalog: string;
  table_schema: string;
  table_name: string;
  column_name: string;
  ordinal_position: number;
  column_default: string | null;
  is_nullable: string;
  data_type: string;
  character_maximum_length: number | null;
  character_octet_length: number | null;
  numeric_precision: number | null;
  numeric_precision_radix: number | null;
  numeric_scale: number | null;
  datetime_precision: number | null;
}

export interface ForeignKeyInfo {
  constraint_name: string;
  table_schema: string;
  table_name: string;
  column_name: string;
  referenced_table_schema: string;
  referenced_table_name: string;
  referenced_column_name: string;
}

export interface IndexInfo {
  table_schema: string;
  table_name: string;
  index_name: string;
  column_name: string;
  index_type: string;
  is_unique: boolean;
  is_primary_key: boolean;
}

export interface ViewInfo {
  table_catalog: string;
  table_schema: string;
  table_name: string;
  view_definition: string;
  check_option: string | null;
  is_updatable: string;
}

export interface ProcedureInfo {
  routine_catalog: string;
  routine_schema: string;
  routine_name: string;
  routine_type: string;
  data_type: string | null;
  routine_definition: string | null;
}

export interface DatabaseInfo {
  database_id: number;
  name: string;
  create_date: string;
  collation_name: string;
  state_desc: string;
}

export interface ServerInfo {
  server_name: string;
  product_version: string;
  product_level: string;
  edition: string;
  engine_edition: number;
}

export interface QueryResult {
  columns: string[];
  rows: any[][];
  rowCount: number;
  executionTime: number;
}

export interface TableStats {
  table_schema: string;
  table_name: string;
  row_count: number;
  data_size_kb: number;
  index_size_kb: number;
  total_size_kb: number;
}
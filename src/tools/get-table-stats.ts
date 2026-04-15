import { BaseTool } from './base.js';
import { TableStats } from '../types.js';
import { ParameterValidator } from '../validation.js';

export class GetTableStatsTool extends BaseTool {
  getName(): string {
    return 'get_table_stats';
  }

  getDescription(): string {
    return 'Get statistics for tables including row counts and size information';
  }

  getInputSchema(): any {
    return {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'Name of the table to get stats for (optional - if not provided, returns stats for all tables)',
        },
        schema: {
          type: 'string',
          description: 'Schema name (optional, defaults to dbo)',
          default: 'dbo',
        },
      },
      required: [],
    };
  }

  async execute(params: { table_name?: string; schema?: string }): Promise<TableStats[]> {
    const { table_name, schema } = ParameterValidator.validateTableStatsParameters(params);

    let query = `
      SELECT
        s.name as table_schema,
        t.name as table_name,
        p.rows as row_count,
        SUM(a.total_pages) * 8 as total_size_kb,
        SUM(a.used_pages) * 8 as data_size_kb,
        (SUM(a.total_pages) - SUM(a.used_pages)) * 8 as index_size_kb
      FROM sys.tables t
      INNER JOIN sys.indexes i ON t.object_id = i.object_id
      INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
      INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
      LEFT OUTER JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE t.name NOT LIKE 'dt%'
        AND t.is_ms_shipped = 0
        AND i.object_id > 255
    `;

    const conditions = [];

    if (table_name) {
      const escapedTableName = ParameterValidator.escapeIdentifier(table_name);
      conditions.push(`t.name = ${escapedTableName}`);
    }

    if (schema) {
      const escapedSchema = ParameterValidator.escapeIdentifier(schema);
      conditions.push(`s.name = ${escapedSchema}`);
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(' AND ')}`;
    }

    query += `
      GROUP BY s.name, t.name, p.rows
      ORDER BY table_schema, table_name
    `;

    return await this.executeSafeQuery<TableStats>(query);
  }
}
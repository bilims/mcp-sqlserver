import { BaseTool } from './base.js';
import { ForeignKeyInfo } from '../types.js';
import { ParameterValidator } from '../validation.js';

export class GetForeignKeysTool extends BaseTool {
  getName(): string {
    return 'get_foreign_keys';
  }

  getDescription(): string {
    return 'Get foreign key relationships for a table or entire database';
  }

  getInputSchema(): any {
    return {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'Name of the table to get foreign keys for (optional - if not provided, returns all foreign keys)',
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

  async execute(params: { table_name?: string; schema?: string }): Promise<ForeignKeyInfo[]> {
    const { table_name, schema } = ParameterValidator.validateForeignKeyParameters(params);

    let query = `
      SELECT
        fk.name as constraint_name,
        OBJECT_SCHEMA_NAME(fk.parent_object_id) as table_schema,
        OBJECT_NAME(fk.parent_object_id) as table_name,
        COL_NAME(fkc.parent_object_id, fkc.parent_column_id) as column_name,
        OBJECT_SCHEMA_NAME(fk.referenced_object_id) as referenced_table_schema,
        OBJECT_NAME(fk.referenced_object_id) as referenced_table_name,
        COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) as referenced_column_name
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc
        ON fk.object_id = fkc.constraint_object_id
    `;

    const conditions = [];

    if (table_name) {
      const escapedTableName = ParameterValidator.escapeIdentifier(table_name);
      conditions.push(`OBJECT_NAME(fk.parent_object_id) = ${escapedTableName}`);
    }

    if (schema && table_name) {
      const escapedSchema = ParameterValidator.escapeIdentifier(schema);
      conditions.push(`OBJECT_SCHEMA_NAME(fk.parent_object_id) = ${escapedSchema}`);
    } else if (schema) {
      const escapedSchema = ParameterValidator.escapeIdentifier(schema);
      conditions.push(`OBJECT_SCHEMA_NAME(fk.parent_object_id) = ${escapedSchema}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY table_schema, table_name, constraint_name';

    return await this.executeSafeQuery<ForeignKeyInfo>(query);
  }
}
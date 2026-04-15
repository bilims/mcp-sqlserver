import { z } from 'zod';

export class ParameterValidator {
  // Schema name validation - SQL Server identifier rules
  private static schemaNameSchema = z.string()
    .min(1, 'Schema name cannot be empty')
    .max(128, 'Schema name cannot exceed 128 characters')
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Schema name must start with letter or underscore and contain only letters, numbers, and underscores')
    .refine(name => !this.isReservedWord(name), 'Schema name cannot be a reserved word');

  // Table name validation
  private static tableNameSchema = z.string()
    .min(1, 'Table name cannot be empty')
    .max(128, 'Table name cannot exceed 128 characters')
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Table name must start with letter or underscore and contain only letters, numbers, and underscores')
    .refine(name => !this.isReservedWord(name), 'Table name cannot be a reserved word');

  // Column name validation
  private static columnNameSchema = z.string()
    .min(1, 'Column name cannot be empty')
    .max(128, 'Column name cannot exceed 128 characters')
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Column name must start with letter or underscore and contain only letters, numbers, and underscores');

  // Database name validation
  private static databaseNameSchema = z.string()
    .min(1, 'Database name cannot be empty')
    .max(128, 'Database name cannot exceed 128 characters')
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Database name must start with letter or underscore and contain only letters, numbers, and underscores')
    .refine(name => !this.isReservedWord(name), 'Database name cannot be a reserved word');

  // Row limit validation
  private static rowLimitSchema = z.number()
    .int('Row limit must be an integer')
    .min(1, 'Row limit must be at least 1')
    .max(10000, 'Row limit cannot exceed 10,000 for safety');

  // SQL Server reserved words (subset)
  private static readonly RESERVED_WORDS = new Set([
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE',
    'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'ON', 'AS',
    'ORDER', 'BY', 'GROUP', 'HAVING', 'UNION', 'DISTINCT', 'TOP', 'NULL',
    'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'EXISTS', 'ALL', 'ANY',
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IF', 'WHILE', 'BEGIN', 'EXEC',
    'DECLARE', 'SET', 'PRINT', 'RETURN', 'FUNCTION', 'PROCEDURE', 'TRIGGER',
    'INDEX', 'VIEW', 'TABLE', 'DATABASE', 'SCHEMA', 'USER', 'ROLE', 'GRANT',
    'REVOKE', 'DENY', 'PRIMARY', 'FOREIGN', 'KEY', 'CONSTRAINT', 'UNIQUE',
  ]);

  private static isReservedWord(word: string): boolean {
    return this.RESERVED_WORDS.has(word.toUpperCase());
  }

  static validateSchemaName(schema: string): string {
    return this.schemaNameSchema.parse(schema);
  }

  static validateTableName(tableName: string): string {
    return this.tableNameSchema.parse(tableName);
  }

  static validateColumnName(columnName: string): string {
    return this.columnNameSchema.parse(columnName);
  }

  static validateDatabaseName(databaseName: string): string {
    return this.databaseNameSchema.parse(databaseName);
  }

  static validateRowLimit(limit: number): number {
    return this.rowLimitSchema.parse(limit);
  }

  // Validate and sanitize identifiers by escaping them with brackets
  static escapeIdentifier(identifier: string): string {
    // First validate the identifier
    if (!identifier || typeof identifier !== 'string') {
      throw new Error('Identifier must be a non-empty string');
    }

    // Remove any existing brackets
    const cleaned = identifier.replace(/[\[\]]/g, '');
    
    // Validate the cleaned identifier
    if (cleaned.length === 0) {
      throw new Error('Identifier cannot be empty after cleaning');
    }

    if (cleaned.length > 128) {
      throw new Error('Identifier cannot exceed 128 characters');
    }

    // Escape with brackets for safe use in queries
    return `[${cleaned}]`;
  }

  // Validate query parameters for execute_query tool
  static validateQueryParameters(params: { query?: string; limit?: number }): {
    query: string;
    limit: number;
  } {
    const querySchema = z.string()
      .min(1, 'Query cannot be empty')
      .max(10000, 'Query cannot exceed 10,000 characters')
      .refine(q => q.trim().length > 0, 'Query cannot be only whitespace');

    const limitSchema = z.number()
      .int('Limit must be an integer')
      .min(1, 'Limit must be at least 1')
      .max(10000, 'Limit cannot exceed 10,000')
      .optional()
      .default(1000);

    return {
      query: querySchema.parse(params.query),
      limit: limitSchema.parse(params.limit),
    };
  }

  // Validate table description parameters
  static validateTableDescriptionParameters(params: { table_name?: string; schema?: string }): {
    table_name: string;
    schema: string;
  } {
    if (!params.table_name) {
      throw new Error('table_name parameter is required');
    }

    return {
      table_name: this.validateTableName(params.table_name),
      schema: params.schema ? this.validateSchemaName(params.schema) : 'dbo',
    };
  }

  // Validate foreign key parameters
  static validateForeignKeyParameters(params: { table_name?: string; schema?: string }): {
    table_name?: string;
    schema?: string;
  } {
    const result: { table_name?: string; schema?: string } = {};

    if (params.schema) {
      result.schema = this.validateSchemaName(params.schema);
    }

    if (params.table_name) {
      result.table_name = this.validateTableName(params.table_name);
    }

    return result;
  }

  // Validate table stats parameters
  static validateTableStatsParameters(params: { table_name?: string; schema?: string }): {
    table_name?: string;
    schema?: string;
  } {
    const result: { table_name?: string; schema?: string } = {};

    if (params.schema) {
      result.schema = this.validateSchemaName(params.schema);
    } else {
      result.schema = 'dbo'; // Default schema
    }

    if (params.table_name) {
      result.table_name = this.validateTableName(params.table_name);
    }

    return result;
  }

  // Validate list tables parameters
  static validateListTablesParameters(params: { schema?: string }): {
    schema?: string;
  } {
    const result: { schema?: string } = {};
    if (params.schema) {
      result.schema = this.validateSchemaName(params.schema);
    }
    return result;
  }

  // General parameter validation for any tool
  static validateParameters<T>(params: any, schema: z.ZodSchema<T>): T {
    try {
      return schema.parse(params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        throw new Error(`Parameter validation failed: ${errorMessages.join(', ')}`);
      }
      throw error;
    }
  }
}
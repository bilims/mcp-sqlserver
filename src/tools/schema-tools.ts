import { z } from 'zod';
import { DatabaseConnection } from '../database/connection.js';

export const GetTablesSchema = z.object({
  schema: z.string().optional(),
  pattern: z.string().optional(),
});

export const GetColumnsSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  schema: z.string().optional(),
});

export const GetIndexesSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  schema: z.string().optional(),
});

export const GetForeignKeysSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  schema: z.string().optional(),
});

export class SchemaTools {
  constructor(private db: DatabaseConnection) {}

  async getTables(params: z.infer<typeof GetTablesSchema> = {}) {
    const { schema = 'dbo', pattern } = params;
    
    let query = `
      SELECT 
        TABLE_SCHEMA as [schema],
        TABLE_NAME as [name],
        TABLE_TYPE as [type]
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = @schema
    `;
    
    const pool = this.db.getPool();
    const request = pool.request();
    request.input('schema', schema);
    
    if (pattern) {
      query += ' AND TABLE_NAME LIKE @pattern';
      request.input('pattern', `%${pattern}%`);
    }
    
    query += ' ORDER BY TABLE_SCHEMA, TABLE_NAME';
    
    const result = await request.query(query);
    
    return {
      success: true,
      tables: result.recordset,
      count: result.recordset.length
    };
  }

  async getColumns(params: z.infer<typeof GetColumnsSchema>) {
    const { table, schema = 'dbo' } = params;
    
    const query = `
      SELECT 
        COLUMN_NAME as [name],
        DATA_TYPE as [dataType],
        CHARACTER_MAXIMUM_LENGTH as [maxLength],
        NUMERIC_PRECISION as [precision],
        NUMERIC_SCALE as [scale],
        IS_NULLABLE as [nullable],
        COLUMN_DEFAULT as [defaultValue],
        ORDINAL_POSITION as [position]
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
      ORDER BY ORDINAL_POSITION
    `;
    
    const pool = this.db.getPool();
    const request = pool.request();
    request.input('schema', schema);
    request.input('table', table);
    
    const result = await request.query(query);
    
    return {
      success: true,
      table: `${schema}.${table}`,
      columns: result.recordset.map(col => ({
        ...col,
        nullable: col.nullable === 'YES'
      })),
      count: result.recordset.length
    };
  }

  async getIndexes(params: z.infer<typeof GetIndexesSchema>) {
    const { table, schema = 'dbo' } = params;
    
    const query = `
      SELECT 
        i.name as [indexName],
        i.type_desc as [indexType],
        i.is_unique as [isUnique],
        i.is_primary_key as [isPrimaryKey],
        i.is_unique_constraint as [isUniqueConstraint],
        STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) as [columns]
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      INNER JOIN sys.tables t ON i.object_id = t.object_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE s.name = @schema AND t.name = @table
      GROUP BY i.name, i.type_desc, i.is_unique, i.is_primary_key, i.is_unique_constraint
      ORDER BY i.name
    `;
    
    const pool = this.db.getPool();
    const request = pool.request();
    request.input('schema', schema);
    request.input('table', table);
    
    const result = await request.query(query);
    
    return {
      success: true,
      table: `${schema}.${table}`,
      indexes: result.recordset.map(idx => ({
        ...idx,
        isUnique: !!idx.isUnique,
        isPrimaryKey: !!idx.isPrimaryKey,
        isUniqueConstraint: !!idx.isUniqueConstraint
      })),
      count: result.recordset.length
    };
  }

  async getForeignKeys(params: z.infer<typeof GetForeignKeysSchema>) {
    const { table, schema = 'dbo' } = params;
    
    const query = `
      SELECT 
        fk.name as [constraintName],
        SCHEMA_NAME(fk.schema_id) as [schema],
        OBJECT_NAME(fk.parent_object_id) as [table],
        STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY fkc.constraint_column_id) as [columns],
        SCHEMA_NAME(ref_t.schema_id) as [referencedSchema],
        OBJECT_NAME(fk.referenced_object_id) as [referencedTable],
        STRING_AGG(ref_c.name, ', ') WITHIN GROUP (ORDER BY fkc.constraint_column_id) as [referencedColumns],
        fk.delete_referential_action_desc as [deleteAction],
        fk.update_referential_action_desc as [updateAction]
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      INNER JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
      INNER JOIN sys.columns ref_c ON fkc.referenced_object_id = ref_c.object_id AND fkc.referenced_column_id = ref_c.column_id
      INNER JOIN sys.tables ref_t ON fk.referenced_object_id = ref_t.object_id
      WHERE SCHEMA_NAME(fk.schema_id) = @schema AND OBJECT_NAME(fk.parent_object_id) = @table
      GROUP BY fk.name, fk.schema_id, fk.parent_object_id, fk.referenced_object_id, ref_t.schema_id, 
               fk.delete_referential_action_desc, fk.update_referential_action_desc
      ORDER BY fk.name
    `;
    
    const pool = this.db.getPool();
    const request = pool.request();
    request.input('schema', schema);
    request.input('table', table);
    
    const result = await request.query(query);
    
    return {
      success: true,
      table: `${schema}.${table}`,
      foreignKeys: result.recordset,
      count: result.recordset.length
    };
  }

  async getTableStructure(params: z.infer<typeof GetColumnsSchema>) {
    const [columns, indexes, foreignKeys] = await Promise.all([
      this.getColumns(params),
      this.getIndexes(params),
      this.getForeignKeys(params)
    ]);
    
    return {
      success: true,
      table: `${params.schema || 'dbo'}.${params.table}`,
      structure: {
        columns: columns.columns,
        indexes: indexes.indexes,
        foreignKeys: foreignKeys.foreignKeys
      }
    };
  }

  async getSchemas() {
    const query = `
      SELECT 
        name as [schemaName],
        schema_id as [schemaId]
      FROM sys.schemas
      WHERE schema_id < 16384 -- Exclude system schemas
      ORDER BY name
    `;
    
    const pool = this.db.getPool();
    const request = pool.request();
    
    const result = await request.query(query);
    
    return {
      success: true,
      schemas: result.recordset,
      count: result.recordset.length
    };
  }
}
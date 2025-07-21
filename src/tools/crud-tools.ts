import { z } from 'zod';
import { DatabaseConnection } from '../database/connection.js';
import { QueryBuilder, WhereCondition, QueryParams } from '../database/query-builder.js';
import { QueryOptions } from '../types/config.js';

const WhereConditionSchema = z.object({
  column: z.string().min(1),
  operator: z.enum(['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL']),
  value: z.any().optional(),
});

const JoinConditionSchema = z.object({
  type: z.enum(['INNER', 'LEFT', 'RIGHT', 'FULL']),
  table: z.string().min(1),
  on: z.string().min(1),
});

const OrderBySchema = z.object({
  column: z.string().min(1),
  direction: z.enum(['ASC', 'DESC']).default('ASC'),
});

export const SelectToolSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  columns: z.array(z.string()).optional(),
  where: z.array(WhereConditionSchema).optional(),
  joins: z.array(JoinConditionSchema).optional(),
  orderBy: z.array(OrderBySchema).optional(),
  limit: z.number().int().min(1).max(10000).optional(),
  offset: z.number().int().min(0).optional(),
});

export const InsertToolSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  data: z.record(z.string(), z.any()).refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one column must be provided' }
  ),
});

export const UpdateToolSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  data: z.record(z.string(), z.any()).refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one column must be provided' }
  ),
  where: z.array(WhereConditionSchema).min(1, 'WHERE conditions are required for UPDATE'),
});

export const DeleteToolSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  where: z.array(WhereConditionSchema).min(1, 'WHERE conditions are required for DELETE'),
});

export const CustomQuerySchema = z.object({
  query: z.string().min(1, 'SQL query is required'),
  parameters: z.record(z.string(), z.any()).optional(),
});

export class CrudTools {
  constructor(private db: DatabaseConnection) {}

  async executeSelect(params: z.infer<typeof SelectToolSchema>, options: QueryOptions = { timeout: 30000, maxRows: 1000 }) {
    const queryParams: QueryParams = {
      table: params.table,
      columns: params.columns,
      where: params.where as WhereCondition[],
      joins: params.joins,
      orderBy: params.orderBy,
      limit: Math.min(params.limit || options.maxRows, options.maxRows),
      offset: params.offset,
    };

    const { query, inputs } = QueryBuilder.buildSelectQuery(queryParams);
    
    const pool = this.db.getPool();
    const request = pool.request();
    
    // Set request timeout - use requestTimeout property instead of timeout
    (request as any).requestTimeout = options.timeout;
    
    // Add input parameters
    for (const [key, value] of Object.entries(inputs)) {
      request.input(key, value);
    }

    const result = await request.query(query);
    
    return {
      success: true,
      rowCount: result.recordset.length,
      data: result.recordset,
      query,
      executionTime: `${Date.now()}ms`
    };
  }

  async executeInsert(params: z.infer<typeof InsertToolSchema>) {
    const { query, inputs } = QueryBuilder.buildInsertQuery(params.table, params.data);
    
    const pool = this.db.getPool();
    const request = pool.request();
    
    // Add input parameters
    for (const [key, value] of Object.entries(inputs)) {
      request.input(key, value);
    }

    const result = await request.query(query + '; SELECT @@ROWCOUNT as rowsAffected');
    
    return {
      success: true,
      rowsAffected: result.recordset[0].rowsAffected,
      query,
      insertedData: params.data
    };
  }

  async executeUpdate(params: z.infer<typeof UpdateToolSchema>) {
    const { query, inputs } = QueryBuilder.buildUpdateQuery(
      params.table,
      params.data,
      params.where as WhereCondition[]
    );
    
    const pool = this.db.getPool();
    const request = pool.request();
    
    // Add input parameters
    for (const [key, value] of Object.entries(inputs)) {
      request.input(key, value);
    }

    const result = await request.query(query + '; SELECT @@ROWCOUNT as rowsAffected');
    
    return {
      success: true,
      rowsAffected: result.recordset[0].rowsAffected,
      query,
      updatedData: params.data,
      whereConditions: params.where
    };
  }

  async executeDelete(params: z.infer<typeof DeleteToolSchema>) {
    const { query, inputs } = QueryBuilder.buildDeleteQuery(
      params.table,
      params.where as WhereCondition[]
    );
    
    const pool = this.db.getPool();
    const request = pool.request();
    
    // Add input parameters
    for (const [key, value] of Object.entries(inputs)) {
      request.input(key, value);
    }

    const result = await request.query(query + '; SELECT @@ROWCOUNT as rowsAffected');
    
    return {
      success: true,
      rowsAffected: result.recordset[0].rowsAffected,
      query,
      whereConditions: params.where
    };
  }

  async executeCustomQuery(params: z.infer<typeof CustomQuerySchema>, options: QueryOptions = { timeout: 30000, maxRows: 1000 }) {
    // Basic security check - prevent multiple statements and dangerous operations
    const cleanQuery = params.query.trim();
    if (cleanQuery.includes(';') && !cleanQuery.endsWith(';')) {
      throw new Error('Multiple SQL statements are not allowed for security reasons');
    }
    
    const dangerousPatterns = [
      /\bdrop\s+/i,
      /\btruncate\s+/i,
      /\balter\s+/i,
      /\bcreate\s+/i,
      /\bexec\s*\(/i,
      /\bsp_/i,
      /\bxp_/i,
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(cleanQuery)) {
        throw new Error('Query contains potentially dangerous operations that are not allowed');
      }
    }
    
    const pool = this.db.getPool();
    const request = pool.request();
    
    // Set request timeout - use requestTimeout property instead of timeout
    (request as any).requestTimeout = options.timeout;
    
    // Add input parameters if provided
    if (params.parameters) {
      for (const [key, value] of Object.entries(params.parameters)) {
        request.input(key, value);
      }
    }

    const result = await request.query(cleanQuery);
    
    let data: any[] = Array.isArray(result.recordset) ? result.recordset : [];
    let truncated = false;
    if (data.length > options.maxRows) {
      data = data.slice(0, options.maxRows);
      truncated = true;
    }
    
    return {
      success: true,
      rowCount: result.recordset?.length || 0,
      data,
      query: cleanQuery,
      executionTime: `${Date.now()}ms`,
      truncated
    };
  }
}
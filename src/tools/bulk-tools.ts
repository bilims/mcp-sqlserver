import { z } from 'zod';
import { DatabaseConnection } from '../database/connection.js';
import { WhereCondition } from '../database/query-builder.js';
import * as sql from 'mssql';

const WhereConditionSchema = z.object({
  column: z.string().min(1),
  operator: z.enum(['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL']),
  value: z.any().optional(),
});

export const BulkInsertSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  data: z.array(z.record(z.string(), z.any())).min(1, 'At least one record is required'),
  batchSize: z.number().int().min(1).max(1000).optional().default(100),
  timeout: z.number().int().min(1000).max(300000).optional().default(30000),
});

export const BatchUpdateSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  updates: z.array(z.object({
    data: z.record(z.string(), z.any()).refine(
      (data) => Object.keys(data).length > 0,
      { message: 'At least one column must be provided' }
    ),
    where: z.array(WhereConditionSchema).min(1, 'WHERE conditions are required for each update'),
  })).min(1, 'At least one update is required'),
  batchSize: z.number().int().min(1).max(100).optional().default(50),
});

export const BatchDeleteSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  conditions: z.array(z.object({
    where: z.array(WhereConditionSchema).min(1, 'WHERE conditions are required for each delete'),
  })).min(1, 'At least one delete condition is required'),
  batchSize: z.number().int().min(1).max(100).optional().default(50),
});

export const ImportDataSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  data: z.string().min(1, 'Data is required'),
  format: z.enum(['csv', 'json']),
  hasHeaders: z.boolean().optional().default(true), // For CSV
  delimiter: z.string().optional().default(','), // For CSV
  batchSize: z.number().int().min(1).max(1000).optional().default(100),
  skipRows: z.number().int().min(0).optional().default(0),
});

export class BulkTools {
  constructor(private db: DatabaseConnection) {}

  async bulkInsert(params: z.infer<typeof BulkInsertSchema>) {
    const pool = this.db.getPool();
    let totalRowsAffected = 0;
    const errors: string[] = [];
    
    // Process in batches
    for (let i = 0; i < params.data.length; i += params.batchSize) {
      const batch = params.data.slice(i, i + params.batchSize);
      
      try {
        // Build VALUES clause for batch insert
        const columns = Object.keys(batch[0]);
        const values: any[] = [];
        const placeholders: string[] = [];
        
        const request = pool.request();
        
        batch.forEach((row, batchIndex) => {
          const rowPlaceholders: string[] = [];
          columns.forEach((column, columnIndex) => {
            const paramName = `param_${i + batchIndex}_${columnIndex}`;
            request.input(paramName, row[column]);
            rowPlaceholders.push(`@${paramName}`);
          });
          placeholders.push(`(${rowPlaceholders.join(', ')})`);
        });
        
        const query = `INSERT INTO [${params.table}] ([${columns.join('], [')}]) VALUES ${placeholders.join(', ')}`;
        
        // Set timeout
        (request as any).requestTimeout = params.timeout;
        
        const result = await request.query(query + '; SELECT @@ROWCOUNT as rowsAffected');
        totalRowsAffected += result.recordset[0].rowsAffected;
        
      } catch (error: any) {
        errors.push(`Batch ${Math.floor(i / params.batchSize) + 1}: ${error.message}`);
      }
    }
    
    return {
      success: errors.length === 0,
      totalRowsAffected,
      batchCount: Math.ceil(params.data.length / params.batchSize),
      batchSize: params.batchSize,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  async batchUpdate(params: z.infer<typeof BatchUpdateSchema>) {
    const pool = this.db.getPool();
    let totalRowsAffected = 0;
    const errors: string[] = [];
    
    // Process in batches
    for (let i = 0; i < params.updates.length; i += params.batchSize) {
      const batch = params.updates.slice(i, i + params.batchSize);
      
      try {
        const request = pool.request();
        const queries: string[] = [];
        
        batch.forEach((update, batchIndex) => {
          const updateClauses: string[] = [];
          const whereClauses: string[] = [];
          
          // Build SET clause
          Object.entries(update.data).forEach(([column, value], columnIndex) => {
            const paramName = `update_${i + batchIndex}_${columnIndex}`;
            request.input(paramName, value);
            updateClauses.push(`[${column}] = @${paramName}`);
          });
          
          // Build WHERE clause
          update.where.forEach((condition, whereIndex) => {
            const paramName = `where_${i + batchIndex}_${whereIndex}`;
            if (condition.value !== undefined) {
              request.input(paramName, condition.value);
              whereClauses.push(`[${condition.column}] ${condition.operator} @${paramName}`);
            } else {
              whereClauses.push(`[${condition.column}] ${condition.operator}`);
            }
          });
          
          queries.push(`UPDATE [${params.table}] SET ${updateClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`);
        });
        
        const combinedQuery = queries.join('; ') + '; SELECT @@ROWCOUNT as rowsAffected';
        const result = await request.query(combinedQuery);
        
        // Get the last result which contains the row count
        const rowsAffected = Array.isArray(result.recordsets) && result.recordsets.length > 0 
          ? result.recordsets[result.recordsets.length - 1][0]?.rowsAffected || 0
          : result.recordset[0]?.rowsAffected || 0;
          
        totalRowsAffected += rowsAffected;
        
      } catch (error: any) {
        errors.push(`Batch ${Math.floor(i / params.batchSize) + 1}: ${error.message}`);
      }
    }
    
    return {
      success: errors.length === 0,
      totalRowsAffected,
      batchCount: Math.ceil(params.updates.length / params.batchSize),
      batchSize: params.batchSize,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  async batchDelete(params: z.infer<typeof BatchDeleteSchema>) {
    const pool = this.db.getPool();
    let totalRowsAffected = 0;
    const errors: string[] = [];
    
    // Process in batches
    for (let i = 0; i < params.conditions.length; i += params.batchSize) {
      const batch = params.conditions.slice(i, i + params.batchSize);
      
      try {
        const request = pool.request();
        const queries: string[] = [];
        
        batch.forEach((deleteCondition, batchIndex) => {
          const whereClauses: string[] = [];
          
          // Build WHERE clause
          deleteCondition.where.forEach((condition, whereIndex) => {
            const paramName = `where_${i + batchIndex}_${whereIndex}`;
            if (condition.value !== undefined) {
              request.input(paramName, condition.value);
              whereClauses.push(`[${condition.column}] ${condition.operator} @${paramName}`);
            } else {
              whereClauses.push(`[${condition.column}] ${condition.operator}`);
            }
          });
          
          queries.push(`DELETE FROM [${params.table}] WHERE ${whereClauses.join(' AND ')}`);
        });
        
        const combinedQuery = queries.join('; ') + '; SELECT @@ROWCOUNT as rowsAffected';
        const result = await request.query(combinedQuery);
        
        // Get the last result which contains the row count
        const rowsAffected = Array.isArray(result.recordsets) && result.recordsets.length > 0 
          ? result.recordsets[result.recordsets.length - 1][0]?.rowsAffected || 0
          : result.recordset[0]?.rowsAffected || 0;
          
        totalRowsAffected += rowsAffected;
        
      } catch (error: any) {
        errors.push(`Batch ${Math.floor(i / params.batchSize) + 1}: ${error.message}`);
      }
    }
    
    return {
      success: errors.length === 0,
      totalRowsAffected,
      batchCount: Math.ceil(params.conditions.length / params.batchSize),
      batchSize: params.batchSize,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  async importData(params: z.infer<typeof ImportDataSchema>) {
    let parsedData: Record<string, any>[] = [];
    
    try {
      if (params.format === 'json') {
        const jsonData = JSON.parse(params.data);
        parsedData = Array.isArray(jsonData) ? jsonData : [jsonData];
      } else if (params.format === 'csv') {
        parsedData = this.parseCsv(params.data, {
          hasHeaders: params.hasHeaders,
          delimiter: params.delimiter,
          skipRows: params.skipRows,
        });
      }
      
      if (parsedData.length === 0) {
        throw new Error('No data to import');
      }
      
      // Use bulk insert for the parsed data
      const bulkResult = await this.bulkInsert({
        table: params.table,
        data: parsedData,
        batchSize: params.batchSize,
        timeout: 60000, // Longer timeout for imports
      });
      
      return {
        success: bulkResult.success,
        format: params.format,
        recordsProcessed: parsedData.length,
        recordsInserted: bulkResult.totalRowsAffected,
        batchCount: bulkResult.batchCount,
        batchSize: bulkResult.batchSize,
        errors: bulkResult.errors
      };
      
    } catch (error: any) {
      return {
        success: false,
        format: params.format,
        recordsProcessed: 0,
        recordsInserted: 0,
        error: `Import failed: ${error.message}`
      };
    }
  }

  private parseCsv(csvData: string, options: { hasHeaders: boolean; delimiter: string; skipRows: number }): Record<string, any>[] {
    const lines = csvData.split('\n').slice(options.skipRows).map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length === 0) {
      return [];
    }
    
    let headers: string[];
    let dataLines: string[];
    
    if (options.hasHeaders) {
      headers = this.parseCsvLine(lines[0], options.delimiter);
      dataLines = lines.slice(1);
    } else {
      // Generate column names if no headers
      const firstLineColumns = this.parseCsvLine(lines[0], options.delimiter);
      headers = firstLineColumns.map((_, index) => `column_${index + 1}`);
      dataLines = lines;
    }
    
    const result: Record<string, any>[] = [];
    
    for (const line of dataLines) {
      const values = this.parseCsvLine(line, options.delimiter);
      const row: Record<string, any> = {};
      
      headers.forEach((header, index) => {
        let value: any = values[index] || null;
        
        // Try to parse as number
        if (value !== null && !isNaN(value) && !isNaN(parseFloat(value))) {
          value = parseFloat(value);
        }
        // Try to parse as boolean
        else if (value === 'true' || value === 'false') {
          value = value === 'true';
        }
        
        row[header] = value;
      });
      
      result.push(row);
    }
    
    return result;
  }

  private parseCsvLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current);
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    
    result.push(current);
    return result.map(field => field.trim());
  }
}
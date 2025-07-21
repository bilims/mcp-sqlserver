import { z } from 'zod';
import { DatabaseConnection } from '../database/connection.js';
import { QueryOptions } from '../types/config.js';
import * as sql from 'mssql';

const ParameterSchema = z.object({
  name: z.string().min(1),
  value: z.any(),
  type: z.enum(['varchar', 'int', 'bigint', 'decimal', 'bit', 'datetime', 'date', 'text', 'nvarchar', 'float', 'real']).optional(),
  size: z.number().optional(),
  precision: z.number().optional(),
  scale: z.number().optional(),
  output: z.boolean().optional().default(false),
});

export const ExecuteStoredProcedureSchema = z.object({
  procedureName: z.string().min(1, 'Stored procedure name is required'),
  schema: z.string().optional().default('dbo'),
  parameters: z.array(ParameterSchema).optional().default([]),
});

export const GetStoredProceduresSchema = z.object({
  schema: z.string().optional(),
  namePattern: z.string().optional(),
});

export const GetStoredProcedureInfoSchema = z.object({
  procedureName: z.string().min(1, 'Stored procedure name is required'),
  schema: z.string().optional().default('dbo'),
});

export class StoredProcedureTools {
  constructor(private db: DatabaseConnection) {}

  private getSqlType(typeName: string, size?: number, precision?: number, scale?: number): any {
    switch (typeName.toLowerCase()) {
      case 'varchar':
        return sql.VarChar(size || 255);
      case 'nvarchar':
        return sql.NVarChar(size || 255);
      case 'int':
        return sql.Int;
      case 'bigint':
        return sql.BigInt;
      case 'decimal':
        return sql.Decimal(precision || 18, scale || 2);
      case 'bit':
        return sql.Bit;
      case 'datetime':
        return sql.DateTime;
      case 'date':
        return sql.Date;
      case 'text':
        return sql.Text;
      case 'float':
        return sql.Float;
      case 'real':
        return sql.Real;
      default:
        return sql.NVarChar(255); // Default fallback
    }
  }

  async executeStoredProcedure(params: z.infer<typeof ExecuteStoredProcedureSchema>, options: QueryOptions = { timeout: 30000, maxRows: 1000 }) {
    const pool = this.db.getPool();
    const request = pool.request();
    
    // Set request timeout
    (request as any).requestTimeout = options.timeout;
    
    const outputParams: string[] = [];
    
    // Add input parameters
    for (const param of params.parameters) {
      const sqlType = param.type ? this.getSqlType(param.type, param.size, param.precision, param.scale) : sql.NVarChar(255);
      
      if (param.output) {
        request.output(param.name, sqlType);
        outputParams.push(param.name);
      } else {
        request.input(param.name, sqlType, param.value);
      }
    }

    const procedureCall = `${params.schema}.${params.procedureName}`;
    const result = await request.execute(procedureCall);
    
    // Handle multiple result sets
    const resultSets = [];
    if (result.recordsets && Array.isArray(result.recordsets)) {
      for (let i = 0; i < result.recordsets.length; i++) {
        const recordSet = result.recordsets[i];
        let data: any[] = Array.isArray(recordSet) ? recordSet : [];
        let truncated = false;
        
        if (data.length > options.maxRows) {
          data = data.slice(0, options.maxRows);
          truncated = true;
        }
        
        resultSets.push({
          resultSetIndex: i,
          rowCount: Array.isArray(recordSet) ? recordSet.length : 0,
          data,
          truncated
        });
      }
    }
    
    // Handle output parameters
    const outputValues: Record<string, any> = {};
    for (const paramName of outputParams) {
      outputValues[paramName] = request.parameters[paramName]?.value;
    }
    
    return {
      success: true,
      procedureName: procedureCall,
      resultSets,
      outputParameters: outputValues,
      returnValue: result.returnValue,
      executionTime: `${Date.now()}ms`
    };
  }

  async getStoredProcedures(params: z.infer<typeof GetStoredProceduresSchema>) {
    const pool = this.db.getPool();
    const request = pool.request();
    
    let query = `
      SELECT 
        ROUTINE_SCHEMA as [schema],
        ROUTINE_NAME as name,
        ROUTINE_DEFINITION as definition,
        CREATED as created_date,
        LAST_ALTERED as modified_date,
        ROUTINE_TYPE as type
      FROM INFORMATION_SCHEMA.ROUTINES 
      WHERE ROUTINE_TYPE = 'PROCEDURE'
    `;
    
    if (params.schema) {
      query += ` AND ROUTINE_SCHEMA = @schema`;
      request.input('schema', sql.NVarChar(128), params.schema);
    }
    
    if (params.namePattern) {
      query += ` AND ROUTINE_NAME LIKE @namePattern`;
      request.input('namePattern', sql.NVarChar(255), `%${params.namePattern}%`);
    }
    
    query += ` ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME`;
    
    const result = await request.query(query);
    
    return {
      success: true,
      procedureCount: result.recordset.length,
      procedures: result.recordset
    };
  }

  async getStoredProcedureInfo(params: z.infer<typeof GetStoredProcedureInfoSchema>) {
    const pool = this.db.getPool();
    const request = pool.request();
    
    // Get procedure information
    const procedureQuery = `
      SELECT 
        ROUTINE_SCHEMA as [schema],
        ROUTINE_NAME as name,
        ROUTINE_DEFINITION as definition,
        CREATED as created_date,
        LAST_ALTERED as modified_date
      FROM INFORMATION_SCHEMA.ROUTINES 
      WHERE ROUTINE_SCHEMA = @schema AND ROUTINE_NAME = @procedureName
    `;
    
    request.input('schema', sql.NVarChar(128), params.schema);
    request.input('procedureName', sql.NVarChar(128), params.procedureName);
    
    const procedureResult = await request.query(procedureQuery);
    
    if (procedureResult.recordset.length === 0) {
      throw new Error(`Stored procedure '${params.schema}.${params.procedureName}' not found`);
    }
    
    // Get procedure parameters
    const parameterQuery = `
      SELECT 
        PARAMETER_NAME as name,
        DATA_TYPE as data_type,
        CHARACTER_MAXIMUM_LENGTH as max_length,
        NUMERIC_PRECISION as precision,
        NUMERIC_SCALE as scale,
        PARAMETER_MODE as mode,
        ORDINAL_POSITION as position
      FROM INFORMATION_SCHEMA.PARAMETERS 
      WHERE SPECIFIC_SCHEMA = @schema AND SPECIFIC_NAME = @procedureName
      ORDER BY ORDINAL_POSITION
    `;
    
    const request2 = pool.request();
    request2.input('schema', sql.NVarChar(128), params.schema);
    request2.input('procedureName', sql.NVarChar(128), params.procedureName);
    
    const parameterResult = await request2.query(parameterQuery);
    
    return {
      success: true,
      procedure: procedureResult.recordset[0],
      parameters: parameterResult.recordset
    };
  }
}
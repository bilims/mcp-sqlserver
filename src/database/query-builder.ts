import sql from 'mssql';

export interface WhereCondition {
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'NOT IN' | 'IS NULL' | 'IS NOT NULL';
  value?: any;
}

export interface JoinCondition {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  table: string;
  on: string;
}

export interface QueryParams {
  table: string;
  columns?: string[];
  where?: WhereCondition[];
  joins?: JoinCondition[];
  orderBy?: { column: string; direction: 'ASC' | 'DESC' }[];
  limit?: number;
  offset?: number;
}

export class QueryBuilder {
  static buildSelectQuery(params: QueryParams): { query: string; inputs: Record<string, any> } {
    const { table, columns = ['*'], where = [], joins = [], orderBy = [], limit, offset } = params;
    
    let query = `SELECT ${columns.join(', ')} FROM [${table}]`;
    const inputs: Record<string, any> = {};
    let paramCounter = 1;

    if (joins.length > 0) {
      for (const join of joins) {
        query += ` ${join.type} JOIN [${join.table}] ON ${join.on}`;
      }
    }

    if (where.length > 0) {
      const conditions: string[] = [];
      for (const condition of where) {
        const paramName = `param${paramCounter++}`;
        
        switch (condition.operator) {
          case 'IS NULL':
            conditions.push(`[${condition.column}] IS NULL`);
            break;
          case 'IS NOT NULL':
            conditions.push(`[${condition.column}] IS NOT NULL`);
            break;
          case 'IN':
          case 'NOT IN':
            if (Array.isArray(condition.value)) {
              const inParams = condition.value.map((_, index) => {
                const inParamName = `${paramName}_${index}`;
                inputs[inParamName] = condition.value[index];
                return `@${inParamName}`;
              }).join(', ');
              conditions.push(`[${condition.column}] ${condition.operator} (${inParams})`);
            }
            break;
          default:
            conditions.push(`[${condition.column}] ${condition.operator} @${paramName}`);
            inputs[paramName] = condition.value;
        }
      }
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (orderBy.length > 0) {
      const orderClauses = orderBy.map(order => `[${order.column}] ${order.direction}`);
      query += ` ORDER BY ${orderClauses.join(', ')}`;
    }

    if (limit) {
      if (offset) {
        query += ` OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
      } else {
        query = `SELECT TOP ${limit} ${columns.join(', ')} FROM [${table}]` + query.substring(query.indexOf(' FROM') + 6);
      }
    }

    return { query, inputs };
  }

  static buildInsertQuery(table: string, data: Record<string, any>): { query: string; inputs: Record<string, any> } {
    const columns = Object.keys(data);
    const values = columns.map(col => `@${col}`);
    
    const query = `INSERT INTO [${table}] ([${columns.join('], [')}]) VALUES (${values.join(', ')})`;
    
    return { query, inputs: data };
  }

  static buildUpdateQuery(table: string, data: Record<string, any>, where: WhereCondition[]): { query: string; inputs: Record<string, any> } {
    const setColumns = Object.keys(data);
    const setClauses = setColumns.map(col => `[${col}] = @${col}`);
    
    let query = `UPDATE [${table}] SET ${setClauses.join(', ')}`;
    const inputs: Record<string, any> = { ...data };
    
    if (where.length > 0) {
      const conditions: string[] = [];
      let paramCounter = 1000; // Start high to avoid conflicts with data params
      
      for (const condition of where) {
        const paramName = `where_param${paramCounter++}`;
        
        switch (condition.operator) {
          case 'IS NULL':
            conditions.push(`[${condition.column}] IS NULL`);
            break;
          case 'IS NOT NULL':
            conditions.push(`[${condition.column}] IS NOT NULL`);
            break;
          case 'IN':
          case 'NOT IN':
            if (Array.isArray(condition.value)) {
              const inParams = condition.value.map((_, index) => {
                const inParamName = `${paramName}_${index}`;
                inputs[inParamName] = condition.value[index];
                return `@${inParamName}`;
              }).join(', ');
              conditions.push(`[${condition.column}] ${condition.operator} (${inParams})`);
            }
            break;
          default:
            conditions.push(`[${condition.column}] ${condition.operator} @${paramName}`);
            inputs[paramName] = condition.value;
        }
      }
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    return { query, inputs };
  }

  static buildDeleteQuery(table: string, where: WhereCondition[]): { query: string; inputs: Record<string, any> } {
    let query = `DELETE FROM [${table}]`;
    const inputs: Record<string, any> = {};
    
    if (where.length > 0) {
      const conditions: string[] = [];
      let paramCounter = 1;
      
      for (const condition of where) {
        const paramName = `param${paramCounter++}`;
        
        switch (condition.operator) {
          case 'IS NULL':
            conditions.push(`[${condition.column}] IS NULL`);
            break;
          case 'IS NOT NULL':
            conditions.push(`[${condition.column}] IS NOT NULL`);
            break;
          case 'IN':
          case 'NOT IN':
            if (Array.isArray(condition.value)) {
              const inParams = condition.value.map((_, index) => {
                const inParamName = `${paramName}_${index}`;
                inputs[inParamName] = condition.value[index];
                return `@${inParamName}`;
              }).join(', ');
              conditions.push(`[${condition.column}] ${condition.operator} (${inParams})`);
            }
            break;
          default:
            conditions.push(`[${condition.column}] ${condition.operator} @${paramName}`);
            inputs[paramName] = condition.value;
        }
      }
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    return { query, inputs };
  }
}
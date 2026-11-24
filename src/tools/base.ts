import { SqlServerConnection } from '../connection.js';
import { QueryValidator } from '../security.js';
import { ErrorHandler } from '../errors.js';

export abstract class BaseTool {
  protected connection: SqlServerConnection;
  protected maxRows: number;

  constructor(connection: SqlServerConnection, maxRows: number = 1000) {
    this.connection = connection;
    this.maxRows = maxRows;
  }

  protected async executeQuery<T = any>(query: string): Promise<T[]> {
    const validation = QueryValidator.validateQuery(query);
    if (!validation.isValid) {
      throw new Error(`Query validation failed: ${validation.error}`);
    }

    const sanitizedQuery = QueryValidator.sanitizeQuery(query);
    const limitedQuery = QueryValidator.addRowLimit(sanitizedQuery, this.maxRows);

    const result = await this.connection.query<T>(limitedQuery);
    return result.recordset ?? []; // DDL/DML batches return no recordset
  }

  protected async executeSafeQuery<T = any>(query: string): Promise<T[]> {
    try {
      await this.connection.connect();
      return await this.executeQuery<T>(query);
    } catch (error) {
      const mcpError = ErrorHandler.handleSqlServerError(error);
      throw mcpError;
    }
  }

  abstract getName(): string;
  abstract getDescription(): string;
  abstract getInputSchema(): any;
  abstract execute(params: any): Promise<any>;
}
import { z } from 'zod';
import { DatabaseConnection } from '../database/connection.js';
import * as sql from 'mssql';

export const BeginTransactionSchema = z.object({
  isolationLevel: z.enum(['READ_UNCOMMITTED', 'READ_COMMITTED', 'REPEATABLE_READ', 'SNAPSHOT', 'SERIALIZABLE']).optional().default('READ_COMMITTED'),
  transactionName: z.string().optional(),
});

export const CommitTransactionSchema = z.object({
  transactionName: z.string().optional(),
});

export const RollbackTransactionSchema = z.object({
  transactionName: z.string().optional(),
  savepoint: z.string().optional(),
});

export const CreateSavepointSchema = z.object({
  savepointName: z.string().min(1, 'Savepoint name is required'),
});

export class TransactionTools {
  constructor(private db: DatabaseConnection) {}

  private getIsolationLevelSql(level: string): string {
    switch (level) {
      case 'READ_UNCOMMITTED':
        return 'READ UNCOMMITTED';
      case 'READ_COMMITTED':
        return 'READ COMMITTED';
      case 'REPEATABLE_READ':
        return 'REPEATABLE READ';
      case 'SNAPSHOT':
        return 'SNAPSHOT';
      case 'SERIALIZABLE':
        return 'SERIALIZABLE';
      default:
        return 'READ COMMITTED';
    }
  }

  async beginTransaction(params: z.infer<typeof BeginTransactionSchema>) {
    const pool = this.db.getPool();
    const request = pool.request();
    
    let query = `SET TRANSACTION ISOLATION LEVEL ${this.getIsolationLevelSql(params.isolationLevel)}`;
    
    if (params.transactionName) {
      query += `; BEGIN TRANSACTION [${params.transactionName}]`;
    } else {
      query += `; BEGIN TRANSACTION`;
    }
    
    await request.query(query);
    
    return {
      success: true,
      transactionStarted: true,
      isolationLevel: params.isolationLevel,
      transactionName: params.transactionName,
      message: `Transaction started with isolation level: ${params.isolationLevel}`
    };
  }

  async commitTransaction(params: z.infer<typeof CommitTransactionSchema>) {
    const pool = this.db.getPool();
    const request = pool.request();
    
    let query = 'COMMIT TRANSACTION';
    if (params.transactionName) {
      query = `COMMIT TRANSACTION [${params.transactionName}]`;
    }
    
    await request.query(query);
    
    return {
      success: true,
      transactionCommitted: true,
      transactionName: params.transactionName,
      message: 'Transaction committed successfully'
    };
  }

  async rollbackTransaction(params: z.infer<typeof RollbackTransactionSchema>) {
    const pool = this.db.getPool();
    const request = pool.request();
    
    let query = 'ROLLBACK TRANSACTION';
    
    if (params.savepoint) {
      query = `ROLLBACK TRANSACTION [${params.savepoint}]`;
    } else if (params.transactionName) {
      query = `ROLLBACK TRANSACTION [${params.transactionName}]`;
    }
    
    await request.query(query);
    
    return {
      success: true,
      transactionRolledBack: true,
      transactionName: params.transactionName,
      savepoint: params.savepoint,
      message: params.savepoint ? `Rolled back to savepoint: ${params.savepoint}` : 'Transaction rolled back successfully'
    };
  }

  async createSavepoint(params: z.infer<typeof CreateSavepointSchema>) {
    const pool = this.db.getPool();
    const request = pool.request();
    
    const query = `SAVE TRANSACTION [${params.savepointName}]`;
    await request.query(query);
    
    return {
      success: true,
      savepointCreated: true,
      savepointName: params.savepointName,
      message: `Savepoint '${params.savepointName}' created successfully`
    };
  }

  async getTransactionStatus() {
    const pool = this.db.getPool();
    const request = pool.request();
    
    const query = `
      SELECT 
        @@TRANCOUNT as open_transactions,
        CASE 
          WHEN @@TRANCOUNT > 0 THEN 'Active'
          ELSE 'None'
        END as transaction_status,
        CASE 
          WHEN @@OPTIONS & 1 = 1 THEN 'ON'
          ELSE 'OFF'
        END as disable_def_cnst_chk,
        CASE 
          WHEN @@OPTIONS & 2 = 2 THEN 'ON'
          ELSE 'OFF'
        END as implicit_transactions,
        CASE 
          WHEN @@OPTIONS & 4 = 4 THEN 'ON'
          ELSE 'OFF'
        END as cursor_close_on_commit,
        CASE 
          WHEN @@OPTIONS & 8 = 8 THEN 'ON'
          ELSE 'OFF'
        END as ansi_warnings,
        CASE 
          WHEN @@OPTIONS & 16 = 16 THEN 'ON'
          ELSE 'OFF'
        END as ansi_padding,
        CASE 
          WHEN @@OPTIONS & 32 = 32 THEN 'ON'
          ELSE 'OFF'
        END as ansi_nulls,
        CASE 
          WHEN @@OPTIONS & 64 = 64 THEN 'ON'
          ELSE 'OFF'
        END as arithabort,
        CASE 
          WHEN @@OPTIONS & 128 = 128 THEN 'ON'
          ELSE 'OFF'
        END as arithignore,
        CASE 
          WHEN @@OPTIONS & 256 = 256 THEN 'ON'
          ELSE 'OFF'
        END as quoted_identifier
    `;
    
    const result = await request.query(query);
    
    return {
      success: true,
      transactionInfo: result.recordset[0]
    };
  }
}
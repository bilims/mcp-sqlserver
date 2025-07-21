import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { DatabaseConnection } from './database/connection.js';
import { CrudTools, SelectToolSchema, InsertToolSchema, UpdateToolSchema, DeleteToolSchema, CustomQuerySchema } from './tools/crud-tools.js';
import { SchemaTools, GetTablesSchema, GetColumnsSchema, GetIndexesSchema, GetForeignKeysSchema } from './tools/schema-tools.js';
import { StoredProcedureTools, ExecuteStoredProcedureSchema, GetStoredProceduresSchema, GetStoredProcedureInfoSchema } from './tools/stored-procedure-tools.js';
import { TransactionTools, BeginTransactionSchema, CommitTransactionSchema, RollbackTransactionSchema, CreateSavepointSchema } from './tools/transaction-tools.js';
import { BulkTools, BulkInsertSchema, BatchUpdateSchema, BatchDeleteSchema, ImportDataSchema } from './tools/bulk-tools.js';
import { loadDatabaseConfig } from './config/database.js';
import { QueryOptionsSchema } from './types/config.js';
import { zodToJsonSchema } from './utils/schema-converter.js';

export class SqlServerMcpServer {
  private server: McpServer;
  private db: DatabaseConnection;
  private crudTools: CrudTools;
  private schemaTools: SchemaTools;
  private storedProcedureTools: StoredProcedureTools;
  private transactionTools: TransactionTools;
  private bulkTools: BulkTools;

  constructor() {
    this.server = new McpServer({
      name: 'mcp-sqlserver',
      version: '1.1.0',
      description: 'MCP Server for Microsoft SQL Server with CRUD operations and schema introspection'
    });

    const config = loadDatabaseConfig();
    this.db = new DatabaseConnection(config);
    this.crudTools = new CrudTools(this.db);
    this.schemaTools = new SchemaTools(this.db);
    this.storedProcedureTools = new StoredProcedureTools(this.db);
    this.transactionTools = new TransactionTools(this.db);
    this.bulkTools = new BulkTools(this.db);

    this.setupTools();
    this.setupErrorHandling();
  }

  private setupTools() {
    // SELECT tool
    this.server.registerTool(
      'sql_select',
      {
        title: 'Execute SELECT Query',
        description: 'Execute a SELECT query with optional WHERE conditions, JOINs, and ordering',
        inputSchema: zodToJsonSchema(SelectToolSchema)
      },
      async (args: any) => {
        try {
          const params = SelectToolSchema.parse(args);
          const result = await this.crudTools.executeSelect(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_select');
        }
      }
    );

    // INSERT tool
    this.server.registerTool(
      'sql_insert',
      {
        title: 'Execute INSERT Query',
        description: 'Insert new records into a table',
        inputSchema: zodToJsonSchema(InsertToolSchema)
      },
      async (args: any) => {
        try {
          const params = InsertToolSchema.parse(args);
          const result = await this.crudTools.executeInsert(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_insert');
        }
      }
    );

    // UPDATE tool
    this.server.registerTool(
      'sql_update',
      {
        title: 'Execute UPDATE Query',
        description: 'Update existing records in a table',
        inputSchema: zodToJsonSchema(UpdateToolSchema)
      },
      async (args: any) => {
        try {
          const params = UpdateToolSchema.parse(args);
          const result = await this.crudTools.executeUpdate(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_update');
        }
      }
    );

    // DELETE tool
    this.server.registerTool(
      'sql_delete',
      {
        title: 'Execute DELETE Query',
        description: 'Delete records from a table',
        inputSchema: zodToJsonSchema(DeleteToolSchema)
      },
      async (args: any) => {
        try {
          const params = DeleteToolSchema.parse(args);
          const result = await this.crudTools.executeDelete(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_delete');
        }
      }
    );

    // Custom Query tool
    this.server.registerTool(
      'sql_query',
      {
        title: 'Execute Custom SQL Query',
        description: 'Execute a custom SQL query (SELECT statements only for security)',
        inputSchema: zodToJsonSchema(CustomQuerySchema)
      },
      async (args: any) => {
        try {
          const params = CustomQuerySchema.parse(args);
          const result = await this.crudTools.executeCustomQuery(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_query');
        }
      }
    );

    // Schema introspection tools
    this.server.registerTool(
      'sql_get_tables',
      {
        title: 'Get Database Tables',
        description: 'List all tables in the database or specific schema',
        inputSchema: zodToJsonSchema(GetTablesSchema)
      },
      async (args: any) => {
        try {
          const params = GetTablesSchema.parse(args);
          const result = await this.schemaTools.getTables(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_get_tables');
        }
      }
    );

    this.server.registerTool(
      'sql_get_columns',
      {
        title: 'Get Table Columns',
        description: 'Get detailed information about columns in a specific table',
        inputSchema: zodToJsonSchema(GetColumnsSchema)
      },
      async (args: any) => {
        try {
          const params = GetColumnsSchema.parse(args);
          const result = await this.schemaTools.getColumns(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_get_columns');
        }
      }
    );

    this.server.registerTool(
      'sql_get_table_structure',
      {
        title: 'Get Complete Table Structure',
        description: 'Get complete structure of a table including columns, indexes, and foreign keys',
        inputSchema: zodToJsonSchema(GetColumnsSchema)
      },
      async (args: any) => {
        try {
          const params = GetColumnsSchema.parse(args);
          const result = await this.schemaTools.getTableStructure(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_get_table_structure');
        }
      }
    );

    this.server.registerTool(
      'sql_get_schemas',
      {
        title: 'Get Database Schemas',
        description: 'List all available schemas in the database',
        inputSchema: {}
      },
      async () => {
        try {
          const result = await this.schemaTools.getSchemas();
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_get_schemas');
        }
      }
    );

    // Connection test tool
    this.server.registerTool(
      'sql_test_connection',
      {
        title: 'Test Database Connection',
        description: 'Test the database connection and get server information',
        inputSchema: {}
      },
      async () => {
        try {
          const isConnected = await this.db.testConnection();
          if (isConnected) {
            const serverInfo = await this.db.getServerInfo();
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  connected: true,
                  serverInfo
                }, null, 2)
              }]
            };
          } else {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  connected: false,
                  error: 'Connection test failed'
                }, null, 2)
              }]
            };
          }
        } catch (error) {
          return this.handleError(error, 'sql_test_connection');
        }
      }
    );

    // Stored Procedure tools
    this.server.registerTool(
      'sql_execute_stored_procedure',
      {
        title: 'Execute Stored Procedure',
        description: 'Execute a stored procedure with parameters and handle multiple result sets',
        inputSchema: zodToJsonSchema(ExecuteStoredProcedureSchema)
      },
      async (args: any) => {
        try {
          const params = ExecuteStoredProcedureSchema.parse(args);
          const result = await this.storedProcedureTools.executeStoredProcedure(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_execute_stored_procedure');
        }
      }
    );

    this.server.registerTool(
      'sql_get_stored_procedures',
      {
        title: 'Get Stored Procedures',
        description: 'List all stored procedures in the database or specific schema',
        inputSchema: zodToJsonSchema(GetStoredProceduresSchema)
      },
      async (args: any) => {
        try {
          const params = GetStoredProceduresSchema.parse(args);
          const result = await this.storedProcedureTools.getStoredProcedures(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_get_stored_procedures');
        }
      }
    );

    this.server.registerTool(
      'sql_get_stored_procedure_info',
      {
        title: 'Get Stored Procedure Info',
        description: 'Get detailed information about a specific stored procedure including parameters',
        inputSchema: zodToJsonSchema(GetStoredProcedureInfoSchema)
      },
      async (args: any) => {
        try {
          const params = GetStoredProcedureInfoSchema.parse(args);
          const result = await this.storedProcedureTools.getStoredProcedureInfo(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_get_stored_procedure_info');
        }
      }
    );

    // Transaction Management tools
    this.server.registerTool(
      'sql_begin_transaction',
      {
        title: 'Begin Transaction',
        description: 'Start a new database transaction with optional isolation level',
        inputSchema: zodToJsonSchema(BeginTransactionSchema)
      },
      async (args: any) => {
        try {
          const params = BeginTransactionSchema.parse(args);
          const result = await this.transactionTools.beginTransaction(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_begin_transaction');
        }
      }
    );

    this.server.registerTool(
      'sql_commit_transaction',
      {
        title: 'Commit Transaction',
        description: 'Commit the current database transaction',
        inputSchema: zodToJsonSchema(CommitTransactionSchema)
      },
      async (args: any) => {
        try {
          const params = CommitTransactionSchema.parse(args);
          const result = await this.transactionTools.commitTransaction(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_commit_transaction');
        }
      }
    );

    this.server.registerTool(
      'sql_rollback_transaction',
      {
        title: 'Rollback Transaction',
        description: 'Rollback the current database transaction or to a savepoint',
        inputSchema: zodToJsonSchema(RollbackTransactionSchema)
      },
      async (args: any) => {
        try {
          const params = RollbackTransactionSchema.parse(args);
          const result = await this.transactionTools.rollbackTransaction(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_rollback_transaction');
        }
      }
    );

    this.server.registerTool(
      'sql_create_savepoint',
      {
        title: 'Create Savepoint',
        description: 'Create a savepoint within the current transaction',
        inputSchema: zodToJsonSchema(CreateSavepointSchema)
      },
      async (args: any) => {
        try {
          const params = CreateSavepointSchema.parse(args);
          const result = await this.transactionTools.createSavepoint(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_create_savepoint');
        }
      }
    );

    this.server.registerTool(
      'sql_get_transaction_status',
      {
        title: 'Get Transaction Status',
        description: 'Get current transaction status and connection options',
        inputSchema: {}
      },
      async () => {
        try {
          const result = await this.transactionTools.getTransactionStatus();
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_get_transaction_status');
        }
      }
    );

    // Bulk Operations tools
    this.server.registerTool(
      'sql_bulk_insert',
      {
        title: 'Bulk Insert',
        description: 'Insert multiple records in batches for better performance',
        inputSchema: zodToJsonSchema(BulkInsertSchema)
      },
      async (args: any) => {
        try {
          const params = BulkInsertSchema.parse(args);
          const result = await this.bulkTools.bulkInsert(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_bulk_insert');
        }
      }
    );

    this.server.registerTool(
      'sql_batch_update',
      {
        title: 'Batch Update',
        description: 'Update multiple records in batches with different conditions',
        inputSchema: zodToJsonSchema(BatchUpdateSchema)
      },
      async (args: any) => {
        try {
          const params = BatchUpdateSchema.parse(args);
          const result = await this.bulkTools.batchUpdate(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_batch_update');
        }
      }
    );

    this.server.registerTool(
      'sql_batch_delete',
      {
        title: 'Batch Delete',
        description: 'Delete multiple records in batches with different conditions',
        inputSchema: zodToJsonSchema(BatchDeleteSchema)
      },
      async (args: any) => {
        try {
          const params = BatchDeleteSchema.parse(args);
          const result = await this.bulkTools.batchDelete(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_batch_delete');
        }
      }
    );

    this.server.registerTool(
      'sql_import_data',
      {
        title: 'Import Data',
        description: 'Import data from CSV or JSON format into a table',
        inputSchema: zodToJsonSchema(ImportDataSchema)
      },
      async (args: any) => {
        try {
          const params = ImportDataSchema.parse(args);
          const result = await this.bulkTools.importData(params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return this.handleError(error, 'sql_import_data');
        }
      }
    );
  }

  private setupErrorHandling() {
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.cleanup();
      process.exit(0);
    });

    // Handle unhandled errors
    process.on('uncaughtException', async (error) => {
      // Log to stderr to avoid contaminating stdio transport
      process.stderr.write(`Uncaught exception: ${error.message}\n`);
      await this.cleanup();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      // Log to stderr to avoid contaminating stdio transport
      process.stderr.write(`Unhandled rejection: ${reason}\n`);
      await this.cleanup();
      process.exit(1);
    });

    // Handle EPIPE errors
    process.on('SIGPIPE', () => {
      // Silent - don't log anything to avoid pipe issues
    });
  }

  private handleError(error: any, toolName: string) {
    // Log to stderr to avoid contaminating stdio transport
    process.stderr.write(`Error in ${toolName}: ${error.message || error}\n`);
    
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: false,
          error: errorMessage,
          tool: toolName
        }, null, 2)
      }],
      isError: true
    };
  }

  async start() {
    try {
      await this.db.connect();
      
      const transport = new StdioServerTransport();
      
      // Handle transport errors silently to avoid contaminating stdio
      transport.onclose = () => {
        // Silent
      };
      
      transport.onerror = (error) => {
        process.stderr.write(`Transport error: ${error.message || error}\n`);
      };
      
      await this.server.connect(transport);
      // Don't log to stdout - it contaminates the stdio transport
    } catch (error) {
      process.stderr.write(`Failed to start server: ${error}\n`);
      await this.cleanup();
      process.exit(1);
    }
  }

  async cleanup() {
    try {
      await this.db.disconnect();
      // Silent cleanup - don't contaminate stdio
    } catch (error) {
      process.stderr.write(`Error during cleanup: ${error}\n`);
    }
  }
}
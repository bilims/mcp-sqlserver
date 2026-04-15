#!/usr/bin/env node

// MCP SQL Server - Production version

async function runServer() {
  try {
    // Dynamic imports to support execution from any working directory
    const { handleCliArgs } = await import('./cli.js');
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    const {
      CallToolRequestSchema,
      ListToolsRequestSchema,
    } = await import('@modelcontextprotocol/sdk/types.js');
    const { SqlServerConnection } = await import('./connection.js');
    const { ConnectionConfigSchema } = await import('./types.js');
    const {
      ListDatabasesTool,
      ListTablesTool,
      ListViewsTool,
      DescribeTableTool,
      ExecuteQueryTool,
      GetForeignKeysTool,
      GetServerInfoTool,
      GetTableStatsTool,
      TestConnectionTool,
    } = await import('./tools/index.js');
    const { ErrorHandler } = await import('./errors.js');

    class SqlServerMCPServer {
      private server: typeof Server.prototype;
      private connection!: typeof SqlServerConnection.prototype;
      private tools: Map<string, any> = new Map();

      constructor() {
        this.server = new Server(
          {
            name: 'mcp-sqlserver',
            version: '2.0.3',
          },
          {
            capabilities: {
              tools: {},
            },
          }
        );

        this.setupErrorHandling();
        this.setupRequestHandlers();
      }

      private setupErrorHandling() {
        this.server.onerror = (error: Error) => {
          console.error('[MCP Error]', error);
        };

        process.on('SIGINT', async () => {
          await this.cleanup();
          process.exit(0);
        });

        process.on('SIGTERM', async () => {
          await this.cleanup();
          process.exit(0);
        });
      }

      private async cleanup() {
        if (this.connection) {
          await this.connection.disconnect();
        }
      }

      private setupRequestHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
          return {
            tools: Array.from(this.tools.values()).map(tool => ({
              name: tool.getName(),
              description: tool.getDescription(),
              inputSchema: tool.getInputSchema(),
            })),
          };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
          const { name, arguments: args } = request.params;
          
          if (!this.tools.has(name)) {
            throw new Error(`Unknown tool: ${name}`);
          }

          const tool = this.tools.get(name);
          
          try {
            const result = await tool.execute(args || {});
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error) {
            const mcpError = ErrorHandler.handleSqlServerError(error);
            const userError = ErrorHandler.formatErrorForUser(mcpError);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: userError.error,
                    code: userError.code,
                    suggestions: userError.suggestions,
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }
        });
      }

      private initializeTools(maxRows: number) {
        const toolClasses = [
          TestConnectionTool,
          ListDatabasesTool,
          ListTablesTool,
          ListViewsTool,
          DescribeTableTool,
          ExecuteQueryTool,
          GetForeignKeysTool,
          GetServerInfoTool,
          GetTableStatsTool,
        ];

        for (const ToolClass of toolClasses) {
          const tool = new ToolClass(this.connection, maxRows);
          this.tools.set(tool.getName(), tool);
        }
      }

      async initialize(config: any) {
        try {
          this.connection = new SqlServerConnection(config);
          
          // Don't connect immediately in MCP mode - defer connection until first tool use
          // This prevents the server from failing startup if SQL Server is temporarily unavailable
          console.error(`MCP SQL Server initialized for ${config.server}:${config.port || 1433}`);
          console.error(`Database: ${config.database || 'default'}`);
          
          this.initializeTools(config.maxRows || 1000);
        } catch (error) {
          console.error(`Initialization failed:`, error);
          throw error;
        }
      }

      async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('MCP SQL Server running on stdio');
      }
    }

    async function main() {
      // Handle CLI arguments and help
      if (!handleCliArgs()) {
        return;
      }

      // Read configuration from environment variables
      const config = {
        server: process.env.SQLSERVER_HOST || 'localhost',
        database: process.env.SQLSERVER_DATABASE,
        user: process.env.SQLSERVER_USER || '',
        password: process.env.SQLSERVER_PASSWORD || '',
        port: parseInt(process.env.SQLSERVER_PORT || '1433'),
        encrypt: process.env.SQLSERVER_ENCRYPT !== 'false',
        trustServerCertificate: process.env.SQLSERVER_TRUST_CERT !== 'false',
        connectionTimeout: parseInt(process.env.SQLSERVER_CONNECTION_TIMEOUT || '30000'),
        requestTimeout: parseInt(process.env.SQLSERVER_REQUEST_TIMEOUT || '60000'),
        maxRows: parseInt(process.env.SQLSERVER_MAX_ROWS || '1000'),
      };

      // Validate configuration
      try {
        ConnectionConfigSchema.parse(config);
      } catch (error) {
        console.error('Invalid configuration:', error);
        process.exit(1);
      }

      if (!config.user || !config.password) {
        console.error('Error: SQLSERVER_USER and SQLSERVER_PASSWORD environment variables are required');
        process.exit(1);
      }

      const server = new SqlServerMCPServer();
      
      try {
        await server.initialize(config);
        await server.run();
      } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
      }
    }

    await main();
    
  } catch (error) {
    console.error('Failed to start MCP server:', (error as Error).message);
    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
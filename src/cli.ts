#!/usr/bin/env node

import { ConnectionConfigSchema } from './types.js';
import { SqlServerConnection } from './connection.js';

function showHelp() {
  console.log(`
MCP SQL Server - A read-only Model Context Protocol server for Microsoft SQL Server

USAGE:
  mcp-sqlserver [options]

ENVIRONMENT VARIABLES:
  SQLSERVER_HOST      SQL Server hostname (required)
  SQLSERVER_USER      Database username (required)
  SQLSERVER_PASSWORD  Database password (required)
  SQLSERVER_DATABASE  Database name (optional, default: master)
  SQLSERVER_PORT      Port number (optional, default: 1433)
  SQLSERVER_ENCRYPT   Enable encryption (optional, default: true)
  SQLSERVER_TRUST_CERT Trust server certificate (optional, default: false)

OPTIONS:
  --help, -h          Show this help message
  --version, -v       Show version number
  --test-connection   Test SQL Server connection and exit

EXAMPLES:
  # Set environment variables and run
  export SQLSERVER_HOST="your-server.database.windows.net"
  export SQLSERVER_USER="your-username"
  export SQLSERVER_PASSWORD="your-password"
  mcp-sqlserver

  # Test connection
  mcp-sqlserver --test-connection

  # Using Claude Desktop (add to claude_desktop_config.json):
  {
    "mcpServers": {
      "sqlserver": {
        "command": "mcp-sqlserver",
        "env": {
          "SQLSERVER_HOST": "your-server",
          "SQLSERVER_USER": "your-username",
          "SQLSERVER_PASSWORD": "your-password"
        }
      }
    }
  }

AVAILABLE TOOLS:
  test_connection     - Test SQL Server connection and permissions
  list_databases      - List all databases on the server
  list_tables         - List tables in a database or schema
  list_views          - List views in a database or schema
  describe_table      - Get detailed table schema
  execute_query       - Execute read-only SELECT queries
  get_foreign_keys    - Get foreign key relationships
  get_server_info     - Get SQL Server version and edition info
  get_table_stats     - Get table statistics and row counts

SECURITY:
  - Only read-only operations are allowed
  - SQL injection protection enabled
  - Query validation and sanitization
  - Row limits and timeouts enforced

For more information, visit: https://github.com/bilims/mcp-sqlserver
`);
}

function showVersion() {
  // Read version from package.json
  console.log('2.0.3');
}

async function testConnection(): Promise<void> {
  const config = {
    server: process.env.SQLSERVER_HOST || 'localhost',
    user: process.env.SQLSERVER_USER || '',
    password: process.env.SQLSERVER_PASSWORD || '',
    database: process.env.SQLSERVER_DATABASE,
    port: parseInt(process.env.SQLSERVER_PORT || '1433'),
    encrypt: process.env.SQLSERVER_ENCRYPT !== 'false',
    trustServerCertificate: process.env.SQLSERVER_TRUST_CERT !== 'false',
    connectionTimeout: parseInt(process.env.SQLSERVER_CONNECTION_TIMEOUT || '15000'),
    requestTimeout: parseInt(process.env.SQLSERVER_REQUEST_TIMEOUT || '30000'),
    maxRows: parseInt(process.env.SQLSERVER_MAX_ROWS || '1000'),
  };

  // Validate config
  try {
    ConnectionConfigSchema.parse(config);
  } catch (error) {
    console.error('❌ Configuration error:');
    console.error(error);
    process.exit(1);
  }

  if (!config.user || !config.password) {
    console.error('❌ Missing credentials:');
    console.error('   SQLSERVER_USER and SQLSERVER_PASSWORD are required');
    process.exit(1);
  }

  console.log(`\n🔍 Testing connection to ${config.server}:${config.port}/${config.database || 'default'}`);
  console.log(`   Encryption: ${config.encrypt ? 'enabled' : 'disabled'}`);
  console.log(`   Trust Certificate: ${config.trustServerCertificate ? 'yes' : 'no'}`);
  console.log('');

  const startTime = Date.now();
  const connection = new SqlServerConnection(config);

  try {
    await connection.connect();
    const connectionTime = Date.now() - startTime;

    console.log('✅ Connection successful!');
    console.log(`   Connection time: ${connectionTime}ms`);
    console.log(`   Connected: ${connection.isConnected()}`);

    // Try to get server info
    try {
      const result = await connection.query(`
        SELECT
          @@SERVERNAME as serverName,
          @@VERSION as version,
          DB_NAME() as currentDatabase
      `);

      if (result.recordset.length > 0) {
        const info = result.recordset[0];
        console.log(`\n📋 Server Info:`);
        console.log(`   Server: ${info.serverName}`);
        console.log(`   Database: ${info.currentDatabase}`);
        // Version is multi-line, just show first line
        const versionLine = info.version.split('\n')[0];
        console.log(`   Version: ${versionLine}`);
      }
    } catch (queryError) {
      // Server info is nice-to-have, don't fail on this
    }

    await connection.disconnect();
    process.exit(0);

  } catch (error) {
    const connectionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('❌ Connection failed!');
    console.error(`   Error: ${errorMessage}`);
    console.error(`   Time: ${connectionTime}ms`);

    // Provide helpful suggestions based on error
    const suggestion = getConnectionSuggestion(errorMessage);
    if (suggestion) {
      console.error(`\n💡 ${suggestion}`);
    }

    // Show environment info for debugging
    console.error(`\n🔧 Environment:`);
    console.error(`   Host: ${config.server}:${config.port}`);
    console.error(`   Database: ${config.database || '(default)'}`);
    console.error(`   Encrypt: ${config.encrypt}`);
    console.error(`   Trust Cert: ${config.trustServerCertificate}`);

    await connection.disconnect().catch(() => {});
    process.exit(1);
  }
}

function getConnectionSuggestion(errorMessage: string): string | null {
  const msg = errorMessage.toLowerCase();

  if (msg.includes('login failed') || msg.includes('18456')) {
    return 'Check your username and password. SQL Server authentication failed.';
  }
  if (msg.includes('enotfound') || msg.includes('server was not found') || msg.includes('could not be located') || msg.includes('name or service not known')) {
    return 'Check your server hostname. The SQL Server instance could not be found.';
  }
  if (msg.includes('timeout') || msg.includes('-2') || msg.includes('timed out')) {
    return 'Connection timed out. Check if the server is reachable and the port is correct.';
  }
  if (msg.includes('ssl') || msg.includes('certificate') || msg.includes('tls') || msg.includes('ssl_ctx')) {
    return 'SSL/Certificate error. Try setting SQLSERVER_TRUST_CERT=true if using a self-signed cert.';
  }
  if (msg.includes('encrypt') || msg.includes('handshake') || msg.includes('ssl_negotiate')) {
    return 'Encryption handshake failed. Try SQLSERVER_ENCRYPT=false or check certificate configuration.';
  }
  if (msg.includes('port') || msg.includes('connection refused')) {
    return 'Connection refused. Check your port number and ensure SQL Server is running.';
  }
  if (msg.includes('named pipes')) {
    return 'Named pipes error. Try using TCP/IP connection instead.';
  }
  if (msg.includes('permission') || msg.includes('access') || msg.includes('denied')) {
    return 'Permission denied. Your user may not have access to this database.';
  }

  return null;
}

function validateEnvironment(): boolean {
  const required = ['SQLSERVER_HOST', 'SQLSERVER_USER', 'SQLSERVER_PASSWORD'];
  const missing = required.filter(env => !process.env[env]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(env => {
      console.error(`   ${env}`);
    });
    console.error('\n💡 Set these environment variables or see --help for examples.');
    return false;
  }

  // Validate configuration
  try {
    const config = {
      server: process.env.SQLSERVER_HOST!,
      user: process.env.SQLSERVER_USER!,
      password: process.env.SQLSERVER_PASSWORD!,
      database: process.env.SQLSERVER_DATABASE,
      port: parseInt(process.env.SQLSERVER_PORT || '1433'),
      encrypt: process.env.SQLSERVER_ENCRYPT !== 'false',
      trustServerCertificate: process.env.SQLSERVER_TRUST_CERT !== 'false',
    };

    ConnectionConfigSchema.parse(config);
    return true;
  } catch (error) {
    console.error('❌ Invalid configuration:', error);
    return false;
  }
}

export function handleCliArgs(): boolean {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return false;
  }

  if (args.includes('--version') || args.includes('-v')) {
    showVersion();
    return false;
  }

  if (args.includes('--test-connection') || args.includes('-t')) {
    testConnection();
    return false; // testConnection exits on its own
  }

  if (!validateEnvironment()) {
    process.exit(1);
  }

  return true;
}
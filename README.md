# MCP SQL Server

A read-only Model Context Protocol (MCP) server for Microsoft SQL Server that enables AI agents to safely explore and query SQL Server databases.

## Quick Start

### Step 1: Install the Package

```bash
# Global installation (recommended)
npm install -g @bilims/mcp-sqlserver

# Verify installation
mcp-sqlserver --version
```

### Step 2: Configure Your SQL Server Connection

Choose your SQL Server type and follow the configuration:

#### Azure SQL Database
```bash
export SQLSERVER_HOST="your-server.database.windows.net"
export SQLSERVER_USER="your-username"
export SQLSERVER_PASSWORD="your-password"
export SQLSERVER_DATABASE="your-database"
export SQLSERVER_ENCRYPT="true"
export SQLSERVER_TRUST_CERT="false"
```

#### On-Premises SQL Server
```bash
export SQLSERVER_HOST="your-sql-server.company.com"
export SQLSERVER_USER="your-username"
export SQLSERVER_PASSWORD="your-password"
export SQLSERVER_DATABASE="your-database"
export SQLSERVER_ENCRYPT="true"
export SQLSERVER_TRUST_CERT="true"  # For self-signed certificates
```

#### Local SQL Server Express
```bash
export SQLSERVER_HOST="localhost\\SQLEXPRESS"
export SQLSERVER_USER="sa"
export SQLSERVER_PASSWORD="your-password"
export SQLSERVER_DATABASE="master"
export SQLSERVER_ENCRYPT="false"
export SQLSERVER_TRUST_CERT="true"
```

### Step 3: Test the Connection

```bash
# Test your configuration
mcp-sqlserver --help

# Quick connection test (press Ctrl+C to exit)
mcp-sqlserver
```

### Step 4: Add to Claude Desktop

1. **Find your Claude Desktop config file:**
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. **Add the MCP server configuration:**
```json
{
  "mcpServers": {
    "sqlserver": {
      "command": "mcp-sqlserver",
      "env": {
        "SQLSERVER_HOST": "your-server.database.windows.net",
        "SQLSERVER_USER": "your-username",
        "SQLSERVER_PASSWORD": "your-password",
        "SQLSERVER_DATABASE": "your-database",
        "SQLSERVER_ENCRYPT": "true",
        "SQLSERVER_TRUST_CERT": "false"
      }
    }
  }
}
```

3. **Restart Claude Desktop**

### Step 5: Start Exploring!

Try these commands in Claude Desktop:
- `"Test the SQL Server connection"`
- `"List all databases on the server"`
- `"Show me the tables in [database name]"`
- `"Describe the structure of the Users table"`
- `"Show me foreign key relationships"`

## Features

- **🔒 Read-only operations**: Only SELECT queries allowed, with comprehensive security validation
- **🗄️ Schema discovery**: Explore databases, tables, views, relationships, and metadata  
- **📊 Data exploration**: Execute safe queries with built-in limits and timeouts
- **🔐 Enterprise-ready**: Encrypted connections with certificate trust for production environments
- **🛡️ Security-first**: Query validation, SQL injection protection, and access controls

## Available Tools

### Schema Discovery
- `list_databases` - List all databases on the SQL Server instance
- `list_tables` - List tables in a database or schema
- `list_views` - List views in a database or schema
- `describe_table` - Get detailed table schema including columns, data types, and constraints

### Relationship Analysis
- `get_foreign_keys` - Get foreign key relationships for tables
- `get_table_stats` - Get table statistics including row counts and size information

### Data Exploration  
- `execute_query` - Execute read-only SELECT queries with safety validation
- `get_server_info` - Get SQL Server version, edition, and configuration details

## Common Commands for Claude Desktop

Once your MCP server is configured, try these natural language commands:

### Getting Started Commands
```
"Test the SQL Server connection"
"Show me server information"
"List all databases on this server"
"What tables are in the [database name] database?"
```

### Database Exploration
```
"Describe the structure of the Users table"
"Show me foreign key relationships in this database"
"What are the largest tables by row count?"
"Give me a sample of data from the Orders table"
```

### Advanced Analysis
```
"Help me understand the relationship between Orders and Customers"
"Show me all lookup tables in this database"
"What columns contain date/time information?"
"Find tables that might contain user authentication data"
```

### Custom Queries
```
"Run this query: SELECT TOP 10 * FROM Products WHERE Price > 100"
"Show me all customers created in the last 30 days"
"What are the different product categories in the database?"
```

## Installation

```bash
npm install
npm run build
```

## Configuration

The server is configured using environment variables:

### Required
- `SQLSERVER_USER` - SQL Server username
- `SQLSERVER_PASSWORD` - SQL Server password

### Optional
- `SQLSERVER_HOST` - Server hostname (default: localhost)
- `SQLSERVER_DATABASE` - Default database name
- `SQLSERVER_PORT` - Port number (default: 1433)
- `SQLSERVER_ENCRYPT` - Enable encryption (default: true)
- `SQLSERVER_TRUST_CERT` - Trust server certificate (default: true)
- `SQLSERVER_CONNECTION_TIMEOUT` - Connection timeout in ms (default: 30000)
- `SQLSERVER_REQUEST_TIMEOUT` - Request timeout in ms (default: 60000)
- `SQLSERVER_MAX_ROWS` - Maximum rows per query (default: 1000)

## Usage

### Environment Variables
```bash
export SQLSERVER_HOST="your-server.database.windows.net"
export SQLSERVER_USER="your-username"
export SQLSERVER_PASSWORD="your-password"
export SQLSERVER_DATABASE="your-database"
export SQLSERVER_ENCRYPT="true"
export SQLSERVER_TRUST_CERT="true"
```

### Running the Server
```bash
npm start
```

## Installation Options

### Option 1: Global Installation (Recommended)

```bash
npm install -g @bilims/mcp-sqlserver
```

### Option 2: Local Installation

```bash
npm install @bilims/mcp-sqlserver
npx mcp-sqlserver
```

### Option 3: Run with npx (No Installation)

```bash
npx @bilims/mcp-sqlserver
```

## Integration Examples

### Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sqlserver": {
      "command": "mcp-sqlserver",
      "env": {
        "SQLSERVER_HOST": "your-server.database.windows.net",
        "SQLSERVER_USER": "your-username",
        "SQLSERVER_PASSWORD": "your-password",
        "SQLSERVER_DATABASE": "your-database"
      }
    }
  }
}
```

### Claude Code CLI

#### Windows

Add the following to `%USERPROFILE%\.claude.json`:

```json
{
  "mcpServers": {
    "sqlserver": {
      "command": "mcp-sqlserver",
      "env": {
        "SQLSERVER_HOST": "your-server",
        "SQLSERVER_USER": "your-username",
        "SQLSERVER_PASSWORD": "your-password",
        "SQLSERVER_DATABASE": "your-database",
        "SQLSERVER_PORT": "1433",
        "SQLSERVER_ENCRYPT": "true",
        "SQLSERVER_TRUST_CERT": "false"
      }
    }
  }
}
```

#### macOS/Linux

Add the server using the Claude Code CLI:

```bash
# Set environment variables
export SQLSERVER_HOST="your-server"
export SQLSERVER_USER="your-username"
export SQLSERVER_PASSWORD="your-password"

# Use with Claude Code
claude mcp add sqlserver mcp-sqlserver
```

Or configure via `~/.claude.json`:

```json
{
  "mcpServers": {
    "sqlserver": {
      "command": "mcp-sqlserver",
      "env": {
        "SQLSERVER_HOST": "your-server",
        "SQLSERVER_USER": "your-username",
        "SQLSERVER_PASSWORD": "your-password",
        "SQLSERVER_DATABASE": "your-database",
        "SQLSERVER_PORT": "1433",
        "SQLSERVER_ENCRYPT": "true",
        "SQLSERVER_TRUST_CERT": "false"
      }
    }
  }
}
```

### VSCode with MCP Extension

Install the MCP extension for VSCode and add the server configuration.

## Security Features

### Query Validation
- Only SELECT, WITH, SHOW, DESCRIBE, and EXPLAIN statements allowed
- Comprehensive blacklist of dangerous keywords (INSERT, UPDATE, DELETE, DROP, etc.)
- SQL injection pattern detection
- Automatic query sanitization

### Connection Security
- TLS/SSL encryption enabled by default
- Server certificate trust options for enterprise environments
- Connection pooling with timeout controls
- Configurable request timeouts

### Result Limits
- Maximum row limits per query (configurable)
- Automatic TOP clause injection for SELECT queries
- Query execution time tracking
- Memory usage protection

## Example Queries

Once connected, you can use the tools through your MCP client:

```typescript
// List all databases
await callTool("list_databases", {});

// List tables in a specific schema
await callTool("list_tables", { schema: "dbo" });

// Get table schema details
await callTool("describe_table", { 
  table_name: "Users", 
  schema: "dbo" 
});

// Execute a read-only query
await callTool("execute_query", { 
  query: "SELECT TOP 10 * FROM Users WHERE active = 1",
  limit: 10
});

// Get foreign key relationships
await callTool("get_foreign_keys", { 
  table_name: "Orders" 
});
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev

# Run linting
npm run lint

# Run tests
npm test
```

## Troubleshooting

### Connection Issues

Use the `--test-connection` flag to diagnose connectivity problems:

```bash
# Test your connection (shows detailed diagnostics)
mcp-sqlserver --test-connection
# or use the short flag
mcp-sqlserver -t
```

The command provides helpful error suggestions based on the error type:

| Error Type | Likely Cause | Suggested Fix |
|------------|-------------|---------------|
| `ENOTFOUND` / Server not found | Incorrect hostname | Check `SQLSERVER_HOST` |
| Login failed (18456) | Wrong username/password | Verify credentials |
| Timeout | Server unreachable or wrong port | Check port (default: 1433) |
| SSL/Certificate error | Self-signed certificate | Set `SQLSERVER_TRUST_CERT=true` |
| Connection refused | Firewall or SQL Server not running | Check server is running |

### Before Troubleshooting

1. Verify server hostname and port
2. Check if encryption/certificate settings match your SQL Server configuration
3. Ensure user has appropriate read permissions
4. Test connection using SQL Server Management Studio first

### Permission Issues

The user account needs at minimum:
- `CONNECT` permission to the database
- `SELECT` permission on tables/views you want to query
- Access to system views for metadata queries

### Common SQL Server Configurations

#### Azure SQL Database
```bash
export SQLSERVER_HOST="your-server.database.windows.net"
export SQLSERVER_ENCRYPT="true"
export SQLSERVER_TRUST_CERT="false"
```

#### On-premises SQL Server with self-signed certificates
```bash
export SQLSERVER_HOST="sql-server.company.com"
export SQLSERVER_ENCRYPT="true" 
export SQLSERVER_TRUST_CERT="true"
```

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:
- Check the troubleshooting section above
- Review SQL Server connection documentation
- Ensure MCP client compatibility

---

Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) for seamless AI integration.
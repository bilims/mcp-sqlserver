# Adding MCP SQL Server to Claude Desktop

## Step 1: Build the Project
```bash
cd /Users/onur/Projects/MCP
npm run build
```

## Step 2: Locate Claude Desktop Config
Open this file in a text editor:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

## Step 3: Add MCP Server Configuration
Add this configuration to the file (merge with existing mcpServers if present):

```json
{
  "mcpServers": {
    "mcp-sqlserver": {
      "command": "node",
      "args": ["/Users/onur/Projects/MCP/dist/index.js"],
      "env": {
        "SQLSERVER_HOST": "192.168.1.10",
        "SQLSERVER_PORT": "1433",
        "SQLSERVER_DATABASE": "MND2025",
        "SQLSERVER_USERNAME": "sa",
        "SQLSERVER_PASSWORD": "s_Ql.2025_sA",
        "SQLSERVER_ENCRYPT": "true",
        "SQLSERVER_TRUST_SERVER_CERTIFICATE": "true"
      }
    }
  }
}
```

**Note**: To fix the TLS warning, if you have a server name/hostname instead of IP address, use that in `SQLSERVER_HOST`. For example:
```json
"SQLSERVER_HOST": "your-sql-server.local"
```
Instead of:
```json
"SQLSERVER_HOST": "192.168.1.10"
```

## Step 4: Restart Claude Desktop
Close and reopen Claude Desktop application.

## Step 5: Test the Connection
In Claude Desktop, try these commands:

1. **Test Connection:**
   "Use the sql_test_connection tool to check if the database connection is working"

2. **List Tables:**
   "Use sql_get_tables to show me all tables in the database"

3. **Get Table Structure:**
   "Use sql_get_columns to show me the structure of [table_name]"

4. **Query Data:**
   "Use sql_select to get the first 10 rows from [table_name]"

## Available Tools
- `sql_test_connection` - Test database connection
- `sql_get_tables` - List all tables
- `sql_get_schemas` - List all schemas
- `sql_get_columns` - Get table column details
- `sql_get_table_structure` - Complete table structure
- `sql_select` - Execute SELECT queries
- `sql_insert` - Insert new records
- `sql_update` - Update existing records
- `sql_delete` - Delete records
- `sql_query` - Execute custom SELECT queries

## Security Notes
- Only SELECT operations are allowed in custom queries
- UPDATE and DELETE operations require WHERE conditions
- All queries use parameterized inputs to prevent SQL injection
- Row limits and timeouts are enforced
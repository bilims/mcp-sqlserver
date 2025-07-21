# MCP SQL Server

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

A Model Context Protocol (MCP) server that enables AI agents to interact with Microsoft SQL Server databases through secure, intelligent database operations. This server provides comprehensive CRUD capabilities, schema introspection, stored procedure execution, transaction management, and bulk operations for production SQL Server environments.

## 🌟 Features

### Core Database Operations
- **CRUD Operations**: Complete SELECT, INSERT, UPDATE, DELETE functionality
- **Custom Queries**: Safe execution of custom SELECT statements with security restrictions
- **Schema Introspection**: Database, table, column, index, and foreign key exploration
- **Connection Management**: Robust connection pooling with automatic reconnection

### Advanced Operations (v1.1.0)
- **Stored Procedures**: Execute stored procedures with parameters, multiple result sets, and output parameters
- **Transaction Management**: BEGIN/COMMIT/ROLLBACK operations with isolation levels and savepoints
- **Bulk Operations**: High-performance bulk insert, batch update/delete, and data import (CSV/JSON)

### Security & Safety
- **Parameterized Queries**: Full SQL injection prevention
- **Query Restrictions**: DDL operations blocked in custom queries
- **Input Validation**: Comprehensive Zod-based validation
- **Connection Validation**: Health checks and timeout controls

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- TypeScript 5.0+
- Microsoft SQL Server (2016+)
- Claude Desktop or MCP-compatible client

### Installation

#### Option 1: NPX (Recommended)
```bash
# No installation required - run directly
npx @bilims/mcp-sqlserver
```

#### Option 2: Global Installation
```bash
npm install -g @bilims/mcp-sqlserver
mcp-sqlserver
```

#### Option 3: From Source
```bash
git clone https://github.com/bilims/mcp-sqlserver.git
cd mcp-sqlserver
npm install
npm run build
npm start
```

### Configuration

Create a `.env` file with your SQL Server configuration:

```env
# SQL Server Configuration
SQLSERVER_HOST=your-server-host
SQLSERVER_PORT=1433
SQLSERVER_DATABASE=your-database
SQLSERVER_USERNAME=your-username
SQLSERVER_PASSWORD=your-password
SQLSERVER_ENCRYPT=true
SQLSERVER_TRUST_SERVER_CERTIFICATE=true

# Connection Pool Settings
SQLSERVER_POOL_MIN=0
SQLSERVER_POOL_MAX=10
SQLSERVER_CONNECTION_TIMEOUT=15000
SQLSERVER_REQUEST_TIMEOUT=15000
```

### Claude Desktop Integration

Add to your Claude Desktop MCP settings (`claude_desktop_config.json`):

#### Option 1: Using NPX (Recommended)
```json
{
  "mcpServers": {
    "mcp-sqlserver": {
      "command": "npx",
      "args": ["-y", "@bilims/mcp-sqlserver"],
      "env": {
        "SQLSERVER_HOST": "your-server-host",
        "SQLSERVER_DATABASE": "your-database",
        "SQLSERVER_USERNAME": "your-username",
        "SQLSERVER_PASSWORD": "your-password"
      }
    }
  }
}
```

#### Option 2: Global Installation
```json
{
  "mcpServers": {
    "mcp-sqlserver": {
      "command": "mcp-sqlserver"
    }
  }
}
```

#### Option 3: From Source
```json
{
  "mcpServers": {
    "mcp-sqlserver": {
      "command": "node",
      "args": ["/path/to/mcp-sqlserver/dist/index.js"],
      "cwd": "/path/to/mcp-sqlserver"
    }
  }
}
```

**Note**: For options 2 and 3, create a `.env` file in the appropriate directory with your SQL Server configuration.

## 🛠 Available Tools

### Core Database Operations (10 tools)
- `sql_test_connection` - Database connectivity testing
- `sql_select` - Advanced SELECT queries with filtering and joins
- `sql_insert` - Safe record insertion
- `sql_update` - Conditional record updates
- `sql_delete` - Safe record deletion
- `sql_query` - Custom SELECT statement execution
- `sql_get_tables` - Database table listing
- `sql_get_columns` - Table column information
- `sql_get_table_structure` - Complete table structure analysis
- `sql_get_schemas` - Database schema exploration

### Stored Procedures (3 tools)
- `sql_execute_stored_procedure` - Execute stored procedures with parameters
- `sql_get_stored_procedures` - List all stored procedures
- `sql_get_stored_procedure_info` - Get detailed stored procedure information

### Transaction Management (5 tools)
- `sql_begin_transaction` - Start database transactions with isolation levels
- `sql_commit_transaction` - Commit active transactions
- `sql_rollback_transaction` - Rollback transactions or to savepoints
- `sql_create_savepoint` - Create transaction savepoints
- `sql_get_transaction_status` - Check current transaction status

### Bulk Operations (4 tools)
- `sql_bulk_insert` - High-performance bulk insert operations
- `sql_batch_update` - Batch update multiple records
- `sql_batch_delete` - Batch delete multiple records
- `sql_import_data` - Import data from CSV/JSON formats

**Total: 22 tools available**

## 📚 Usage Examples

### Basic Query
```typescript
// Using sql_select tool
{
  "table": "Users",
  "columns": ["id", "name", "email"],
  "where": [
    {"column": "active", "operator": "=", "value": true}
  ],
  "orderBy": [{"column": "created_at", "direction": "DESC"}],
  "limit": 10
}
```

### Stored Procedure Execution
```typescript
// Using sql_execute_stored_procedure tool
{
  "procedureName": "GetUsersByRole",
  "schema": "dbo",
  "parameters": [
    {"name": "role", "value": "admin", "type": "varchar", "size": 50}
  ]
}
```

### Bulk Insert
```typescript
// Using sql_bulk_insert tool
{
  "table": "Products",
  "data": [
    {"name": "Product 1", "price": 29.99, "active": true},
    {"name": "Product 2", "price": 39.99, "active": true}
  ],
  "batchSize": 100
}
```

### Transaction Management
```typescript
// Begin transaction
{"isolationLevel": "READ_COMMITTED"}

// Create savepoint
{"savepointName": "before_updates"}

// Rollback to savepoint if needed
{"savepoint": "before_updates"}
```

## 🗺️ Roadmap

- **v1.1.0** (Current): Enhanced database operations with stored procedures, transactions, and bulk operations
- **v1.2.0** (Q3 2025): Data Analysis & Insights - 15 new analytics and export tools
- **v1.3.0** (Q4 2025): Advanced Query Builder - Natural language processing and query templates
- **v1.4.0** (Q1 2026): Enterprise Features - Multi-database support and security auditing
- **v2.0.0** (Mid-2026): AI-Enhanced Features - Full AI assistant capabilities

See [ROADMAP.md](./ROADMAP.md) for detailed feature plans.

## 🔧 Development

### Scripts

- `npm run build` - Build TypeScript to JavaScript
- `npm run dev` - Run in development mode
- `npm start` - Start the compiled server
- `npm test` - Run tests
- `npm run lint` - Lint TypeScript files
- `npm run typecheck` - Type check without emitting

### Project Structure

```
├── src/
│   ├── config/         # Configuration management
│   ├── database/       # Database connection and query building
│   ├── tools/          # MCP tool implementations
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions
│   ├── server.ts       # Main MCP server
│   └── index.ts        # Entry point
├── dist/               # Compiled JavaScript (generated)
├── ROADMAP.md          # Detailed development roadmap
├── package.json
└── tsconfig.json
```

## 🛡️ Security

- All queries use parameterized inputs to prevent SQL injection
- DDL operations are blocked in custom queries
- Connection validation and timeout controls
- Comprehensive input validation using Zod schemas
- Production-ready error handling and logging

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [ROADMAP.md](./ROADMAP.md) for priority areas and upcoming features.

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](./LICENSE) file for details.

## 🏢 About

Developed and maintained by [Bilims](https://github.com/bilims).

For support, feature requests, or bug reports, please [open an issue](https://github.com/bilims/mcp-sqlserver/issues).

---

**⚡ Ready to supercharge your SQL Server operations with AI? Get started today!**
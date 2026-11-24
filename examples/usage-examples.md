# Usage Examples & Getting Started Guide

This document provides practical examples of how to use the MCP SQL Server tools through different AI clients, with real-world scenarios and step-by-step workflows.

## Table of Contents
- [First Time Setup](#first-time-setup)
- [Basic Database Exploration](#basic-database-exploration)
- [Advanced Analysis Workflows](#advanced-analysis-workflows)
- [Tool Reference](#tool-reference)
- [Common Use Cases](#common-use-cases)
- [Troubleshooting](#troubleshooting)

## First Time Setup

### 1. Installation and Basic Test
```bash
# Install the package globally
npm install -g @bilims/mcp-sqlserver

# Verify installation
mcp-sqlserver --version  # Should show 2.0.0

# Check available tools
mcp-sqlserver --help
```

### 2. Configuration for Different Environments

#### Azure SQL Database Setup
```json
{
  "mcpServers": {
    "sqlserver": {
      "command": "mcp-sqlserver",
      "env": {
        "SQLSERVER_HOST": "mycompany.database.windows.net",
        "SQLSERVER_USER": "myuser@mycompany",
        "SQLSERVER_PASSWORD": "MySecurePassword123!",
        "SQLSERVER_DATABASE": "ProductionDB",
        "SQLSERVER_ENCRYPT": "true",
        "SQLSERVER_TRUST_CERT": "false"
      }
    }
  }
}
```

#### On-Premises SQL Server Setup
```json
{
  "mcpServers": {
    "sqlserver": {
      "command": "mcp-sqlserver",
      "env": {
        "SQLSERVER_HOST": "sql-server.company.local",
        "SQLSERVER_USER": "db_reader",
        "SQLSERVER_PASSWORD": "ReadOnlyPassword123",
        "SQLSERVER_DATABASE": "CompanyDB",
        "SQLSERVER_ENCRYPT": "true",
        "SQLSERVER_TRUST_CERT": "true"
      }
    }
  }
}
```

### 3. First Connection Test
Once configured in Claude Desktop, try:
```
"Test the SQL Server connection and show me server information"
```

## Basic Database Exploration

### Starting Your Database Discovery Journey

#### Step 1: Server Overview
```
"What SQL Server am I connected to? Show me server information and available databases."
```

#### Step 2: Database Structure
```
"List all tables in the [DatabaseName] database and show me how many rows each table has."
```

#### Step 3: Table Relationships
```
"Show me all foreign key relationships in this database to understand how tables are connected."
```

#### Step 4: Table Deep Dive
```
"Describe the structure of the [TableName] table, including all columns, data types, and constraints."
```

### Sample Conversation Flow
```
User: "I'm new to this database. Can you help me understand its structure?"

AI: I'll help you explore the database structure step by step. Let me start by testing the connection and getting basic information.

User: "Test the SQL Server connection"
User: "List all databases on the server"
User: "Show me tables in the main database"
User: "What are the foreign key relationships between these tables?"
```

## Tool Examples

### Schema Discovery

#### List Databases
```json
{
  "tool": "list_databases",
  "arguments": {}
}
```

**Response:**
```json
[
  {
    "database_id": 1,
    "name": "master",
    "create_date": "2023-01-01T00:00:00.000Z",
    "collation_name": "SQL_Latin1_General_CP1_CI_AS",
    "state_desc": "ONLINE"
  },
  {
    "database_id": 5,
    "name": "AdventureWorks",
    "create_date": "2023-01-15T10:30:00.000Z",
    "collation_name": "SQL_Latin1_General_CP1_CI_AS", 
    "state_desc": "ONLINE"
  }
]
```

#### List Tables
```json
{
  "tool": "list_tables",
  "arguments": {
    "schema": "dbo"
  }
}
```

**Response:**
```json
[
  {
    "table_catalog": "AdventureWorks",
    "table_schema": "dbo",
    "table_name": "Users",
    "table_type": "BASE TABLE"
  },
  {
    "table_catalog": "AdventureWorks", 
    "table_schema": "dbo",
    "table_name": "Orders",
    "table_type": "BASE TABLE"
  }
]
```

#### Describe Table Schema
```json
{
  "tool": "describe_table",
  "arguments": {
    "table_name": "Users",
    "schema": "dbo"
  }
}
```

**Response:**
```json
[
  {
    "table_catalog": "AdventureWorks",
    "table_schema": "dbo", 
    "table_name": "Users",
    "column_name": "UserId",
    "ordinal_position": 1,
    "column_default": null,
    "is_nullable": "NO",
    "data_type": "int",
    "character_maximum_length": null,
    "numeric_precision": 10,
    "numeric_scale": 0
  },
  {
    "table_catalog": "AdventureWorks",
    "table_schema": "dbo",
    "table_name": "Users", 
    "column_name": "Username",
    "ordinal_position": 2,
    "column_default": null,
    "is_nullable": "NO",
    "data_type": "nvarchar",
    "character_maximum_length": 255,
    "numeric_precision": null,
    "numeric_scale": null
  }
]
```

### Relationship Analysis

#### Get Foreign Keys
```json
{
  "tool": "get_foreign_keys", 
  "arguments": {
    "table_name": "Orders"
  }
}
```

**Response:**
```json
[
  {
    "constraint_name": "FK_Orders_Users",
    "table_schema": "dbo",
    "table_name": "Orders",
    "column_name": "UserId", 
    "referenced_table_schema": "dbo",
    "referenced_table_name": "Users",
    "referenced_column_name": "UserId"
  }
]
```

#### Get Table Statistics
```json
{
  "tool": "get_table_stats",
  "arguments": {
    "table_name": "Users"
  }
}
```

**Response:**
```json
[
  {
    "table_schema": "dbo",
    "table_name": "Users",
    "row_count": 10523,
    "data_size_kb": 2048,
    "index_size_kb": 512,
    "total_size_kb": 2560
  }
]
```

### Data Exploration

#### Execute Query
```json
{
  "tool": "execute_query",
  "arguments": {
    "query": "SELECT TOP 5 UserId, Username, Email FROM Users WHERE Active = 1",
    "limit": 5
  }
}
```

**Response:**
```json
{
  "columns": ["UserId", "Username", "Email"],
  "rows": [
    [1, "john_doe", "john@example.com"],
    [2, "jane_smith", "jane@example.com"], 
    [3, "bob_wilson", "bob@example.com"],
    [4, "alice_brown", "alice@example.com"],
    [5, "charlie_davis", "charlie@example.com"]
  ],
  "rowCount": 5,
  "executionTime": 156
}
```

#### Get Server Information
```json
{
  "tool": "get_server_info",
  "arguments": {}
}
```

**Response:**
```json
{
  "server_name": "SQL-SERVER-01",
  "product_version": "Microsoft SQL Server 2022 (RTM) - 16.0.1000.6",
  "product_level": "RTM",
  "edition": "Developer Edition (64-bit)",
  "engine_edition": 3
}
```

## Advanced Analysis Workflows

### 1. Complete Database Discovery Workflow
```
"I need to understand this database completely. Please help me discover:
1. What SQL Server version and edition we're using
2. All available databases and their sizes
3. The main tables and their relationships
4. Sample data from the most important tables"
```

### 2. Data Quality Analysis
```
"Help me analyze data quality by:
1. Finding all tables with more than 10,000 rows
2. Showing me tables with foreign key relationships
3. Looking for any tables that might be lookup/reference tables
4. Getting a sample of data from the largest tables"
```

### 3. Schema Documentation Workflow
```
"I need to document this database schema:
1. List all tables and views with their purposes
2. Show all foreign key relationships in a clear format
3. Describe the structure of each main table
4. Identify the core business entities"
```

## Real-World Use Cases

### Business Analyst: Understanding Customer Data
```
User: "I need to understand our customer data structure for a new analytics project."

Workflow:
1. "Test the connection and show me server information"
2. "List all databases and find the one containing customer data"
3. "Show me all tables in the CustomerDB database"
4. "Describe the structure of the Customers table"
5. "What tables are related to the Customers table through foreign keys?"
6. "Show me a sample of 10 recent customer records"
7. "What are the different customer types or categories in our database?"
```

### Developer: API Integration Planning
```
User: "I'm building an API that needs to access order and product data."

Workflow:
1. "Show me all tables related to orders and products"
2. "Describe the Orders table structure in detail"
3. "What are the foreign key relationships for the Orders table?"
4. "Show me the Products table structure"
5. "How are orders and products connected in the database?"
6. "Give me sample queries to get order details with product information"
```

### Data Scientist: Exploratory Data Analysis
```
User: "I need to understand the data patterns for a machine learning project."

Workflow:
1. "Show me statistics for all tables including row counts and sizes"
2. "What are the largest tables in the database?"
3. "Show me sample data from the main transaction tables"
4. "Help me understand the relationships between entities"
5. "What columns contain date/time information for tracking trends?"
6. "Are there any lookup tables I should be aware of?"
```

## Common Troubleshooting Scenarios

### Connection Issues
```
User: "I'm getting connection errors"

Solution Steps:
1. "Test the SQL Server connection" - Check basic connectivity
2. Verify your environment variables in Claude Desktop config
3. Check if server allows remote connections
4. Verify firewall settings and network access
```

### Permission Issues
```
User: "I can connect but can't see some tables"

Solution Steps:
1. "List all databases" - See what you can access
2. "Show me server information" - Verify connection details
3. Check with your DBA about SELECT permissions
4. Try different database or schema names
```

### Performance Issues
```
User: "Queries are running slowly"

Solution Steps:
1. Use smaller LIMIT values in execute_query
2. "Get table statistics" to understand data volumes
3. Focus on specific schemas rather than whole database
4. Break complex queries into smaller parts
```

## Error Handling Examples

### Invalid Query (Security Violation)
```json
{
  "tool": "execute_query",
  "arguments": {
    "query": "DELETE FROM Users WHERE Active = 0"
  }
}
```

**Error Response:**
```
Tool execution failed: Query validation failed: Forbidden keyword detected: DELETE
```

### SQL Injection Attempt
```json
{
  "tool": "execute_query", 
  "arguments": {
    "query": "SELECT * FROM Users WHERE Username = 'admin' OR '1'='1'"
  }
}
```

**Error Response:**
```
Tool execution failed: Query validation failed: Potential SQL injection pattern detected
```

### Table Not Found
```json
{
  "tool": "describe_table",
  "arguments": {
    "table_name": "NonExistentTable"
  }
}
```

**Error Response:**
```
Tool execution failed: Database query failed: Invalid object name 'NonExistentTable'
```

## Performance Tips

1. **Use LIMIT parameter** for large result sets:
   ```json
   {
     "tool": "execute_query",
     "arguments": {
       "query": "SELECT * FROM LargeTable",
       "limit": 100
     }
   }
   ```

2. **Filter by schema** when exploring:
   ```json
   {
     "tool": "list_tables",
     "arguments": {
       "schema": "dbo"
     }
   }
   ```

3. **Use specific table queries** instead of broad searches:
   ```json
   {
     "tool": "get_foreign_keys",
     "arguments": {
       "table_name": "SpecificTable"
     }
   }
   ```

## Security Best Practices

- All queries are automatically validated for read-only operations (unless `SQLSERVER_UNSAFE_NONCE` is set)
- Row limits are enforced to prevent memory issues
- Connection timeouts prevent hanging queries
- Only SELECT-based operations are allowed by default; `SQLSERVER_UNSAFE_NONCE=i_sure_know_what_i_am_doing` disables all validation
- SQL injection patterns are detected and blocked

## Integration Examples

### With Claude Desktop
Ask questions like:
- "What tables are in this database?"
- "Show me the schema for the Users table"
- "How are Orders and Users tables related?"
- "Give me a sample of recent orders"

### With Claude Code CLI
Use for development tasks:
- Database schema documentation generation
- Data modeling and relationship analysis
- Query development and testing
- Performance analysis

### With VSCode
Integrate for:
- Code completion based on database schema
- Query validation and suggestions
- Database documentation in README files
- Data model visualization
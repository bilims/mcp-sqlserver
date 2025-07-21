#!/usr/bin/env node

import 'dotenv/config';
import { SqlServerMcpServer } from './server.js';

async function main() {
  const server = new SqlServerMcpServer();
  await server.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Failed to start MCP SQL Server:', error);
    process.exit(1);
  });
}
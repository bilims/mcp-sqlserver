export class MCPError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MCPError';
  }
}

export class ConnectionError extends MCPError {
  constructor(message: string, details?: any) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'ConnectionError';
  }
}

export class ValidationError extends MCPError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class SecurityError extends MCPError {
  constructor(message: string, details?: any) {
    super(message, 'SECURITY_ERROR', details);
    this.name = 'SecurityError';
  }
}

export class QueryError extends MCPError {
  constructor(message: string, details?: any) {
    super(message, 'QUERY_ERROR', details);
    this.name = 'QueryError';
  }
}

export class TimeoutError extends MCPError {
  constructor(message: string, details?: any) {
    super(message, 'TIMEOUT_ERROR', details);
    this.name = 'TimeoutError';
  }
}

export class PermissionError extends MCPError {
  constructor(message: string, details?: any) {
    super(message, 'PERMISSION_ERROR', details);
    this.name = 'PermissionError';
  }
}

export class ErrorHandler {
  static handleSqlServerError(error: any): MCPError {
    if (!error) {
      return new MCPError('Unknown database error occurred', 'UNKNOWN_ERROR');
    }

    const message = error.message || error.toString();
    const code = error.code || error.number;

    // SQL Server specific error handling
    if (typeof code === 'number') {
      switch (code) {
        case 18456: // Login failed
          return new ConnectionError(
            'Authentication failed: Invalid username or password',
            { originalError: message, code }
          );
        
        case 2: // Server not found
        case 53: // Network path not found
          return new ConnectionError(
            'Connection failed: Server not found or not accessible',
            { originalError: message, code }
          );
        
        case -2: // Timeout
          return new TimeoutError(
            'Connection timeout: Server took too long to respond',
            { originalError: message, code }
          );
        
        case 208: // Invalid object name
          return new ValidationError(
            'Invalid table or object name specified',
            { originalError: message, code }
          );
        
        case 207: // Invalid column name
          return new ValidationError(
            'Invalid column name specified',
            { originalError: message, code }
          );
        
        case 262: // Permission denied
        case 229: // SELECT permission denied
          return new PermissionError(
            'Permission denied: Insufficient privileges to access this resource',
            { originalError: message, code }
          );
        
        case 1205: // Deadlock
          return new QueryError(
            'Query failed due to deadlock - please retry',
            { originalError: message, code }
          );
        
        case 8152: // String truncation
          return new ValidationError(
            'Data too long for target column',
            { originalError: message, code }
          );
        
        case 515: // Cannot insert null
          return new ValidationError(
            'Cannot insert null value into non-nullable column',
            { originalError: message, code }
          );
        
        default:
          // Generic SQL Server error
          return new QueryError(
            `Database error (${code}): ${message}`,
            { originalError: message, code }
          );
      }
    }

    // Handle connection-specific errors by message content
    if (message.toLowerCase().includes('login failed')) {
      return new ConnectionError(
        'Authentication failed: Invalid username or password',
        { originalError: message }
      );
    }
    
    if (message.toLowerCase().includes('server was not found') || 
        message.toLowerCase().includes('network-related')) {
      return new ConnectionError(
        'Connection failed: Server not found or network issue',
        { originalError: message }
      );
    }
    
    if (message.toLowerCase().includes('timeout')) {
      return new TimeoutError(
        'Operation timed out',
        { originalError: message }
      );
    }
    
    if (message.toLowerCase().includes('ssl') || 
        message.toLowerCase().includes('certificate')) {
      return new ConnectionError(
        'SSL/Certificate error: Check encryption and certificate trust settings',
        { originalError: message }
      );
    }
    
    if (message.toLowerCase().includes('permission') || 
        message.toLowerCase().includes('denied')) {
      return new PermissionError(
        'Permission denied: Insufficient database privileges',
        { originalError: message }
      );
    }

    // Default to generic query error
    return new QueryError(
      `Database operation failed: ${message}`,
      { originalError: message }
    );
  }

  static formatErrorForUser(error: MCPError): {
    error: string;
    code: string;
    suggestions?: string[];
  } {
    const result = {
      error: error.message,
      code: error.code,
      suggestions: [] as string[],
    };

    // Add helpful suggestions based on error type
    switch (error.code) {
      case 'CONNECTION_ERROR':
        result.suggestions = [
          'Verify server hostname and port number',
          'Check if SQL Server service is running',
          'Ensure network connectivity to the server',
          'Verify firewall settings allow SQL Server connections',
        ];
        break;
      
      case 'VALIDATION_ERROR':
        result.suggestions = [
          'Check spelling of table and column names',
          'Verify the object exists in the specified schema',
          'Ensure you have the correct database selected',
        ];
        break;
      
      case 'SECURITY_ERROR':
        result.suggestions = [
          'Only read-only SELECT queries are allowed',
          'Remove any INSERT, UPDATE, DELETE, or DDL statements',
          'Check for potentially dangerous keywords in your query',
          'To allow any query, set SQLSERVER_UNSAFE_NONCE=i_sure_know_what_i_am_doing (disables ALL query validation)',
        ];
        break;
      
      case 'PERMISSION_ERROR':
        result.suggestions = [
          'Contact your database administrator for access',
          'Verify you have SELECT permissions on the target tables',
          'Check if you need access to specific schemas or databases',
        ];
        break;
      
      case 'TIMEOUT_ERROR':
        result.suggestions = [
          'Try a simpler query with fewer rows',
          'Add WHERE clauses to limit the result set',
          'Check if the server is under heavy load',
        ];
        break;
      
      case 'QUERY_ERROR':
        result.suggestions = [
          'Check your SQL syntax',
          'Verify all referenced tables and columns exist',
          'Try breaking complex queries into simpler parts',
        ];
        break;
    }

    return result;
  }
}
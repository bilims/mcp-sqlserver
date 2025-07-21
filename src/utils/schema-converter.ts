import { z } from 'zod';

// Helper function to convert Zod schemas to MCP-compatible format
export function zodToJsonSchema(schema: z.ZodTypeAny): any {
  // For MCP SDK, we need to return the schema properties directly as Zod schemas
  
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const result: any = {};
    
    for (const [key, value] of Object.entries(shape)) {
      result[key] = value; // Return the Zod schema directly
    }
    
    return result;
  }
  
  return schema;
}

function isOptional(zodType: z.ZodTypeAny): boolean {
  return zodType instanceof z.ZodOptional || zodType.isOptional();
}

function convertZodType(zodType: z.ZodTypeAny): any {
  if (zodType instanceof z.ZodString) {
    return { type: 'string' };
  }
  
  if (zodType instanceof z.ZodNumber) {
    return { type: 'number' };
  }
  
  if (zodType instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }
  
  if (zodType instanceof z.ZodArray) {
    return {
      type: 'array',
      items: convertZodType(zodType._def.type)
    };
  }
  
  if (zodType instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: true
    };
  }
  
  if (zodType instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: zodType._def.values
    };
  }
  
  if (zodType instanceof z.ZodOptional) {
    return convertZodType(zodType._def.innerType);
  }
  
  if (zodType instanceof z.ZodEffects) {
    return convertZodType(zodType._def.schema);
  }
  
  if (zodType instanceof z.ZodObject) {
    const shape = zodType._def.shape();
    const properties: any = {};
    const required: string[] = [];
    
    for (const [key, value] of Object.entries(shape)) {
      const nestedZodType = value as z.ZodTypeAny;
      properties[key] = convertZodType(nestedZodType);
      
      if (!isOptional(nestedZodType)) {
        required.push(key);
      }
    }
    
    return {
      type: 'object',
      properties,
      ...(required.length > 0 && { required })
    };
  }
  
  // Fallback for any unhandled types
  return { type: 'string' };
}
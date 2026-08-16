import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

import { ValidationError } from './app-error';

type RequestPart = 'body' | 'query' | 'params';

/** Validates `req[part]` against a Zod schema and replaces it with the parsed (typed, coerced) value. */
export function validate(schema: ZodSchema, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      return next(new ValidationError('Validation failed', result.error.flatten()));
    }
    req[part] = result.data;
    next();
  };
}

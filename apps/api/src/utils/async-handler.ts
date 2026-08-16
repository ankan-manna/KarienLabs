import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Wraps an async controller so rejected promises always reach the error middleware. */
export function asyncHandler(handler: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

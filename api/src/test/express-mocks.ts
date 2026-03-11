import type { NextFunction, Request, Response } from 'express';
import { vi } from 'vitest';

interface MockRequestOptions {
  cookies?: Record<string, string>;
  headers?: Record<string, string | undefined>;
  remoteAddress?: string;
}

export function createMockRequest(options: MockRequestOptions = {}): Request {
  const { cookies = {}, headers = {}, remoteAddress = '127.0.0.1' } = options;
  const request = {
    cookies,
    headers,
    ip: remoteAddress,
    get: vi.fn((name: string) => headers[name.toLowerCase()] ?? headers[name]),
    socket: { remoteAddress },
  };

  return request as unknown as Request;
}

export function createMockResponse(): Response {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
  };

  return response as unknown as Response;
}

export function createMockNext(): NextFunction {
  return vi.fn((_error?: unknown) => undefined) as NextFunction;
}

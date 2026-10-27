import { describe, it, expect } from 'vitest';
import { ProtocolError, ERROR_CODES } from '../src/errors.js';

describe('ProtocolError', () => {
  it('carries code and contextId', () => {
    const err = new ProtocolError(ERROR_CODES.INVALID_POINTER, 'abc123', 'bad hash');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ProtocolError');
    expect(err.code).toBe(0x04);
    expect(err.contextId).toBe('abc123');
    expect(err.message).toContain('bad hash');
  });
});

export const ERROR_CODES = {
  INVALID_INPUT: 0x00,
  INVALID_VALUES: 0x01,
  INVALID_COMMAND: 0x02,
  INVALID_QUERY: 0x03,
  INVALID_POINTER: 0x04,
  INVALID_DATA_HASH: 0x05,
  INVALID_SIZE: 0x06,
  INVALID_DELETION_POINTER: 0x07,
  ERROR_RETRIEVING_DATA: 0x08,
  ERROR_RETRIVING_POINTERS: 0x09,
  INVALID_PUBKEY: 0x0a,
  ACTION_NOT_ALLOWED: 0x0b,
  NOTICE: 0x0c,
} as const;

export const ERROR_MESSAGES: Record<number, string> = {
  0x00: 'Invalid input',
  0x01: 'Invalid values: ',
  0x02: 'Bad command: ',
  0x03: 'Bad query: ',
  0x04: 'Invalid pointer: ',
  0x05: 'Data hash error: ',
  0x06: 'Bad data size: ',
  0x07: 'Deletion pointer error',
  0x08: 'Data retrival error',
  0x09: 'Pointer retrieval error',
  0x0a: 'Public Key Error: ',
  0x0b: '',
  0x0c: 'Notice: ',
};

export class ProtocolError extends Error {
  readonly code: number;
  readonly contextId: string;

  constructor(code: number, contextId = '', contextMessage = '') {
    super((ERROR_MESSAGES[code] ?? 'Protocol error: ') + contextMessage);
    this.name = 'ProtocolError';
    this.code = code;
    this.contextId = contextId;
  }
}

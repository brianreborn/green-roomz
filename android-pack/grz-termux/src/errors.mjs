export class GreenRoomzError extends Error {
  constructor(message, { status = 500, code = 'internal_error', details } = {}) {
    super(message);
    this.name = 'GreenRoomzError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends GreenRoomzError {
  constructor(message, details) {
    super(message, { status: 400, code: 'validation_error', details });
    this.name = 'ValidationError';
  }
}

export class UnavailableError extends GreenRoomzError {
  constructor(message, details) {
    super(message, { status: 503, code: 'agent_unavailable', details });
    this.name = 'UnavailableError';
  }
}

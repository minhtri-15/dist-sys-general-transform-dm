export class InvalidOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOperationError";
  }
}

export class UnexpectedInternalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInternalError";
  }
}
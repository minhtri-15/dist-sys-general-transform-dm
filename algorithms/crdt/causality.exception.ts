export class OutOfOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutOfOrderError";
  }
}

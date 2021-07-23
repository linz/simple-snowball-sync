export class ErrorList extends Error {
  errors: Error[];

  constructor(msg: string, errors: Error[]) {
    super(msg);
    this.name = this.constructor.name;
    this.errors = errors;
    this.message = msg + ': ' + this.errors.map((e) => e.message).join(', ');
    this.stack = this.errors.map((e) => e.stack).join('\n\n');
  }
}

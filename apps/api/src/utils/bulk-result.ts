export interface BulkOperationResult {
  requested: number;
  succeeded: number;
  failed: number;
  errors: Array<{ index: number; identifier?: string; message: string }>;
}

export class BulkResultBuilder {
  private succeeded = 0;
  private readonly errors: BulkOperationResult['errors'] = [];

  constructor(private readonly requested: number) {}

  ok(): void {
    this.succeeded++;
  }

  fail(index: number, message: string, identifier?: string): void {
    this.errors.push({ index, identifier, message });
  }

  build(): BulkOperationResult {
    return {
      requested: this.requested,
      succeeded: this.succeeded,
      failed: this.errors.length,
      errors: this.errors,
    };
  }
}

import { createDemoState } from "@/lib/demo/seed";
import type { OperationsState } from "@/lib/domain/types";
import type { OperationsRepository } from "@/lib/repositories/operations";

export class DemoOperationsRepository implements OperationsRepository {
  readonly mode = "demo" as const;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async loadSnapshot(): Promise<OperationsState> {
    return createDemoState(this.now());
  }
}

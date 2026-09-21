declare module 'bun:sqlite' {
  export class Database {
    constructor(path: string);
    exec(sql: string): void;
    query(sql: string): {
      all(...values: unknown[]): unknown[];
      get(...values: unknown[]): unknown;
      run(...values: unknown[]): unknown;
    };
  }
}

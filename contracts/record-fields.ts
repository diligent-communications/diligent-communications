export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasFields(record: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Reflect.ownKeys(record);
  return keys.length === fields.length && fields.every((field) => {
    const descriptor = Object.getOwnPropertyDescriptor(record, field);
    return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
  });
}

export function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.isWellFormed();
}

// A time written as UTC, such as 2026-01-02T03:04:05.006Z, naming a real date.
export function isUtcTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) {
    return false;
  }
  const time = new Date(value);
  return !Number.isNaN(time.getTime()) && time.toISOString().slice(0, 19) === value.slice(0, 19);
}

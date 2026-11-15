import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** An error the client is meant to see, with a status, a stable code and a readable message. */
export class Problem extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: ContentfulStatusCode, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const notFound = (what: string) => new Problem(404, 'not_found', `${what} not found.`);

export function fromZod(error: { issues: { path: PropertyKey[]; message: string }[] }): Problem {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || 'body';
    fields[key] ??= issue.message;
  }
  return new Problem(400, 'validation', 'Some fields need attention.', fields);
}

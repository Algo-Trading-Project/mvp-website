export class ApiError extends Error {
  constructor(message, { status, data, cause, requestId } = {}) {
    super(message);
    this.name = "ApiError";
    if (status !== undefined) this.status = status;
    if (data !== undefined) this.data = data;
    if (requestId !== undefined) this.requestId = requestId;
    if (cause) this.cause = cause;
  }
}

export const isApiError = (error) => error instanceof ApiError;

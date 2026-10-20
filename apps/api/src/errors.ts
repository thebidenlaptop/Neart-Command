export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, `${what} not found`);
export const badRequest = (message: string) => new AppError(400, message);

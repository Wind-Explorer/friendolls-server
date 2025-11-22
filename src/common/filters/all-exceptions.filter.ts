import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global Exception Filter
 *
 * Catches all exceptions thrown within the application and formats
 * them into consistent HTTP responses. Provides proper error logging
 * while avoiding exposure of sensitive internal information.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: HttpStatus;
    let message: string;
    let error: string;

    if (exception instanceof HttpException) {
      // Handle known HTTP exceptions (e.g., NotFoundException, ForbiddenException)
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse &&
        'error' in exceptionResponse
      ) {
        const responseObj = exceptionResponse as {
          message: string;
          error: string;
        };
        message = responseObj.message;
        error = responseObj.error;
      } else {
        message = exception.message;
        error = exception.name;
      }
    } else {
      // Handle unknown exceptions (programming errors, etc.)
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'InternalServerError';

      // Log the actual error for debugging (don't expose to client)
      this.logger.error(
        `Unhandled exception: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Log the response being sent
    this.logger.warn(
      `HTTP ${status} Error: ${message} - ${request.method} ${request.url}`,
    );

    // Send consistent error response
    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

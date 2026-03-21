export class ResponseUtil {
  static success<T>(data: T, message = 'Success') {
    return {
      success: true,
      message,
      data,
    };
  }

  static error(message: string, statusCode: number) {
    return {
      success: false,
      message,
      statusCode,
    };
  }
}
export class ApiResponse {
  constructor(statusCode, data = null, message = "Success") {
    this.statusCode = statusCode;
    this.success = statusCode === 500 ? false : statusCode < 400;
    this.message =
      statusCode === 500 ? "Internal Server Error" : message;
    this.data = statusCode === 500 ? null : data;
  }
}

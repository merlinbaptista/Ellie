export class EllieError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly speech: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ValidationError extends EllieError {
  constructor(message: string, speech = "I could not use those details. Please check them and try again.") {
    super(message, "VALIDATION_ERROR", speech);
  }
}
export class NotFoundError extends EllieError {
  constructor(message: string, speech = "I could not find that in your home records.") {
    super(message, "NOT_FOUND", speech);
  }
}
export class ConfigError extends EllieError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR", "Ellie needs a little configuration before that service can start.");
  }
}
export class ExternalServiceError extends EllieError {
  constructor(message: string, speech = "That service is unavailable right now. Please try again shortly.") {
    super(message, "EXTERNAL_SERVICE_ERROR", speech);
  }
}

import winston from "winston";

const maskAccountIds = process.env.LOG_MASK_ACCOUNT_IDS === "true";

const maskFormat = winston.format((info) => {
  if (maskAccountIds && typeof info.message === "string") {
    info.message = info.message.replace(/\b\d{12}\b/g, "****");
  }
  return info;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(
    maskFormat(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  ],
});

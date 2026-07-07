type Level = "info" | "warn" | "error";

function write(level: Level, message: string, extra?: unknown) {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  if (level === "error") {
    console.error(line, extra ?? "");
  } else if (level === "warn") {
    console.warn(line, extra ?? "");
  } else {
    console.log(line, extra ?? "");
  }
}

export const log = {
  info: (message: string, extra?: unknown) => write("info", message, extra),
  warn: (message: string, extra?: unknown) => write("warn", message, extra),
  error: (message: string, extra?: unknown) => write("error", message, extra),
};

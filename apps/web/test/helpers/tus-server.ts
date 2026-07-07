import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Minimal in-memory tus 1.0.0 server (creation, creation-with-upload,
 * termination) for exercising the real tus-js-client wire behavior:
 * chunked PATCHes, offset negotiation via HEAD, resume after interruption,
 * and DELETE on cancel. Supports deliberately killing sockets to simulate
 * network failures.
 */

export interface TusSession {
  data: Buffer;
  offset: number;
  length: number;
}

export interface TestTusServer {
  /** Creation endpoint, e.g. http://127.0.0.1:PORT/files */
  url: string;
  sessions: Map<string, TusSession>;
  /** Abruptly destroy the sockets of the next N PATCH requests. */
  sabotagePatches(count: number): void;
  /** How many PATCH requests were killed so far. */
  killedPatches(): number;
  close(): Promise<void>;
}

export async function startTusServer(): Promise<TestTusServer> {
  const sessions = new Map<string, TusSession>();
  let sabotageRemaining = 0;
  let killed = 0;
  let counter = 0;

  const server = http.createServer(async (req, res) => {
    res.setHeader("Tus-Resumable", "1.0.0");
    const url = req.url ?? "";

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Tus-Version": "1.0.0",
        "Tus-Extension": "creation,creation-with-upload,termination",
      });
      return res.end();
    }

    if (req.method === "POST" && url === "/files") {
      const length = Number(req.headers["upload-length"]);
      if (!Number.isFinite(length) || length <= 0) {
        res.writeHead(400);
        return res.end();
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks);

      const id = `u${++counter}`;
      const session: TusSession = {
        data: Buffer.alloc(length),
        offset: 0,
        length,
      };
      body.copy(session.data, 0);
      session.offset = body.length;
      sessions.set(id, session);

      res.writeHead(201, {
        Location: `/files/${id}`,
        "Upload-Offset": String(session.offset),
      });
      return res.end();
    }

    const match = /^\/files\/([^/]+)$/.exec(url);
    const id = match?.[1];
    const session = id ? sessions.get(id) : undefined;
    if (!id || !session) {
      res.writeHead(404);
      return res.end();
    }

    if (req.method === "HEAD") {
      res.writeHead(200, {
        "Upload-Offset": String(session.offset),
        "Upload-Length": String(session.length),
        "Cache-Control": "no-store",
      });
      return res.end();
    }

    if (req.method === "PATCH") {
      if (sabotageRemaining > 0) {
        sabotageRemaining--;
        killed++;
        req.socket.destroy();
        return;
      }
      const offset = Number(req.headers["upload-offset"]);
      if (offset !== session.offset) {
        res.writeHead(409);
        return res.end();
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks);
      body.copy(session.data, offset);
      session.offset = offset + body.length;

      res.writeHead(204, { "Upload-Offset": String(session.offset) });
      return res.end();
    }

    if (req.method === "DELETE") {
      sessions.delete(id);
      res.writeHead(204);
      return res.end();
    }

    res.writeHead(405);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}/files`,
    sessions,
    sabotagePatches: (count) => {
      sabotageRemaining += count;
    },
    killedPatches: () => killed,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

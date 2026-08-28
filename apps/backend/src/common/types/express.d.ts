import type { Role } from "@home-service/database";

// Augments Express's Request with the authenticated principal. Populated
// exclusively by the `authenticate` middleware from a verified JWT — never
// trust any role/userId the client sends in a body or query string.
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: Role;
      };
    }
  }
}

export {};

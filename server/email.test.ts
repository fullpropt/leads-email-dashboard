import { describe, expect, it } from "vitest";
import { testEmailConnection } from "./email";

describe("email SMTP configuration", () => {
  it("should successfully connect to SMTP server with provided credentials", async () => {
    const isConnected = await testEmailConnection();
    expect(isConnected).toBe(true);
  }, 15000); // timeout de 15 segundos para conexão SMTP
});

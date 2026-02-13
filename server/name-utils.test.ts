import { describe, expect, it } from "vitest";
import {
  deriveNameFromEmail,
  deriveNameFromIdentifier,
  hasMeaningfulName,
  resolveAutoName,
  sanitizeName,
} from "./name-utils";

describe("name-utils", () => {
  describe("sanitizeName", () => {
    it("accepts valid names and trims extra spaces", () => {
      expect(sanitizeName("  Vinicyos   Rotelli  ")).toBe("Vinicyos Rotelli");
      expect(hasMeaningfulName("Arielly")).toBe(true);
    });

    it("rejects invalid placeholders, numeric values and emails", () => {
      expect(sanitizeName("sem nome")).toBeNull();
      expect(sanitizeName("5527999999999")).toBeNull();
      expect(sanitizeName("user@example.com")).toBeNull();
      expect(hasMeaningfulName("undefined")).toBe(false);
    });
  });

  describe("deriveNameFromEmail", () => {
    it("derives a title-cased name from email local-part", () => {
      expect(deriveNameFromEmail("vinicyos.rotelli+teste@gmail.com")).toBe(
        "Vinicyos Rotelli"
      );
    });

    it("returns null when email local-part has no meaningful name", () => {
      expect(deriveNameFromEmail("5527999999999@gmail.com")).toBeNull();
    });
  });

  describe("deriveNameFromIdentifier", () => {
    it("derives a name from provider-style identifiers", () => {
      expect(deriveNameFromIdentifier("github_vinicyos_rotelli123")).toBe(
        "Vinicyos Rotelli"
      );
      expect(deriveNameFromIdentifier("oauth_ana-maria_99")).toBe("Ana Maria");
    });

    it("returns null when identifier is numeric only", () => {
      expect(deriveNameFromIdentifier("user_5527999999999")).toBeNull();
    });
  });

  describe("resolveAutoName", () => {
    it("uses provided name when meaningful", () => {
      expect(
        resolveAutoName({
          providedName: "Bruno",
          email: "ignored@example.com",
          identifier: "github_ignored",
          fallback: "Lead",
        })
      ).toBe("Bruno");
    });

    it("falls back to email, then identifier, then fallback", () => {
      expect(
        resolveAutoName({
          providedName: "sem nome",
          email: "caio.santos+lead@gmail.com",
          identifier: "github_caio_s",
          fallback: "Lead",
        })
      ).toBe("Caio Santos");

      expect(
        resolveAutoName({
          providedName: null,
          email: null,
          identifier: "github_caio_s",
          fallback: "Lead",
        })
      ).toBe("Caio S");

      expect(
        resolveAutoName({
          providedName: null,
          email: "5527999999999@gmail.com",
          identifier: "user_5527999999999",
          fallback: "Lead",
        })
      ).toBe("Lead");
    });
  });
});

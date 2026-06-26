import { afterEach, describe, expect, it } from "vitest";
import { emailConfigured, publicUrl, sendEmail } from "./email";

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.GLANCEOS_PUBLIC_URL;
});

describe("email mailer", () => {
  it("is inert without a backend: not configured, sendEmail no-ops to false, never throws", async () => {
    expect(emailConfigured()).toBe(false);
    await expect(sendEmail("a@b.com", "Hi", { text: "yo" })).resolves.toBe(false);
  });

  it("reports configured once a backend env is present", () => {
    process.env.RESEND_API_KEY = "re_test";
    expect(emailConfigured()).toBe(true);
    delete process.env.RESEND_API_KEY;
    process.env.SMTP_HOST = "smtp.example.com";
    expect(emailConfigured()).toBe(true);
  });

  it("builds absolute links from GLANCEOS_PUBLIC_URL (trailing slash tolerant)", () => {
    process.env.GLANCEOS_PUBLIC_URL = "https://glance.example/";
    expect(publicUrl("/invite/abc")).toBe("https://glance.example/invite/abc");
    expect(publicUrl("invite/abc")).toBe("https://glance.example/invite/abc");
    expect(publicUrl()).toBe("https://glance.example");
  });

  it("falls back to localhost when no public URL is set", () => {
    expect(publicUrl("/x")).toBe("http://localhost:8080/x");
  });
});

import { describe, expect, it } from "bun:test";
import { parseAddressList, parseSendMailInput } from "../src/send/sendMail";

describe("send input helpers", () => {
  it("parses comma-separated addresses", () => {
    const parsed = parseAddressList("a@example.com, b@example.com");
    expect(parsed).toEqual(["a@example.com", "b@example.com"]);
  });

  it("rejects invalid email addresses", () => {
    expect(() => parseAddressList("not-an-email")).toThrow();
  });

  it("requires either text or html body", () => {
    expect(() =>
      parseSendMailInput({
        to: ["to@example.com"],
        subject: "Hello"
      })
    ).toThrow();

    const accepted = parseSendMailInput({
      to: ["to@example.com"],
      subject: "Hello",
      text: "Body"
    });

    expect(accepted.subject).toBe("Hello");
  });
});

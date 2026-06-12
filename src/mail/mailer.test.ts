// src/mail/mailer.test.ts
import { expect, test, describe } from "bun:test";
import { makeMailer, type Transport } from "./mailer";

function fakeTransport(): Transport & { sent: any[]; fail?: boolean } {
  const t: any = {
    sent: [],
    async sendMail(msg: any) {
      if (t.fail) throw new Error("smtp down");
      t.sent.push(msg);
      return { messageId: "x" };
    },
  };
  return t;
}

describe("mailer (best-effort)", () => {
  test("sends with configured from", async () => {
    const tr = fakeTransport();
    const mail = makeMailer(tr, "From <f@k.com>");
    await mail.send("to@k.com", "Konu", "<p>gövde</p>");
    expect(tr.sent.length).toBe(1);
    expect(tr.sent[0].from).toBe("From <f@k.com>");
    expect(tr.sent[0].to).toBe("to@k.com");
  });
  test("swallows transport errors (does not throw)", async () => {
    const tr = fakeTransport();
    tr.fail = true;
    const mail = makeMailer(tr, "From <f@k.com>");
    await expect(mail.send("to@k.com", "s", "b")).resolves.toBeUndefined();
  });
});

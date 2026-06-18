import { expect, test } from "bun:test";
import { collectRecipients } from "./recipients";

test("dedups + lowercases requester and subscribers", () => {
  const r = collectRecipients({
    requesterEmail: "A@x.com",
    subscribers: ["a@x.com", "B@x.com"],
    includeRequester: true,
    includeSubscribers: true,
  });
  expect(r.sort()).toEqual(["a@x.com", "b@x.com"]);
});
test("exclude removes the actor", () => {
  const r = collectRecipients({
    requesterEmail: "a@x.com",
    subscribers: ["b@x.com"],
    includeRequester: true,
    includeSubscribers: true,
    excludeEmail: "a@x.com",
  });
  expect(r).toEqual(["b@x.com"]);
});
test("flags control inclusion", () => {
  expect(collectRecipients({ requesterEmail: "a@x.com", subscribers: ["b@x.com"] })).toEqual([]);
  expect(
    collectRecipients({ requesterEmail: "a@x.com", subscribers: [], includeRequester: true }),
  ).toEqual(["a@x.com"]);
  expect(
    collectRecipients({
      requesterEmail: "a@x.com",
      subscribers: ["b@x.com"],
      includeSubscribers: true,
    }),
  ).toEqual(["b@x.com"]);
});

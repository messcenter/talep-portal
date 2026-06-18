import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { RequestCard, type RequestRow } from "./RequestCard";

const row: RequestRow = {
  id: 1,
  request_no: "TALEP-0001",
  created_at: "2026-06-10T00:00:00.000Z",
  requester_name: "A",
  requester_email: "a@k.com",
  department: "d",
  application: "ERP",
  module_area: "",
  request_type: "feature",
  title: "Başlık",
  description: "d",
  expected_benefit: "b",
  priority: "high",
  status: "accepted",
};

test("RequestCard shows status badge by default", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter><RequestCard r={row} /></MemoryRouter>,
  );
  expect(html).toContain("Kabul edildi");
});

test("RequestCard hides status badge when showStatus=false", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter><RequestCard r={row} showStatus={false} /></MemoryRouter>,
  );
  expect(html).not.toContain("Kabul edildi");
});

test("RequestCard hides requester by default", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter><RequestCard r={row} /></MemoryRouter>,
  );
  expect(html).not.toContain("Açan:");
});

test("RequestCard shows requester name when showRequester=true", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter><RequestCard r={row} showRequester /></MemoryRouter>,
  );
  expect(html).toContain("Açan:");
  expect(html).toContain("A");
});

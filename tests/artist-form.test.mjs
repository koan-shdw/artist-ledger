import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

// Exercise the actual form handler, including its async save and failure paths.
const source = fs.readFileSync("app/components/ledger-app.tsx", "utf8");
const ast = ts.createSourceFile(
  "ledger-app.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let handler;
function visit(node) {
  if (
    ts.isJsxOpeningElement(node) &&
    node.tagName.getText(ast) === "form" &&
    node.attributes.properties.some(
      (a) =>
        a.name?.getText(ast) === "className" &&
        a.initializer?.text === "form-grid",
    )
  ) {
    handler = node.attributes.properties
      .find((a) => a.name?.getText(ast) === "onSubmit")
      .initializer.expression.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handler, "Artist form submit handler exists");
const js = ts.transpileModule(`const submit=${handler};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(persist) {
  const state = { closed: false, saving: false, error: "" };
  const artist = {
    id: "mark",
    name: "Mark",
    email: "mark@example.com",
    galleryBps: 3500,
    enabled: true,
  };
  const data = {
    artists: [
      { ...artist, email: "", galleryBps: 0, agreementConfigured: false },
    ],
    products: [],
    months: {},
    settings: {},
  };
  const submit = new Function(
    "editing",
    "data",
    "busy",
    "artistSaving",
    "setArtistSaving",
    "setArtistError",
    "persist",
    "setEditing",
    "linkVendorProducts",
    js + "return submit;",
  )(
    artist,
    data,
    false,
    false,
    (v) => (state.saving = v),
    (v) => (state.error = v),
    persist,
    (v) => (state.closed = v === null),
    (p) => p,
  );
  return { state, submit };
}
test("artist form persists email and agreement before closing", async () => {
  let resolveSave, saved;
  const h = harness((value) => {
    saved = value;
    return new Promise((resolve) => (resolveSave = resolve));
  });
  const pending = h.submit({ preventDefault() {} });
  assert.equal(saved.artists[0].email, "mark@example.com");
  assert.equal(saved.artists[0].galleryBps, 3500);
  assert.equal(saved.artists[0].agreementConfigured, true);
  assert.equal(h.state.closed, false);
  assert.equal(h.state.saving, true);
  resolveSave();
  await pending;
  assert.equal(h.state.closed, true);
  assert.equal(h.state.saving, false);
});
test("failed artist save keeps form open and displays the failure", async () => {
  const h = harness(async () => {
    throw Error("Save failed");
  });
  await h.submit({ preventDefault() {} });
  assert.equal(h.state.closed, false);
  assert.equal(h.state.error, "Save failed");
  assert.equal(h.state.saving, false);
});

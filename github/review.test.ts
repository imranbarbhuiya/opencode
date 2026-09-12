import assert from "node:assert/strict"
import { parseReviewActions, parseReviewComments } from "./review"

assert.deepEqual(parseReviewComments("Looks good."), {
  summary: "Looks good.",
  comments: [],
})

const parsed = parseReviewComments(`Two issues.

**High** \`src/a.ts:10\`

Null deref.

\`\`\`suggestion
value?.ok
\`\`\`

**Low** \`src/b.ts:3\`

Unused import.`)

assert.equal(parsed.summary, "Two issues.")
assert.deepEqual(parsed.comments, [
  {
    path: "src/a.ts",
    line: 10,
    body: `**High** \`src/a.ts:10\`

Null deref.

\`\`\`suggestion
value?.ok
\`\`\``,
  },
  {
    path: "src/b.ts",
    line: 3,
    body: `**Low** \`src/b.ts:3\`

Unused import.`,
  },
])

const actions = parseReviewActions(`Done.

\`\`\`opencode-review
{"summary":"Left one open.","resolve":["PRRT_1"],"update":[{"databaseId":9,"body":"**Low** \`a.ts:1\`\\nUpdated."}],"comments":[{"path":"b.ts","line":4,"body":"**Medium** \`b.ts:4\`\\nNew."}]}
\`\`\``)

assert.deepEqual(actions, {
  summary: "Left one open.",
  resolve: ["PRRT_1"],
  update: [{ databaseId: 9, body: "**Low** `a.ts:1`\nUpdated." }],
  comments: [{ path: "b.ts", line: 4, body: "**Medium** `b.ts:4`\nNew." }],
})

const fallback = parseReviewActions(`RESOLVE PRRT_2

**Low** \`c.ts:8\`

Nit.`)

assert.deepEqual(fallback.resolve, ["PRRT_2"])
assert.deepEqual(fallback.update, [])
assert.deepEqual(fallback.comments, [
  {
    path: "c.ts",
    line: 8,
    body: `**Low** \`c.ts:8\`

Nit.`,
  },
])

console.log("ok")

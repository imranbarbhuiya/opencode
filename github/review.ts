export type ReviewComment = {
  path: string
  line: number
  body: string
}

export type ParsedReview = {
  summary: string
  comments: ReviewComment[]
}

export type ReviewThread = {
  id: string
  isResolved: boolean
  isOutdated: boolean
  comments: Array<{
    databaseId: number
    body: string
    path: string
    line: number | null
    originalLine: number | null
    author: string
  }>
}

export type ReviewActions = ParsedReview & {
  resolve: string[]
  update: Array<{ databaseId: number; body: string }>
}

const REVIEW_COMMENT_RE = /^\*\*(High|Medium|Low)\*\* `([^`\n]+):(\d+)`\s*$/gm

function asReviewComment(value: unknown): ReviewComment | undefined {
  if (!value || typeof value !== "object") return
  const comment = value as Partial<ReviewComment>
  if (typeof comment.path !== "string" || typeof comment.body !== "string") return
  const line = Number(comment.line)
  if (!Number.isInteger(line) || line < 1) return
  return { path: comment.path, line, body: comment.body }
}

function asReviewUpdate(value: unknown): { databaseId: number; body: string } | undefined {
  if (!value || typeof value !== "object") return
  const update = value as { databaseId?: unknown; body?: unknown }
  const databaseId = Number(update.databaseId)
  if (!Number.isInteger(databaseId) || databaseId < 1 || typeof update.body !== "string") return
  return { databaseId, body: update.body }
}

export function parseReviewComments(text: string): ParsedReview {
  const matches = [...text.matchAll(REVIEW_COMMENT_RE)]
  if (matches.length === 0) return { summary: text.trim(), comments: [] }

  return {
    summary: text.slice(0, matches[0]?.index ?? 0).trim(),
    comments: matches.flatMap((match, i) => {
      const path = match[2]
      const line = Number(match[3])
      if (!path || !Number.isInteger(line)) return []
      const end = matches[i + 1]?.index ?? text.length
      return [{ path, line, body: text.slice(match.index ?? 0, end).trim() }]
    }),
  }
}

export function parseReviewActions(text: string): ReviewActions {
  const fence = text.match(/```opencode-review\s*([\s\S]*?)```/)
  if (fence?.[1] != null) {
    try {
      const json = JSON.parse(fence[1]) as {
        summary?: unknown
        comments?: unknown
        resolve?: unknown
        update?: unknown
      }
      const parsed = parseReviewComments(text.replace(fence[0], "").trim())
      return {
        summary: typeof json.summary === "string" ? json.summary : parsed.summary,
        comments: Array.isArray(json.comments)
          ? json.comments.flatMap((comment) => {
              const next = asReviewComment(comment)
              return next ? [next] : []
            })
          : parsed.comments,
        resolve: Array.isArray(json.resolve) ? json.resolve.filter((id): id is string => typeof id === "string") : [],
        update: Array.isArray(json.update)
          ? json.update.flatMap((item) => {
              const next = asReviewUpdate(item)
              return next ? [next] : []
            })
          : [],
      }
    } catch {}
  }

  const parsed = parseReviewComments(text)
  return {
    ...parsed,
    resolve: [...text.matchAll(/^RESOLVE\s+(\S+)\s*$/gm)].flatMap((match) => (match[1] ? [match[1]] : [])),
    update: [],
  }
}

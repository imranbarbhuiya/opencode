import type { SessionV1 } from "@opencode-ai/core/v1/session"

export { parseGitHubRemote } from "@/util/repository"

/**
 * Extracts displayable text from assistant response parts.
 * Returns null for non-text responses (signals summary needed).
 * Throws only for truly empty responses.
 */
export function extractResponseText(parts: SessionV1.Part[]): string | null {
  const textPart = parts.findLast((p) => p.type === "text")
  if (textPart) return textPart.text

  // Non-text parts (tools, reasoning, step-start/step-finish, etc.) - signal summary needed
  if (parts.length > 0) return null

  throw new Error("Failed to parse response: no parts returned")
}

/**
 * Formats a PROMPT_TOO_LARGE error message with details about files in the prompt.
 * Content is base64 encoded, so we calculate original size by multiplying by 0.75.
 */
export type ReviewComment = {
  path: string
  line: number
  body: string
}

export type ParsedReview = {
  summary: string
  comments: ReviewComment[]
}

const REVIEW_COMMENT_RE = /^\*\*(High|Medium|Low)\*\* `([^`\n]+):(\d+)`\s*$/gm

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

export function parseReviewActions(text: string): ReviewActions {
  const fence = text.match(/```opencode-review\s*([\s\S]*?)```/)
  if (fence) {
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
    resolve: [...text.matchAll(/^RESOLVE\s+(\S+)\s*$/gm)].map((match) => match[1]),
    update: [],
  }
}

export function parseReviewComments(text: string): ParsedReview {
  const matches = [...text.matchAll(REVIEW_COMMENT_RE)]
  if (matches.length === 0) return { summary: text.trim(), comments: [] }

  const comments: ReviewComment[] = []
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const start = match.index ?? 0
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length
    comments.push({
      path: match[2],
      line: Number(match[3]),
      body: text.slice(start, end).trim(),
    })
  }

  return {
    summary: text.slice(0, matches[0].index ?? 0).trim(),
    comments,
  }
}

export function formatPromptTooLargeError(files: { filename: string; content: string }[]): string {
  const fileDetails =
    files.length > 0
      ? `\n\nFiles in prompt:\n${files.map((f) => `  - ${f.filename} (${((f.content.length * 0.75) / 1024).toFixed(0)} KB)`).join("\n")}`
      : ""
  return `PROMPT_TOO_LARGE: The prompt exceeds the model's context limit.${fileDetails}`
}

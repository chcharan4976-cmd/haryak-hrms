/**
 * Haryak HRMS — Safe API Client & Response Parsing Utility
 *
 * Prevents "SyntaxError: Unexpected end of JSON input" and unhandled non-JSON responses across the entire application.
 *
 * Guarantees:
 * - Checks response.ok and HTTP status codes before parsing.
 * - Handles 204 No Content and 205 Reset Content gracefully (returns ok: true, data: null).
 * - Inspects Content-Type header to ensure response is JSON before attempting parse.
 * - Inspects raw text body first; handles empty strings and whitespace without throwing SyntaxError.
 * - Captures malformed JSON, HTML error pages, and plain-text 500s into structured error messages.
 * - Traps network failures in safeFetchJson without unhandled promise rejections.
 */

export interface SafeParseResult<T = any> {
  ok: boolean
  status: number
  data: T | null
  error?: string
}

/**
 * Safely parses a Fetch Response:
 * - Handles 204 No Content or 205 Reset Content (returns ok: true, data: null).
 * - Handles empty response bodies cleanly.
 * - Rejects non-JSON Content-Types with clear, actionable diagnostics.
 * - Safely executes JSON.parse on non-empty body text.
 */
export async function safeParseResponse<T = any>(
  response: Response
): Promise<SafeParseResult<T>> {
  const status = response.status
  const ok = response.ok

  // 1. Status 204 No Content and 205 Reset Content: valid success without body
  if (status === 204 || status === 205) {
    return { ok, status, data: null }
  }

  // 2. Read body as text first to inspect content before parsing
  let text = ''
  try {
    text = await response.text()
  } catch (err: any) {
    return {
      ok: false,
      status,
      data: null,
      error: `Failed to read response body: ${err?.message || 'Network stream error'}`,
    }
  }

  const trimmed = text.trim()
  if (!trimmed) {
    // Empty body received (e.g. empty 200, or empty 500 error from upstream)
    return {
      ok,
      status,
      data: null,
      error: ok ? undefined : `Server returned HTTP ${status} with an empty response body.`,
    }
  }

  // 3. Inspect Content-Type header
  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json') || contentType.includes('+json')

  if (!isJson) {
    // Non-JSON response (e.g., HTML error page, plain text 500)
    const preview = trimmed.length > 120 ? `${trimmed.slice(0, 120)}...` : trimmed
    return {
      ok: false,
      status,
      data: null,
      error: `Expected JSON response from server, but received ${contentType || 'non-JSON format'} (HTTP ${status}): ${preview}`,
    }
  }

  // 4. Parse JSON safely
  try {
    const data = JSON.parse(trimmed) as T
    const dataError =
      data && typeof data === 'object' && ('error' in (data as any) || 'message' in (data as any))
        ? (data as any).error || (data as any).message
        : undefined

    return {
      ok,
      status,
      data,
      error: ok ? undefined : (dataError || `HTTP ${status}`),
    }
  } catch (err: any) {
    return {
      ok: false,
      status,
      data: null,
      error: `Malformed JSON response from server (HTTP ${status}): ${err?.message || 'Invalid JSON syntax'}`,
    }
  }
}

/**
 * Performs a fetch and safely parses the response, catching network errors as well.
 */
export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<SafeParseResult<T>> {
  try {
    const response = await fetch(input, init)
    return await safeParseResponse<T>(response)
  } catch (networkErr: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: `Network request failed: ${networkErr?.message || 'Connection error'}`,
    }
  }
}

/**
 * Helper to safely extract JSON data or default value without throwing.
 */
export async function parseJsonResponse<T = any>(
  response: Response,
  defaultValue: T | null = null
): Promise<T | null> {
  const result = await safeParseResponse<T>(response)
  return result.ok && result.data !== null ? result.data : defaultValue
}

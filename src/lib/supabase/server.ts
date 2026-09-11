import {
  createServerClient,
  type CookieOptions,
} from '@supabase/ssr'

import { cookies } from 'next/headers'

export interface SupabaseCookieToSet {
  name: string
  value: string
  options?: CookieOptions
}

export interface ServerSupabaseOptions {
  /**
   * Optional callback used by Route Handlers that need to capture
   * the exact Supabase auth cookies and attach them to their own
   * NextResponse.
   */
  onSetCookies?: (
    cookies: SupabaseCookieToSet[]
  ) => void
}

/**
 * In-memory fallback used only outside a real Next.js request
 * context such as isolated scripts/tests.
 *
 * Never treat this fallback as a real browser authentication
 * session.
 */
const fallbackCookieJar =
  new Map<string, string>()

/**
 * Canonical server-side Supabase client.
 *
 * Works with:
 * - Route Handlers
 * - Server Components
 * - Server Actions
 * - authentication service
 *
 * In Route Handlers, cookie writes are also exposed through
 * onSetCookies so the caller can attach the exact cookies,
 * including options, to its NextResponse.
 */
export async function createClient(
  options: ServerSupabaseOptions = {}
) {
  let cookieStore:
    Awaited<ReturnType<typeof cookies>> | null =
      null

  try {
    cookieStore =
      await cookies()
  } catch {
    cookieStore =
      null
  }

  const url =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL

  const anonKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Supabase environment configuration is missing.'
    )
  }

  if (cookieStore) {
    return createServerClient(
      url,
      anonKey,
      {
        cookies: {
          getAll() {
            return cookieStore!
              .getAll()
          },

          setAll(
            cookiesToSet
          ) {
            /**
             * Always report exact cookies to the caller first.
             *
             * This is important for login Route Handlers because
             * the NextResponse must receive the Supabase cookies.
             */
            options.onSetCookies?.(
              cookiesToSet
            )

            /**
             * Also try to update the Next.js cookie store.
             *
             * This works in Route Handlers / Server Actions.
             * Server Components may reject mutation, which is fine.
             */
            try {
              cookiesToSet.forEach(
                ({
                  name,
                  value,
                  options:
                    cookieOptions,
                }) => {
                  cookieStore!.set(
                    name,
                    value,
                    cookieOptions
                  )
                }
              )
            } catch {
              /**
               * Cookie mutation is not permitted in all server
               * rendering contexts.
               *
               * Middleware or the Route Handler response is
               * responsible for propagating refreshed cookies.
               */
            }
          },
        },
      }
    )
  }

  /**
   * Non-request fallback.
   */
  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return Array.from(
            fallbackCookieJar.entries()
          ).map(
            ([name, value]) => ({
              name,
              value,
            })
          )
        },

        setAll(
          cookiesToSet
        ) {
          options.onSetCookies?.(
            cookiesToSet
          )

          cookiesToSet.forEach(
            ({
              name,
              value,
            }) => {
              if (value) {
                fallbackCookieJar.set(
                  name,
                  value
                )
              } else {
                fallbackCookieJar.delete(
                  name
                )
              }
            }
          )
        },
      },
    }
  )
}
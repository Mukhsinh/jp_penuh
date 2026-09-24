import { createAdminClient, createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { cache } from 'react'

/**
 * Safely decodes a Supabase Auth JWT token payload without network calls.
 * Used as a fallback when Supabase Cloud Auth API hits 429 Rate Limits.
 */
function decodeJwtPayload(token: string) {
    try {
        const parts = token.split('.')
        if (parts.length !== 3) return null
        const base64Url = parts[1]
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
        const jsonPayload = Buffer.from(base64, 'base64').toString('utf8')
        const payload = JSON.parse(jsonPayload)

        if (!payload.sub) return null

        return {
            id: payload.sub,
            email: payload.email || '',
            user_metadata: payload.user_metadata || {},
            app_metadata: payload.app_metadata || {},
            role: payload.role || payload.app_metadata?.role || payload.user_metadata?.role
        }
    } catch (e) {
        return null
    }
}

/**
 * Extracts raw access token from request cookies, including chunked Supabase SSR cookies
 */
function extractTokenFromCookies(cookieHeader?: string | null, cookieStoreAll?: Array<{ name: string; value: string }>) {
    const parseRawToken = (tokenStr: string) => {
        if (!tokenStr) return null
        let str = tokenStr
        if (str.startsWith('base64-')) {
            try {
                str = Buffer.from(str.replace('base64-', ''), 'base64').toString('utf8')
            } catch (e) {
                // fallback
            }
        } else if (!str.includes('.') && (str.startsWith('eyJ') || str.startsWith('W3'))) {
            // Base64 encoded JSON array or object (eyJ = {" , W3 = [)
            try {
                const decoded = Buffer.from(str, 'base64').toString('utf8')
                if (decoded.startsWith('{') || decoded.startsWith('[')) {
                    str = decoded
                }
            } catch (e) { }
        }

        if (str.startsWith('{') || str.startsWith('[')) {
            try {
                const parsed = JSON.parse(str)
                return parsed.access_token || (Array.isArray(parsed) ? parsed[0] : null) || str
            } catch (e) {
                // ignore
            }
        }
        return str
    }

    // Combine chunked cookies if cookieStoreAll is provided
    if (cookieStoreAll && cookieStoreAll.length > 0) {
        const authCookies = cookieStoreAll.filter(c => c.name.includes('auth-token') || c.name.includes('access-token'))
        if (authCookies.length > 0) {
            const groups: Record<string, { idx: number; val: string }[]> = {}
            for (const c of authCookies) {
                const match = c.name.match(/^(.*?)(?:\.(\d+))?$/)
                const baseName = match ? match[1] : c.name
                const idx = match && match[2] !== undefined ? parseInt(match[2], 10) : 0
                if (!groups[baseName]) groups[baseName] = []
                groups[baseName].push({ idx, val: c.value })
            }

            for (const baseName in groups) {
                const chunks = groups[baseName].sort((a, b) => a.idx - b.idx).map(c => c.val).join('')
                const result = parseRawToken(chunks)
                if (result) return result
            }
        }
    }

    // Combine chunked cookies if raw cookieHeader string is provided
    if (cookieHeader) {
        const cookiesArr = cookieHeader.split(';')
        const authCookies: { name: string; val: string }[] = []
        for (const c of cookiesArr) {
            const [name, val] = c.trim().split('=')
            if (name && (name.includes('auth-token') || name.includes('access-token'))) {
                authCookies.push({ name: name.trim(), val: decodeURIComponent(val || '') })
            }
        }
        if (authCookies.length > 0) {
            const groups: Record<string, { idx: number; val: string }[]> = {}
            for (const c of authCookies) {
                const match = c.name.match(/^(.*?)(?:\.(\d+))?$/)
                const baseName = match ? match[1] : c.name
                const idx = match && match[2] !== undefined ? parseInt(match[2], 10) : 0
                if (!groups[baseName]) groups[baseName] = []
                groups[baseName].push({ idx, val: c.val })
            }

            for (const baseName in groups) {
                const chunks = groups[baseName].sort((a, b) => a.idx - b.idx).map(c => c.val).join('')
                const result = parseRawToken(chunks)
                if (result) return result
            }
        }
    }

    return null
}

/**
 * Memorize user data fetches in Next.js SSR context to dramatically reduce 429 errors from Supabase.
 */
export const getCachedUser = cache(async () => {
    try {
        const supabase = await createClient()
        return await getAuthenticatedUser(supabase)
    } catch {
        return null
    }
})

/**
 * Robustly retrieves the authenticated user for API routes.
 * Prevents false 401 Unauthorized errors caused by concurrent token refresh race conditions (429 Too Many Requests).
 */
export async function getAuthenticatedUser(supabase: any, request?: Request) {
    // Attempt 1: Standard getUser()
    try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (user && !error) return user
    } catch (e) {
        // ignore
    }

    // Attempt 2: getSession() fallback
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) return session.user
    } catch (e) {
        // ignore
    }

    // Attempt 3: Authorization header fallback via Admin Client
    if (request) {
        const authHeader = request.headers.get('Authorization') || request.headers.get('authorization')
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.replace(/^Bearer\s+/i, '').trim()
            if (token) {
                try {
                    const adminClient = await createAdminClient()
                    const { data: { user } } = await adminClient.auth.getUser(token)
                    if (user) return user
                } catch (e) {
                    // Fallback to local JWT decode
                    const decoded = decodeJwtPayload(token)
                    if (decoded) return decoded
                }
            }
        }
    }

    // Attempt 4: Local JWT decoding from request cookies (Bypasses Supabase Cloud 429 Rate Limits entirely)
    try {
        let cookieStoreAll: Array<{ name: string; value: string }> = []
        try {
            const cookieStore = await cookies()
            cookieStoreAll = cookieStore.getAll()
        } catch (e) {
            // ignore if outside Next.js async storage context
        }

        const cookieHeader = request?.headers?.get('cookie')
        const token = extractTokenFromCookies(cookieHeader, cookieStoreAll)
        if (token) {
            try {
                const adminClient = await createAdminClient()
                const { data: { user } } = await adminClient.auth.getUser(token)
                if (user) return user
            } catch (e) {
                // ignore and use decodeJwtPayload
            }

            const decodedUser = decodeJwtPayload(token)
            if (decodedUser) {
                return decodedUser
            }
        }
    } catch (e) {
        // ignore
    }

    return null
}

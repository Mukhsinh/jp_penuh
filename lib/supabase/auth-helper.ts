import { createAdminClient, createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { cache } from 'react'

/**
 * Safely decodes a Supabase Auth JWT token payload without network calls.
 * Used as a fallback when Supabase Cloud Auth API hits 429 Rate Limits.
 */
export function decodeJwtPayload(token: string) {
    try {
        if (!token) return null
        const parts = token.split('.')
        if (parts.length !== 3) return null
        const base64Url = parts[1]
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
        const jsonPayload = Buffer.from(base64, 'base64').toString('utf8')
        const payload = JSON.parse(jsonPayload)

        if (!payload.sub) return null

        // Expiration check
        if (payload.exp && payload.exp * 1000 < Date.now()) {
            return null
        }

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
export function extractTokenFromCookies(cookieHeader?: string | null, cookieStoreAll?: Array<{ name: string; value: string }>) {
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
        return await getAuthenticatedUser()
    } catch {
        return null
    }
})

/**
 * Robustly retrieves the authenticated user for API routes & layouts.
 * Prioritizes local JWT token decoding to eliminate 429 (Request rate limit reached) errors entirely.
 */
export async function getAuthenticatedUser(supabase?: any, request?: Request) {
    // Attempt 1: Fast local JWT decoding from cookies or Authorization header (0ms network cost)
    try {
        let cookieStoreAll: Array<{ name: string; value: string }> = []
        try {
            const cookieStore = await cookies()
            cookieStoreAll = cookieStore.getAll()
        } catch (e) {
            // ignore if outside Next.js cookies context
        }

        const cookieHeader = request?.headers?.get('cookie')
        const authHeader = request?.headers?.get('Authorization') || request?.headers?.get('authorization')
        let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '').trim() : null

        if (!token) {
            token = extractTokenFromCookies(cookieHeader, cookieStoreAll)
        }

        if (token) {
            const decodedUser = decodeJwtPayload(token)
            if (decodedUser) {
                return decodedUser
            }
        }
    } catch (e) {
        // ignore
    }

    // Attempt 2: Standard getUser() via Supabase client (only if local JWT decoding wasn't sufficient)
    if (supabase) {
        try {
            const { data: { user }, error } = await supabase.auth.getUser()
            if (user && !error) return user
        } catch (e) {
            // ignore
        }

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user) return session.user
        } catch (e) {
            // ignore
        }
    } else {
        try {
            const serverClient = await createClient()
            const { data: { user }, error } = await serverClient.auth.getUser()
            if (user && !error) return user
        } catch (e) {
            // ignore
        }
    }

    return null
}

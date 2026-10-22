import { type Role } from './rbac.service'

export interface RouteConfig {
  path: string
  allowedRoles: Role[]
  description: string
}

// Route configurations mapping paths to allowed roles
export const routeConfigs: RouteConfig[] = [
  // Dashboard - accessible by all roles
  {
    path: '/dashboard',
    allowedRoles: ['superadmin', 'unit_manager', 'employee'],
    description: 'Dashboard (role-specific content)'
  },

  // Superadmin only routes
  {
    path: '/units',
    allowedRoles: ['superadmin'],
    description: 'Unit management'
  },
  {
    path: '/users',
    allowedRoles: ['superadmin'],
    description: 'User management'
  },
  {
    path: '/pegawai',
    allowedRoles: ['superadmin'],
    description: 'Employee master data'
  },
  {
    path: '/kpi-config',
    allowedRoles: ['superadmin', 'unit_manager'],
    description: 'KPI configuration'
  },
  {
    path: '/pool',
    allowedRoles: ['superadmin', 'unit_manager'],
    description: 'Pool management'
  },
  {
    path: '/reports',
    allowedRoles: ['superadmin', 'unit_manager'],
    description: 'Reports and analytics'
  },
  {
    path: '/audit',
    allowedRoles: ['superadmin'],
    description: 'Audit trail'
  },
  {
    path: '/settings',
    allowedRoles: ['superadmin'],
    description: 'System settings'
  },

  {
    path: '/assessment',
    allowedRoles: ['superadmin', 'unit_manager'],
    description: 'KPI assessment and evaluation'
  },

  // Shared routes
  {
    path: '/profile',
    allowedRoles: ['superadmin', 'unit_manager'],
    description: 'User profile'
  },
  {
    path: '/notifications',
    allowedRoles: ['superadmin'],
    description: 'Notifications'
  }
]

// Legacy route mapping for backward compatibility
export const legacyRoutes: Record<string, string> = {
  '/admin/dashboard': '/dashboard',
  '/manager/dashboard': '/dashboard',
  '/employee/dashboard': '/dashboard',
  '/admin/units': '/units',
  '/admin/users': '/users',
  '/admin/pegawai': '/pegawai',
  '/admin/kpi-config': '/kpi-config',
  '/admin/pool': '/pool',
  '/admin/reports': '/reports',
  '/admin/audit': '/audit',
  '/admin/settings': '/settings',
  '/assesment': '/assessment',
}

/**
 * Find route configuration for a given pathname
 * Checks exact match first, then prefix match for nested routes
 */
export function findRouteConfig(pathname: string): RouteConfig | undefined {
  // Find exact match first
  let config = routeConfigs.find(rc => pathname === rc.path)
  if (config) return config

  // Find prefix match (for nested routes like /units/123)
  config = routeConfigs.find(rc => pathname.startsWith(rc.path + '/'))
  return config
}

/**
 * Check if a route is allowed for a specific role
 */
export function isRouteAllowed(pathname: string, role: Role): boolean {
  const config = findRouteConfig(pathname)

  // If route is not defined in config, allow access (default behavior)
  if (!config) return true

  return config.allowedRoles.includes(role)
}

/**
 * Check if a path is a legacy route that needs redirection
 */
export function isLegacyRoute(pathname: string): boolean {
  return pathname in legacyRoutes
}

/**
 * Get the new path for a legacy route
 */
export function getLegacyRedirectPath(pathname: string): string | undefined {
  return legacyRoutes[pathname]
}

/**
 * Public routes that don't require authentication
 */
export const publicRoutes = [
  '/login',
  '/reset-password',
  '/forbidden'
]

/**
 * Check if a route is public (doesn't require authentication)
 */
export function isPublicRoute(pathname: string): boolean {
  return publicRoutes.includes(pathname)
}

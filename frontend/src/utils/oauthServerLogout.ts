/**
 * OAuth Server Logout Utility
 * Handles logout from OAuth server to enable different user login
 */

export async function logoutFromOAuthServer(): Promise<boolean> {
  try {
    const authServerUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
    
    // Try multiple logout endpoints
    const logoutEndpoints = [
      `${authServerUrl}/api/oauth/logout`,
      `${authServerUrl}/logout`,
      `${authServerUrl}/api/auth/logout`,
    ];

    for (const endpoint of logoutEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include', // Include cookies
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          console.log(`✅ OAuth server logout successful: ${endpoint}`);
          return true;
        }
      } catch (e) {
        console.warn(`Failed to logout from ${endpoint}:`, e);
      }
    }

    // If no logout endpoint works, try clearing cookies manually
    document.cookie.split(";").forEach(c => {
      const eqPos = c.indexOf("=");
      const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
      // Clear cookies that might be from OAuth server
      if (name.includes('session') || name.includes('auth')) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=localhost`;
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.localhost`;
      }
    });

    return false;
  } catch (error) {
    console.error('OAuth server logout error:', error);
    return false;
  }
}

/**
 * Opens OAuth server in new tab for manual logout
 */
export function openOAuthServerForLogout() {
  const authServerUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
  const logoutUrl = `${authServerUrl}/logout`;
  
  window.open(logoutUrl, '_blank');
}
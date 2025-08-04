/**
 * OAuth Return Flow Handler
 * Handles the OAuth return flow when user is redirected from OAuth server to login page
 */

export interface OAuthReturnParams {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
  code_challenge?: string;
  code_challenge_method?: string;
  nonce?: string;
  prompt?: string;
  max_age?: string;
}

export class OAuthReturnHandler {
  private static STORAGE_KEY = 'pending_oauth_params';
  private static FLOW_FLAG = 'oauth_return_flow';

  /**
   * Check if we're in an OAuth return flow
   */
  static isOAuthReturnFlow(): boolean {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.has('oauth_return') || sessionStorage.getItem(this.FLOW_FLAG) === 'true';
  }

  /**
   * Parse OAuth return parameters from URL
   */
  static parseOAuthReturn(): OAuthReturnParams | null {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const oauthReturn = urlParams.get('oauth_return');
      
      if (!oauthReturn) {
        // Check sessionStorage for pending params
        const pendingParams = sessionStorage.getItem(this.STORAGE_KEY);
        if (pendingParams) {
          return JSON.parse(pendingParams);
        }
        return null;
      }

      // Decode and parse OAuth parameters
      const decodedReturn = decodeURIComponent(oauthReturn);
      const oauthParams = JSON.parse(decodedReturn) as OAuthReturnParams;
      
      // Store in sessionStorage for persistence
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(oauthParams));
      sessionStorage.setItem(this.FLOW_FLAG, 'true');
      
      return oauthParams;
    } catch (error) {
      console.error('Failed to parse OAuth return parameters:', error);
      return null;
    }
  }

  /**
   * Continue OAuth flow after successful login
   */
  static continueOAuthFlow(): void {
    const params = this.parseOAuthReturn();
    if (!params) {
      console.error('No OAuth parameters found to continue flow');
      return;
    }

    console.log('🔄 Continuing OAuth flow with parameters:', params);

    // Clear the stored parameters
    sessionStorage.removeItem(this.STORAGE_KEY);
    sessionStorage.removeItem(this.FLOW_FLAG);

    // Reconstruct OAuth authorize URL
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value);
      }
    });

    const oauthUrl = `http://localhost:8000/api/oauth/authorize?${queryParams.toString()}`;
    
    console.log('🚀 Redirecting to OAuth authorize:', oauthUrl);
    
    // Redirect to OAuth authorize endpoint
    window.location.href = oauthUrl;
  }

  /**
   * Clear OAuth return flow data
   */
  static clearOAuthReturnFlow(): void {
    sessionStorage.removeItem(this.STORAGE_KEY);
    sessionStorage.removeItem(this.FLOW_FLAG);
    
    // Also clear from URL if present
    const url = new URL(window.location.href);
    url.searchParams.delete('oauth_return');
    url.searchParams.delete('force_login');
    window.history.replaceState({}, '', url.toString());
  }

  /**
   * Handle OAuth return flow in login component
   */
  static handleLoginPageLoad(): { isOAuthReturn: boolean; message?: string } {
    if (!this.isOAuthReturnFlow()) {
      return { isOAuthReturn: false };
    }

    const params = this.parseOAuthReturn();
    if (!params) {
      return { isOAuthReturn: false };
    }

    // Check if this is a forced login
    const urlParams = new URLSearchParams(window.location.search);
    const forceLogin = urlParams.get('force_login') === 'true';

    if (forceLogin) {
      return {
        isOAuthReturn: true,
        message: '다른 계정으로 로그인하려면 아래에서 로그인해주세요.'
      };
    }

    return {
      isOAuthReturn: true,
      message: 'MAX Platform으로 로그인해주세요.'
    };
  }
}
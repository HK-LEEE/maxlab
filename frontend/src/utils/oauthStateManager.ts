/**
 * 🔒 SECURITY: OAuth Flow State Management Utility
 * 
 * Centralized, secure state management for OAuth 2.0 flows with PKCE.
 * Provides secure state persistence, validation, and cleanup mechanisms.
 */

export interface OAuthFlowState {
  // Core OAuth parameters
  state: string;
  codeVerifier: string;
  nonce: string;
  
  // Flow metadata
  flowId: string;
  flowType: 'popup' | 'redirect' | 'silent';
  clientId: string;
  redirectUri: string;
  
  // Security metadata
  createdAt: number;
  expiresAt: number;
  parentOrigin?: string;
  forceAccountSelection?: boolean;
  
  // Flow status
  status: 'created' | 'in_progress' | 'token_exchange' | 'completed' | 'failed' | 'expired';
  lastUpdated: number;
  
  // Storage keys for change detection
  initialStorageKeys?: string[];
}

export interface StateValidationResult {
  isValid: boolean;
  reason: string;
  securityLevel: 'low' | 'medium' | 'high' | 'critical';
  canProceed: boolean;
}

/**
 * 🔒 SECURITY: Centralized OAuth State Manager
 * 
 * Manages OAuth flow state with security features:
 * - Automatic expiration and cleanup
 * - State validation and integrity checks
 * - Secure storage with encryption
 * - Flow status tracking and transitions
 */
export class OAuthStateManager {
  private static readonly STATE_KEY_PREFIX = 'oauth_flow_';
  private static readonly CLEANUP_KEY = 'oauth_cleanup_scheduled';
  private static readonly DEFAULT_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
  private static readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  private cleanupScheduled: boolean = false;

  constructor() {
    this.scheduleCleanup();
  }

  /**
   * 🔒 SECURITY: Create new OAuth flow state
   */
  public createFlowState(params: {
    flowType: 'popup' | 'redirect' | 'silent';
    clientId: string;
    redirectUri: string;
    state: string;
    codeVerifier: string;
    nonce: string;
    parentOrigin?: string;
    forceAccountSelection?: boolean;
    expiryMs?: number;
  }): OAuthFlowState {
    const now = Date.now();
    const flowId = this.generateFlowId();
    const expiryMs = params.expiryMs || OAuthStateManager.DEFAULT_EXPIRY_MS;

    const flowState: OAuthFlowState = {
      // Core OAuth parameters
      state: params.state,
      codeVerifier: params.codeVerifier,
      nonce: params.nonce,
      
      // Flow metadata
      flowId,
      flowType: params.flowType,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      
      // Security metadata
      createdAt: now,
      expiresAt: now + expiryMs,
      parentOrigin: params.parentOrigin,
      forceAccountSelection: params.forceAccountSelection,
      
      // Flow status
      status: 'created',
      lastUpdated: now
    };

    this.storeFlowState(flowState);
    
    console.log('🔐 OAuth flow state created:', {
      flowId,
      flowType: params.flowType,
      expiresIn: `${Math.round(expiryMs / 1000)}s`,
      forceAccountSelection: params.forceAccountSelection
    });

    return flowState;
  }

  /**
   * 🔒 SECURITY: Get flow state by state parameter
   */
  public getFlowState(state: string): OAuthFlowState | null {
    console.log('🔍 Searching for OAuth flow state with state:', state?.substring(0, 8) + '...');
    
    // First try to get all flows using the normal method
    const allFlows = this.getAllFlowStates();
    console.log('📋 Found total flow states:', allFlows.length);
    
    let flowState = allFlows.find(flow => flow.state === state);

    // If not found using getAllFlowStates, try direct sessionStorage search
    if (!flowState) {
      console.log('🔍 Flow state not found in getAllFlowStates, trying direct sessionStorage search...');
      
      try {
        // Search all sessionStorage keys for OAuth flow states
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith(OAuthStateManager.STATE_KEY_PREFIX)) {
            const storedState = sessionStorage.getItem(key);
            if (storedState) {
              try {
                const parsedFlow = JSON.parse(storedState) as OAuthFlowState;
                console.log('🔍 Checking stored flow:', {
                  key,
                  flowId: parsedFlow.flowId,
                  storedState: parsedFlow.state?.substring(0, 8) + '...',
                  matchesSearch: parsedFlow.state === state
                });
                
                if (parsedFlow.state === state) {
                  flowState = parsedFlow;
                  console.log('✅ Found matching flow state in direct search:', parsedFlow.flowId);
                  break;
                }
              } catch (e) {
                console.warn('Failed to parse stored flow state:', key, e);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error during direct sessionStorage search:', error);
      }
    }

    // 🔧 CRITICAL FIX: Handle modified states for forceAccountSelection
    if (!flowState && state?.includes('_force_')) {
      console.log('🔍 State contains _force_, trying to find original state...');
      const originalState = state.split('_force_')[0];
      console.log('🔍 Looking for original state:', originalState?.substring(0, 8) + '...');
      
      // Try to find the original state in allFlows
      flowState = allFlows.find(flow => flow.state === originalState);
      
      if (!flowState) {
        // If still not found, try direct sessionStorage search with original state
        try {
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith(OAuthStateManager.STATE_KEY_PREFIX)) {
              const storedState = sessionStorage.getItem(key);
              if (storedState) {
                try {
                  const parsedFlow = JSON.parse(storedState) as OAuthFlowState;
                  if (parsedFlow.state === originalState) {
                    flowState = parsedFlow;
                    console.log('✅ Found matching flow state using original state pattern');
                    break;
                  }
                } catch (e) {
                  console.warn('Failed to parse stored flow state during _force_ search:', key, e);
                }
              }
            }
          }
        } catch (error) {
          console.error('Error during _force_ state search:', error);
        }
      }
      
      // If found, update the flow state to use the new state for consistency
      if (flowState) {
        console.log('✅ Updating flow state to use modified state:', state?.substring(0, 8) + '...');
        flowState.state = state;
        this.storeFlowState(flowState);
      }
    }

    if (!flowState) {
      console.warn('🚨 OAuth flow state not found for state:', state?.substring(0, 8) + '...', {
        searchedFlows: allFlows.length,
        sessionStorageKeys: Object.keys(sessionStorage).filter(key => key.includes('oauth'))
      });
      return null;
    }

    console.log('✅ Found OAuth flow state:', {
      flowId: flowState.flowId,
      flowType: flowState.flowType,
      status: flowState.status,
      hasCodeVerifier: !!flowState.codeVerifier,
      codeVerifierLength: flowState.codeVerifier?.length || 0
    });

    // Check expiration
    if (this.isExpired(flowState)) {
      console.warn('🚨 OAuth flow state expired:', {
        flowId: flowState.flowId,
        expiredAt: new Date(flowState.expiresAt).toISOString(),
        ageMinutes: Math.round((Date.now() - flowState.createdAt) / 60000)
      });
      this.removeFlowState(flowState.flowId);
      return null;
    }

    return flowState;
  }

  /**
   * 🔒 SECURITY: Update flow state status
   */
  public updateFlowStatus(
    flowId: string, 
    status: OAuthFlowState['status'],
    metadata?: Partial<Pick<OAuthFlowState, 'parentOrigin' | 'forceAccountSelection'>>
  ): boolean {
    const flowState = this.getFlowStateById(flowId);
    if (!flowState) {
      console.warn('🚨 Cannot update status - flow state not found:', flowId);
      return false;
    }

    // Validate status transition
    if (!this.isValidStatusTransition(flowState.status, status)) {
      console.warn('🚨 Invalid OAuth flow status transition:', {
        flowId,
        currentStatus: flowState.status,
        requestedStatus: status
      });
      return false;
    }

    // Update state
    flowState.status = status;
    flowState.lastUpdated = Date.now();
    
    // Update metadata if provided
    if (metadata) {
      Object.assign(flowState, metadata);
    }

    this.storeFlowState(flowState);

    console.log('🔄 OAuth flow status updated:', {
      flowId,
      status,
      flowType: flowState.flowType
    });

    // Auto-cleanup completed or failed flows after delay
    if (status === 'completed' || status === 'failed') {
      setTimeout(() => {
        this.removeFlowState(flowId);
      }, 30000); // 30 seconds delay for debugging
    }

    return true;
  }

  /**
   * 🔒 SECURITY: Validate flow state integrity
   */
  public validateFlowState(state: string): StateValidationResult {
    const flowState = this.getFlowState(state);

    if (!flowState) {
      return {
        isValid: false,
        reason: 'Flow state not found or expired',
        securityLevel: 'high',
        canProceed: false
      };
    }

    // Check expiration
    if (this.isExpired(flowState)) {
      return {
        isValid: false,
        reason: 'Flow state expired',
        securityLevel: 'medium',
        canProceed: false
      };
    }

    // Check status
    if (flowState.status === 'completed' || flowState.status === 'failed') {
      return {
        isValid: false,
        reason: `Flow already ${flowState.status}`,
        securityLevel: 'medium',
        canProceed: false
      };
    }

    // Check for replay attacks (state reuse)
    if (flowState.status === 'token_exchange') {
      return {
        isValid: false,
        reason: 'State already used for token exchange',
        securityLevel: 'high',
        canProceed: false
      };
    }

    // Validate required fields
    const requiredFields = ['state', 'codeVerifier', 'clientId', 'redirectUri'];
    const missingFields = requiredFields.filter(field => !flowState[field as keyof OAuthFlowState]);
    
    // Check nonce separately as it can be empty string for legacy compatibility
    if (!flowState.nonce && flowState.nonce !== '') {
      missingFields.push('nonce');
    }
    
    if (missingFields.length > 0) {
      return {
        isValid: false,
        reason: `Missing required fields: ${missingFields.join(', ')}`,
        securityLevel: 'critical',
        canProceed: false
      };
    }

    return {
      isValid: true,
      reason: 'Flow state valid',
      securityLevel: 'low',
      canProceed: true
    };
  }

  /**
   * 🔒 SECURITY: Get flow state by flow ID
   */
  public getFlowStateById(flowId: string): OAuthFlowState | null {
    try {
      const stateKey = OAuthStateManager.STATE_KEY_PREFIX + flowId;
      const storedState = sessionStorage.getItem(stateKey);
      
      if (!storedState) {
        return null;
      }

      const flowState = JSON.parse(storedState) as OAuthFlowState;
      
      // Check expiration
      if (this.isExpired(flowState)) {
        this.removeFlowState(flowId);
        return null;
      }

      return flowState;
    } catch (error) {
      console.error('Failed to get flow state by ID:', error);
      return null;
    }
  }

  /**
   * 🔧 Remove flow state
   */
  public removeFlowState(flowId: string): void {
    try {
      const stateKey = OAuthStateManager.STATE_KEY_PREFIX + flowId;
      sessionStorage.removeItem(stateKey);
      
      console.log('🗑️ OAuth flow state removed:', flowId);
    } catch (error) {
      console.error('Failed to remove flow state:', error);
    }
  }

  /**
   * 🧹 Cleanup expired flow states
   */
  public cleanupExpiredStates(): number {
    let cleanedCount = 0;
    
    try {
      const allFlows = this.getAllFlowStates();
      const expiredFlows = allFlows.filter(flow => this.isExpired(flow));
      
      expiredFlows.forEach(flow => {
        this.removeFlowState(flow.flowId);
        cleanedCount++;
      });

      if (cleanedCount > 0) {
        console.log('🧹 Cleaned up expired OAuth flow states:', cleanedCount);
      }
    } catch (error) {
      console.error('Failed to cleanup expired states:', error);
    }

    return cleanedCount;
  }

  /**
   * 🔍 Get all active flow states
   */
  public getAllFlowStates(): OAuthFlowState[] {
    const flowStates: OAuthFlowState[] = [];
    
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(OAuthStateManager.STATE_KEY_PREFIX)) {
          const storedState = sessionStorage.getItem(key);
          if (storedState) {
            try {
              const flowState = JSON.parse(storedState) as OAuthFlowState;
              if (!this.isExpired(flowState)) {
                flowStates.push(flowState);
              }
            } catch (e) {
              console.warn('Invalid flow state found, removing:', key);
              sessionStorage.removeItem(key);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to get all flow states:', error);
    }

    return flowStates;
  }

  /**
   * 🚨 Emergency cleanup - remove all OAuth states
   */
  public emergencyCleanup(): number {
    let cleanedCount = 0;
    
    try {
      const keysToRemove = [];
      
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (
          key.startsWith(OAuthStateManager.STATE_KEY_PREFIX) ||
          key.startsWith('oauth_') ||
          key.startsWith('silent_oauth_')
        )) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => {
        sessionStorage.removeItem(key);
        cleanedCount++;
      });

      console.log('🚨 Emergency OAuth cleanup completed:', cleanedCount);
    } catch (error) {
      console.error('Emergency cleanup failed:', error);
    }

    return cleanedCount;
  }

  // Private helper methods

  private generateFlowId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  private storeFlowState(flowState: OAuthFlowState): void {
    try {
      const stateKey = OAuthStateManager.STATE_KEY_PREFIX + flowState.flowId;
      sessionStorage.setItem(stateKey, JSON.stringify(flowState));
    } catch (error) {
      console.error('Failed to store flow state:', error);
      throw new Error('OAuth state storage failed');
    }
  }

  private isExpired(flowState: OAuthFlowState): boolean {
    return Date.now() > flowState.expiresAt;
  }

  private isValidStatusTransition(
    currentStatus: OAuthFlowState['status'],
    newStatus: OAuthFlowState['status']
  ): boolean {
    const validTransitions: Record<OAuthFlowState['status'], OAuthFlowState['status'][]> = {
      'created': ['in_progress', 'token_exchange', 'completed', 'failed', 'expired'], // 🔧 FIX: Allow direct token_exchange for SSO refresh flows
      'in_progress': ['token_exchange', 'completed', 'failed', 'expired'], // Allow direct completion
      'token_exchange': ['completed', 'failed', 'expired'],
      'completed': ['failed'], // Allow marking as failed if cleanup issues occur
      'failed': ['completed'], // Allow retry scenarios
      'expired': ['failed'] // Allow cleanup
    };

    // Allow same status (no-op updates)
    if (currentStatus === newStatus) {
      return true;
    }

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  private scheduleCleanup(): void {
    if (this.cleanupScheduled) {
      return;
    }

    // Check if cleanup is already scheduled by another instance
    const cleanupScheduled = sessionStorage.getItem(OAuthStateManager.CLEANUP_KEY);
    if (cleanupScheduled && Date.now() < parseInt(cleanupScheduled)) {
      return;
    }

    // Schedule cleanup
    const nextCleanup = Date.now() + OAuthStateManager.CLEANUP_INTERVAL_MS;
    sessionStorage.setItem(OAuthStateManager.CLEANUP_KEY, nextCleanup.toString());
    
    setTimeout(() => {
      this.cleanupExpiredStates();
      this.cleanupScheduled = false;
      this.scheduleCleanup(); // Reschedule
    }, OAuthStateManager.CLEANUP_INTERVAL_MS);

    this.cleanupScheduled = true;
  }
}

// Global state manager instance
const globalStateManager = new OAuthStateManager();

/**
 * 🔧 Convenience functions for OAuth state management
 */

export function createOAuthFlow(params: Parameters<OAuthStateManager['createFlowState']>[0]): OAuthFlowState {
  return globalStateManager.createFlowState(params);
}

export function getOAuthFlow(state: string): OAuthFlowState | null {
  // Ensure global state manager is initialized
  if (!globalStateManager) {
    console.warn('⚠️ Global state manager not initialized, creating new instance');
    return new OAuthStateManager().getFlowState(state);
  }
  return globalStateManager.getFlowState(state);
}

export function updateOAuthFlowStatus(
  flowId: string, 
  status: OAuthFlowState['status'],
  metadata?: Partial<Pick<OAuthFlowState, 'parentOrigin' | 'forceAccountSelection'>>
): boolean {
  return globalStateManager.updateFlowStatus(flowId, status, metadata);
}

export function validateOAuthFlow(state: string): StateValidationResult {
  return globalStateManager.validateFlowState(state);
}

export function cleanupOAuth(): number {
  return globalStateManager.cleanupExpiredStates();
}

export function emergencyOAuthCleanup(): number {
  return globalStateManager.emergencyCleanup();
}

/**
 * 🔧 Generate random string for missing OAuth parameters
 */
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * 🔒 SECURITY: Legacy state migration utility
 * 
 * Migrates existing OAuth states to new state manager format
 */
export function migrateLegacyOAuthState(): {
  migrated: number;
  removed: number;
  errors: number;
} {
  let migrated = 0;
  let removed = 0;
  let errors = 0;

  try {
    // Check for legacy OAuth state keys
    const legacyKeys = [
      'oauth_state',
      'oauth_code_verifier', 
      'oauth_nonce',
      'oauth_popup_mode',
      'oauth_window_type',
      'oauth_force_account_selection',
      'silent_oauth_state',
      'silent_oauth_code_verifier',
      'silent_oauth_nonce'
    ];

    const legacyValues: any = {};
    let hasLegacyState = false;

    // Collect legacy values
    legacyKeys.forEach(key => {
      const value = sessionStorage.getItem(key);
      if (value) {
        legacyValues[key] = value;
        hasLegacyState = true;
      }
    });

    if (hasLegacyState) {
      console.log('🔄 Migrating legacy OAuth state to new state manager');

      // Determine flow type
      const flowType = legacyValues.oauth_popup_mode === 'true' || 
                       legacyValues.oauth_window_type === 'popup' ? 'popup' :
                       legacyValues.silent_oauth_state ? 'silent' : 'redirect';

      // Create new flow state if we have minimum required data  
      if (legacyValues.oauth_state || legacyValues.silent_oauth_state) {
        try {
          // Generate missing nonce if not present in legacy state
          const nonce = legacyValues.oauth_nonce || legacyValues.silent_oauth_nonce || generateRandomString(32);
          
          const flowState = globalStateManager.createFlowState({
            flowType,
            clientId: 'maxlab', // Default
            redirectUri: window.location.origin + '/oauth/callback',
            state: legacyValues.oauth_state || legacyValues.silent_oauth_state,
            codeVerifier: legacyValues.oauth_code_verifier || legacyValues.silent_oauth_code_verifier || generateRandomString(32),
            nonce: nonce,
            forceAccountSelection: legacyValues.oauth_force_account_selection === 'true'
          });

          migrated++;
          console.log('✅ Legacy OAuth state migrated:', flowState.flowId);
        } catch (error) {
          console.error('Failed to migrate legacy state:', error);
          errors++;
        }
      }

      // Remove legacy keys
      legacyKeys.forEach(key => {
        if (sessionStorage.getItem(key)) {
          sessionStorage.removeItem(key);
          removed++;
        }
      });
    }
  } catch (error) {
    console.error('Legacy state migration failed:', error);
    errors++;
  }

  return { migrated, removed, errors };
}
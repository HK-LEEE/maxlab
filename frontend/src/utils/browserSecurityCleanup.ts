/**
 * Browser Security Cleanup Utility
 * Comprehensive browser state cleanup for secure user switching and logout
 */

export interface CleanupOptions {
  clearLocalStorage?: boolean;
  clearSessionStorage?: boolean;
  clearCookies?: boolean;
  clearIndexedDB?: boolean;
  clearCacheStorage?: boolean;
  clearWebSQL?: boolean;
  preserveKeys?: string[];
  cookieDomains?: string[];
}

export interface CleanupResult {
  success: boolean;
  cleared: {
    localStorage: number;
    sessionStorage: number;
    cookies: number;
    indexedDB: string[];
    cacheStorage: string[];
    webSQL: boolean;
  };
  errors: string[];
  duration: number;
}

export class BrowserSecurityCleanup {
  private static instance: BrowserSecurityCleanup;

  private constructor() {}

  static getInstance(): BrowserSecurityCleanup {
    if (!BrowserSecurityCleanup.instance) {
      BrowserSecurityCleanup.instance = new BrowserSecurityCleanup();
    }
    return BrowserSecurityCleanup.instance;
  }

  /**
   * Perform comprehensive security cleanup
   */
  async performSecurityCleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
    const startTime = performance.now();
    const result: CleanupResult = {
      success: true,
      cleared: {
        localStorage: 0,
        sessionStorage: 0,
        cookies: 0,
        indexedDB: [],
        cacheStorage: [],
        webSQL: false
      },
      errors: [],
      duration: 0
    };

    const {
      clearLocalStorage = true,
      clearSessionStorage = true,
      clearCookies = true,
      clearIndexedDB = true,
      clearCacheStorage = true,
      clearWebSQL = true,
      preserveKeys = [],
      cookieDomains = []
    } = options;

    console.log('🔒 Starting comprehensive browser security cleanup...');

    // 1. Clear localStorage
    if (clearLocalStorage) {
      try {
        const clearedCount = this.clearLocalStorage(preserveKeys);
        result.cleared.localStorage = clearedCount;
        console.log(`✅ Cleared ${clearedCount} localStorage items`);
      } catch (error) {
        result.errors.push(`localStorage: ${error}`);
        result.success = false;
      }
    }

    // 2. Clear sessionStorage
    if (clearSessionStorage) {
      try {
        const clearedCount = this.clearSessionStorage(preserveKeys);
        result.cleared.sessionStorage = clearedCount;
        console.log(`✅ Cleared ${clearedCount} sessionStorage items`);
      } catch (error) {
        result.errors.push(`sessionStorage: ${error}`);
        result.success = false;
      }
    }

    // 3. Clear cookies
    if (clearCookies) {
      try {
        const clearedCount = await this.clearCookies(cookieDomains);
        result.cleared.cookies = clearedCount;
        console.log(`✅ Cleared ${clearedCount} cookies`);
      } catch (error) {
        result.errors.push(`cookies: ${error}`);
        result.success = false;
      }
    }

    // 4. Clear IndexedDB
    if (clearIndexedDB) {
      try {
        const clearedDbs = await this.clearIndexedDB();
        result.cleared.indexedDB = clearedDbs;
        console.log(`✅ Cleared ${clearedDbs.length} IndexedDB databases`);
      } catch (error) {
        result.errors.push(`indexedDB: ${error}`);
        result.success = false;
      }
    }

    // 5. Clear Cache Storage
    if (clearCacheStorage) {
      try {
        const clearedCaches = await this.clearCacheStorage();
        result.cleared.cacheStorage = clearedCaches;
        console.log(`✅ Cleared ${clearedCaches.length} cache storages`);
      } catch (error) {
        result.errors.push(`cacheStorage: ${error}`);
        result.success = false;
      }
    }

    // 6. Clear WebSQL (deprecated but still might be used)
    if (clearWebSQL) {
      try {
        result.cleared.webSQL = await this.clearWebSQL();
        if (result.cleared.webSQL) {
          console.log('✅ Cleared WebSQL databases');
        }
      } catch (error) {
        result.errors.push(`webSQL: ${error}`);
        // Don't fail for WebSQL as it's deprecated
      }
    }

    result.duration = performance.now() - startTime;
    console.log(`🔒 Security cleanup completed in ${result.duration.toFixed(2)}ms`);

    return result;
  }

  /**
   * Clear localStorage with preservation option
   */
  private clearLocalStorage(preserveKeys: string[]): number {
    let clearedCount = 0;
    const keysToRemove: string[] = [];

    // Collect keys to remove
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !preserveKeys.includes(key)) {
        keysToRemove.push(key);
      }
    }

    // Remove collected keys
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      clearedCount++;
    });

    return clearedCount;
  }

  /**
   * Clear sessionStorage with preservation option
   */
  private clearSessionStorage(preserveKeys: string[]): number {
    let clearedCount = 0;
    const keysToRemove: string[] = [];

    // Collect keys to remove
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && !preserveKeys.includes(key)) {
        keysToRemove.push(key);
      }
    }

    // Remove collected keys
    keysToRemove.forEach(key => {
      sessionStorage.removeItem(key);
      clearedCount++;
    });

    return clearedCount;
  }

  /**
   * Clear cookies comprehensively
   */
  private async clearCookies(additionalDomains: string[] = []): Promise<number> {
    let clearedCount = 0;
    
    // Get all domains to clear cookies from
    const domains = [
      window.location.hostname,
      `.${window.location.hostname}`,
      'localhost',
      '.localhost',
      ...additionalDomains
    ];

    // Get all paths
    const paths = ['/', window.location.pathname];
    
    // Parse existing cookies
    const cookies = document.cookie.split(';').map(c => c.trim());
    
    cookies.forEach(cookie => {
      if (!cookie) return;
      
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
      
      // Clear cookie for all domain/path combinations
      domains.forEach(domain => {
        paths.forEach(path => {
          // Standard removal
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; domain=${domain}`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; domain=${domain}; secure`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; domain=${domain}; samesite=strict`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; domain=${domain}; secure; samesite=strict`;
          
          // Without domain
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; secure`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; samesite=strict`;
        });
      });
      
      clearedCount++;
    });

    return clearedCount;
  }

  /**
   * Clear IndexedDB databases
   */
  private async clearIndexedDB(): Promise<string[]> {
    const clearedDatabases: string[] = [];

    if (!('indexedDB' in window)) {
      console.warn('IndexedDB not supported');
      return clearedDatabases;
    }

    try {
      // Get list of databases if available (not supported in all browsers)
      if ('databases' in indexedDB) {
        const databases = await (indexedDB as any).databases();
        
        for (const db of databases) {
          try {
            await this.deleteDatabase(db.name);
            clearedDatabases.push(db.name);
          } catch (error) {
            console.warn(`Failed to delete IndexedDB ${db.name}:`, error);
          }
        }
      } else {
        // Fallback: try to delete known databases
        const knownDatabases = [
          'maxlab-db',
          'auth-cache',
          'user-data',
          'app-state',
          '_ionicstorage'
        ];

        for (const dbName of knownDatabases) {
          try {
            await this.deleteDatabase(dbName);
            clearedDatabases.push(dbName);
          } catch (error) {
            // Ignore errors for non-existent databases
          }
        }
      }
    } catch (error) {
      console.error('Failed to clear IndexedDB:', error);
    }

    return clearedDatabases;
  }

  /**
   * Delete a specific IndexedDB database
   */
  private deleteDatabase(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const deleteReq = indexedDB.deleteDatabase(name);
      
      deleteReq.onsuccess = () => {
        console.log(`Deleted IndexedDB: ${name}`);
        resolve();
      };
      
      deleteReq.onerror = () => {
        reject(new Error(`Failed to delete IndexedDB: ${name}`));
      };
      
      deleteReq.onblocked = () => {
        console.warn(`Delete blocked for IndexedDB: ${name}`);
        // Still resolve as the database will be deleted when unblocked
        resolve();
      };
    });
  }

  /**
   * Clear Cache Storage (Service Worker caches)
   */
  private async clearCacheStorage(): Promise<string[]> {
    const clearedCaches: string[] = [];

    if (!('caches' in window)) {
      console.warn('Cache Storage not supported');
      return clearedCaches;
    }

    try {
      const cacheNames = await caches.keys();
      
      for (const cacheName of cacheNames) {
        try {
          await caches.delete(cacheName);
          clearedCaches.push(cacheName);
        } catch (error) {
          console.warn(`Failed to delete cache ${cacheName}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to clear Cache Storage:', error);
    }

    return clearedCaches;
  }

  /**
   * Clear WebSQL databases (deprecated but might still be used)
   */
  private async clearWebSQL(): Promise<boolean> {
    if (!('openDatabase' in window)) {
      return false;
    }

    try {
      // WebSQL is deprecated and there's no standard way to list databases
      // This is a best-effort attempt
      const db = (window as any).openDatabase('', '', '', '');
      if (db) {
        db.transaction((tx: any) => {
          tx.executeSql("SELECT name FROM sqlite_master WHERE type='table'", [], 
            (_tx: any, results: any) => {
              for (let i = 0; i < results.rows.length; i++) {
                const tableName = results.rows.item(i).name;
                if (!tableName.startsWith('__')) {
                  tx.executeSql(`DROP TABLE IF EXISTS ${tableName}`);
                }
              }
            }
          );
        });
        return true;
      }
    } catch (error) {
      // WebSQL might not be available or accessible
      console.debug('WebSQL cleanup skipped:', error);
    }

    return false;
  }

  /**
   * Get storage usage report
   */
  async getStorageReport(): Promise<{
    localStorage: { count: number; size: number };
    sessionStorage: { count: number; size: number };
    cookies: { count: number };
    indexedDB: { databases: string[] };
    cacheStorage: { caches: string[] };
  }> {
    const report = {
      localStorage: { count: 0, size: 0 },
      sessionStorage: { count: 0, size: 0 },
      cookies: { count: 0 },
      indexedDB: { databases: [] as string[] },
      cacheStorage: { caches: [] as string[] }
    };

    // localStorage
    report.localStorage.count = localStorage.length;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key) || '';
        report.localStorage.size += key.length + value.length;
      }
    }

    // sessionStorage
    report.sessionStorage.count = sessionStorage.length;
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        const value = sessionStorage.getItem(key) || '';
        report.sessionStorage.size += key.length + value.length;
      }
    }

    // Cookies
    report.cookies.count = document.cookie.split(';').filter(c => c.trim()).length;

    // IndexedDB
    if ('databases' in indexedDB) {
      try {
        const databases = await (indexedDB as any).databases();
        report.indexedDB.databases = databases.map((db: any) => db.name);
      } catch (error) {
        console.debug('Could not list IndexedDB databases');
      }
    }

    // Cache Storage
    if ('caches' in window) {
      try {
        report.cacheStorage.caches = await caches.keys();
      } catch (error) {
        console.debug('Could not list cache storage');
      }
    }

    return report;
  }
}

// Export singleton instance
export const browserSecurityCleanup = BrowserSecurityCleanup.getInstance();

export default BrowserSecurityCleanup;
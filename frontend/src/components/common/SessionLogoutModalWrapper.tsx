/**
 * Session Logout Modal Wrapper
 * Provides a simple way to integrate the session logout modal with useSecureLogout hook
 */

import React from 'react';
import { SessionLogoutModal } from './SessionLogoutModal';
import { useSecureLogout } from '../../hooks/useSecureLogout';

export const SessionLogoutModalWrapper: React.FC = () => {
  const { sessionLogout } = useSecureLogout();
  
  console.log('🔓 SessionLogoutModalWrapper: Rendered with modal state:', sessionLogout.isModalOpen);

  return (
    <SessionLogoutModal
      isOpen={sessionLogout.isModalOpen}
      onClose={sessionLogout.closeModal}
      sessionsData={sessionLogout.sessionsData}
      isLoading={false} // Loading state is handled in the hook
      onLogout={sessionLogout.executeLogout}
      fetchActiveSessions={sessionLogout.fetchActiveSessions}
    />
  );
};